import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEFAULT_USER_SETTINGS, LOCALES, userSettingsSchema, type Locale, type UserSettings } from "@/lib/validation";
import { getViewer } from "./auth";
import { aiConfigured } from "./ai";
import type { ClientViewer } from "@/components/providers";

export async function loadUserSettings(userId: string): Promise<UserSettings> {
  const rows = await db.select({ settings: schema.userSettings.settings }).from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
  const merged = { ...DEFAULT_USER_SETTINGS, ...((rows[0]?.settings as object) ?? {}) };
  const parsed = userSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_USER_SETTINGS;
}

export async function getInitialSettings(): Promise<UserSettings> {
  const jar = await cookies();
  const themeCookie = jar.get("flashly_theme")?.value;
  const localeCookie = jar.get("NEXT_LOCALE")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" || themeCookie === "system" ? themeCookie : undefined;
  const locale = (LOCALES as readonly string[]).includes(localeCookie ?? "") ? (localeCookie as Locale) : undefined;
  const v = await getViewer();
  const base = v.kind === "user" ? await loadUserSettings(v.user.id) : DEFAULT_USER_SETTINGS;
  return { ...base, theme: theme ?? base.theme, locale: locale ?? base.locale };
}

export function avatarUrlFor(u: { id: string; avatarPreset: string | null; hasAvatarImage: boolean; avatarVersion: number }) {
  if (u.hasAvatarImage) return `/api/me/avatar?v=${u.avatarVersion}`;
  if (u.avatarPreset && /^a([1-9]|1[0-2])$/.test(u.avatarPreset)) return `/avatars/${u.avatarPreset}.svg`;
  return null;
}

export async function getClientViewer(): Promise<ClientViewer> {
  const v = await getViewer();
  if (v.kind === "guest") return { kind: "guest" };
  return {
    kind: "user",
    username: v.user.username,
    avatarUrl: avatarUrlFor(v.user),
    mustChangePassword: v.user.mustChangePassword,
    ai: v.user.aiEnabled && aiConfigured(),
    aiWelcome: v.user.aiEnabled && v.user.aiWelcome && aiConfigured(),
  };
}
