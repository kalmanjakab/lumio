import { z } from "zod";
import { isValidTimeZone } from "./streak";

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export const usernameSchema = z.string().trim().regex(USERNAME_RE);
export const passwordSchema = z.string().min(8).max(200);
export const loginSchema = z.object({ username: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) });
export const registerSchema = z.object({ username: usernameSchema, password: passwordSchema });
export const uuidSchema = z.uuid();

export const LOCALES = ["hu", "en", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "hu";

export const userSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  locale: z.enum(LOCALES),
  soundEffects: z.boolean(),
  volume: z.number().int().min(0).max(100),
  ttsRate: z.number().min(0.5).max(2),
  defaultFront: z.enum(["term", "definition"]),
  defaultTts: z.boolean(),
  // Napi cél: ennyi megválaszolt kártya számít teljesített napnak.
  dailyGoal: z.number().int().min(5).max(200),
  // A felhasználó időzónája (a napváltáshoz és az értesítések időzítéséhez).
  timezone: z.string().max(64).refine(isValidTimeZone),
  // Ismétlésnél ennyi új (még nem ismételt) kártya jön egy körben.
  newPerSession: z.number().int().min(0).max(50),
  // Értesítések (az appon belül és push üzenetben).
  notifyDaily: z.boolean(),
  notifyStreak: z.boolean(),
  notifyNudge: z.boolean(),
  notifyWeekly: z.boolean(),
  notifyAssignments: z.boolean(),
  reminderHour: z.number().int().min(7).max(21),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "system",
  locale: "hu",
  soundEffects: true,
  volume: 70,
  ttsRate: 1,
  defaultFront: "term",
  defaultTts: false,
  dailyGoal: 20,
  timezone: "Europe/Budapest",
  newPerSession: 10,
  notifyDaily: true,
  notifyStreak: true,
  notifyNudge: true,
  notifyWeekly: true,
  notifyAssignments: true,
  reminderHour: 18,
};

export const MODES = ["set", "flashcards", "learn", "test", "match", "review", "dictation"] as const;
export type Mode = (typeof MODES)[number];
