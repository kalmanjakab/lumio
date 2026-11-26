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
  doublePrecision,
  date,
  uniqueIndex,
  type AnyPgColumn,
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
  // Az AI funkciókat az admin kapcsolja be felhasználónként (alapból ki).
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  // Bekapcsolás után a következő belépéskor egy üdvözlő ablak jelenik meg.
  aiWelcome: boolean("ai_welcome").notNull().default(false),
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
    // Felhasználó saját (privát) készlete. Ilyenkor groupId mindig null, és csak a tulajdonos látja.
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    // Ha másolatként készült: melyik készletből (csak tájékoztató, a forrás törölhető).
    sourceMaterialId: uuid("source_material_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("materials_group_idx").on(t.groupId),
    index("materials_owner_idx").on(t.ownerUserId),
    check("materials_type_check", sql`${t.type} in ('flashcards')`),
    check("materials_owner_group_check", sql`${t.ownerUserId} is null or ${t.groupId} is null`),
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
    // Kép a kártyán (a jelentés oldalán jelenik meg). A kép bájtjai a card_images táblában vannak.
    imageId: uuid("image_id").references((): AnyPgColumn => cardImages.id, { onDelete: "set null" }),
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

// Külső (AI) importok naplója: ezzel szűrjük ki az ismételt beküldéseket.
// Csak hash-eket tárolunk, a kérés tartalmát és az API-kulcsot nem.
export const apiImports = pgTable(
  "api_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Az Idempotency-Key fejléc SHA-256 hash-e (ha a kliens küldött ilyet).
    idempotencyKeyHash: text("idempotency_key_hash").unique(),
    // A normalizált tartalom (cím + kártyák) SHA-256 hash-e.
    contentHash: text("content_hash").notNull(),
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
    cardCount: integer("card_count").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_imports_content_idx").on(t.contentHash, t.createdAt)],
);

// ---------- Képek a kártyákon ----------

// A kép mindig egy készlethez tartozik: a jogosultságot a készleten keresztül ellenőrizzük.
export const cardImages = pgTable(
  "card_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    image: bytea("image").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("card_images_material_idx").on(t.materialId)],
);

// ---------- Ütemezett ismétlés (FSRS) ----------

export const cardReviews = pgTable(
  "card_reviews",
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
    due: ts("due").notNull(),
    stability: doublePrecision("stability").notNull(),
    difficulty: doublePrecision("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    // 0 = új, 1 = tanulás, 2 = ismétlés, 3 = újratanulás (az FSRS állapotai)
    state: smallint("state").notNull().default(0),
    lastReview: ts("last_review"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index("card_reviews_user_due_idx").on(t.userId, t.due),
    index("card_reviews_user_material_idx").on(t.userId, t.materialId),
  ],
);

// ---------- Napi aktivitás és sorozat ----------

// Napi összesítő a felhasználó saját időzónája szerinti naptári napra.
export const dailyActivity = pgTable(
  "daily_activity",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    // Megválaszolt kártyák száma (minden módban).
    items: integer("items").notNull().default(0),
    // Ebből ismétlés módban.
    reviews: integer("reviews").notNull().default(0),
    goalMet: boolean("goal_met").notNull().default(false),
    // Ezt a napot egy „sorozatmentő” fedezte (nem tanult, de nem szakadt meg a sorozat).
    frozen: boolean("frozen").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const streaks = pgTable("streaks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  current: integer("current").notNull().default(0),
  longest: integer("longest").notNull().default(0),
  // Az utolsó nap, amikor a napi cél teljesült (vagy sorozatmentő fedezte).
  lastDay: date("last_day", { mode: "string" }),
  freezes: smallint("freezes").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- Feladatok (tanári kiosztás) ----------

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    dueAt: ts("due_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("assignments_group_idx").on(t.groupId, t.dueAt)],
);

// ---------- Értesítések ----------

// Web Push feliratkozások. Az endpoint a böngésző push-szolgáltatójának címe.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    label: text("label").notNull().default(""),
    failCount: integer("fail_count").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSuccessAt: ts("last_success_at"),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// Az appon belüli értesítések (harang ikon). A dedupeKey akadályozza meg, hogy ugyanaz kétszer menjen ki.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    // A szöveg paraméterei (a megjelenítés a felhasználó nyelvén történik).
    params: jsonb("params").notNull().default({}),
    url: text("url").notNull().default("/"),
    createdAt: ts("created_at").notNull().defaultNow(),
    readAt: ts("read_at"),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// AI hívások naplója: a napi korláthoz és az admin heti statisztikájához. Szöveget nem tárol.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt)],
);
