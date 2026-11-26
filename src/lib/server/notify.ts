import "server-only";
import { sendNotification } from "web-push";
import { createTranslator } from "next-intl";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import hu from "../../../messages/hu.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import de from "../../../messages/de.json";
import type { Locale } from "@/lib/validation";
import { loadUserSettings } from "./settings";

const MESSAGES = { hu, en, fr, de } as const;

export type NotificationKind =
  | "dailyReminder"
  | "streakRisk"
  | "nudge"
  | "weekly"
  | "assignmentNew"
  | "assignmentDue"
  | "milestone"
  | "freezeUsed"
  | "test";

// ---------- VAPID (a push üzenetek aláírókulcsa) ----------

/** A VAPID kulcspár a környezeti változókból. Ha nincs beállítva, a push ki van kapcsolva (az appon belüli értesítések működnek). */
export function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(publicKey) || !/^[A-Za-z0-9_-]{40,50}$/.test(privateKey)) return null;
  const raw = (process.env.VAPID_SUBJECT || "").trim();
  const subject = /^(mailto:|https:\/\/)/.test(raw) ? raw : "https://flashly.vercel.app";
  return { publicKey, privateKey, subject };
}

export function pushEnabled() {
  return vapidConfig() !== null;
}

// ---------- Szövegek ----------

export function notificationText(locale: Locale, kind: NotificationKind, params: Record<string, string | number>) {
  const t = createTranslator({ locale, messages: MESSAGES[locale] ?? MESSAGES.hu, namespace: "notif" });
  const p = params as Record<string, string | number>;
  return { title: t(`${kind}Title` as "testTitle", p), body: t(`${kind}Body` as "testBody", p) };
}

// ---------- Létrehozás és küldés ----------

/**
 * Értesítés létrehozása az appon belül, és (ha kérik és be van állítva) push üzenetként is.
 * A dedupeKey felhasználónként egyedi: ugyanaz az értesítés kétszer nem megy ki.
 * Visszaadja, hogy új értesítés készült-e.
 */
export async function createNotification(
  userId: string,
  kind: NotificationKind,
  dedupeKey: string,
  params: Record<string, string | number>,
  url: string,
  opts: { push?: boolean } = {},
): Promise<boolean> {
  const rows = await db
    .insert(schema.notifications)
    .values({ userId, kind, dedupeKey, params, url })
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id });
  if (!rows.length) return false;
  if (opts.push !== false) await sendPush(userId, kind, params, url, rows[0]!.id);
  // A régi értesítéseket ritkán takarítjuk (90 napnál régebbiek).
  if (Math.random() < 0.02) {
    void db.execute(sql`delete from notifications where created_at < now() - interval '90 days'`).catch(() => {});
  }
  return true;
}

export type PushResult = { sent: number; failed: number; removed: number };

export async function sendPush(userId: string, kind: NotificationKind, params: Record<string, string | number>, url: string, id: string): Promise<PushResult> {
  const cfg = vapidConfig();
  const res: PushResult = { sent: 0, failed: 0, removed: 0 };
  if (!cfg) return res;
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  if (!subs.length) return res;
  const settings = await loadUserSettings(userId);
  const text = notificationText(settings.locale, kind, params);
  const payload = JSON.stringify({ title: text.title, body: text.body, url, tag: kind, id });
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: cfg,
          TTL: 12 * 3600,
          urgency: kind === "streakRisk" ? "high" : "normal",
          timeout: 8000,
        });
        res.sent++;
        await db.update(schema.pushSubscriptions).set({ failCount: 0, lastSuccessAt: new Date() }).where(eq(schema.pushSubscriptions.id, s.id));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: a böngésző visszavonta a feliratkozást. Sok egymás utáni hibánál is töröljük.
        if (status === 404 || status === 410 || s.failCount >= 5) dead.push(s.id);
        else await db.update(schema.pushSubscriptions).set({ failCount: sql`${schema.pushSubscriptions.failCount} + 1` }).where(eq(schema.pushSubscriptions.id, s.id));
        res.failed++;
      }
    }),
  );
  if (dead.length) {
    await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.userId, userId), inArray(schema.pushSubscriptions.id, dead)));
    res.removed = dead.length;
  }
  return res;
}
