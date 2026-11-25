import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  customType,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------- Felhasználók és belépés ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  usernameLower: text("username_lower").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarPreset: text("avatar_preset"),
  avatarVersion: integer("avatar_version").notNull().default(0),
  hasAvatarImage: boolean("has_avatar_image").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
});

// A feltöltött profilkép külön táblában, hogy a users lekérdezések ne húzzák magukkal.
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  image: bytea("image").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// A sessions táblában csak a belépési token SHA-256 hash-e van, maga a token soha.
export const sessions = pgTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const adminSessions = pgTable("admin_sessions", {
  idHash: text("id_hash").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

// ---------- Csoportok és anyagok ----------

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  accessVersion: integer("access_version").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const userGroupAccess = pgTable(
  "user_group_access",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    accessVersion: integer("access_version").notNull(),
    unlockedAt: ts("unlocked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

export type GradeThresholds = { g5: number; g4: number; g3: number; g2: number };

// Material = bármilyen tananyag. Most csak "flashcards" típus van, később jöhet "note", "pdf".
export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("flashcards"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    termLang: text("term_lang").notNull().default("en-GB"),
    definitionLang: text("definition_lang").notNull().default("hu-HU"),
    gradeThresholds: jsonb("grade_thresholds").$type<GradeThresholds | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("materials_group_idx").on(t.groupId),
    check("materials_type_check", sql`${t.type} in ('flashcards')`),
  ],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    definition: text("definition").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("cards_material_idx").on(t.materialId, t.position)],
);

// ---------- Haladás és személyes adatok ----------

export const cardProgress = pgTable(
  "card_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    // 0 = új, 1 = tanulás alatt, 2 = ismert, 3 = elsajátított
    level: smallint("level").notNull().default(0),
    streak: smallint("streak").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    lastStudiedAt: ts("last_studied_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index("card_progress_user_material_idx").on(t.userId, t.materialId),
  ],
);

export const studyState = pgTable(
  "study_state",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    state: jsonb("state").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.materialId, t.mode] }),
    index("study_state_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

export const modeSettings = pgTable(
  "mode_settings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    settings: jsonb("settings").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.materialId, t.mode] })],
);

export const starredCards = pgTable(
  "starred_cards",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);

export const testResults = pgTable(
  "test_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    correct: integer("correct").notNull(),
    total: integer("total").notNull(),
    percent: integer("percent").notNull(),
    grade: smallint("grade").notNull(),
    durationMs: integer("duration_ms").notNull(),
    details: jsonb("details").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("test_results_user_idx").on(t.userId, t.materialId, t.createdAt)],
);

export const matchBestTimes = pgTable(
  "match_best_times",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    bestMs: integer("best_ms").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.materialId] })],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- Rendszer ----------

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});
