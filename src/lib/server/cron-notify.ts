import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { DEFAULT_USER_SETTINGS, userSettingsSchema, type UserSettings } from "@/lib/validation";
import { addDays, dayDiff, dayInZone, hourInZone, isValidTimeZone, visibleStreak, type StreakState } from "@/lib/streak";
import { createNotification } from "./notify";
import { countDueRaw } from "./review";
import { listAssignmentsForUser } from "./assignments";

/** Csendes órák (helyi idő): 22:00 és 08:00 között semmi nem megy ki. */
export const QUIET_START = 22;
export const QUIET_END = 8;
/** A sorozat-figyelmeztetés helyi órája. */
export const STREAK_HOUR = 20;
export const WEEKLY_HOUR = 19;
export const ASSIGNMENT_HOUR = 17;
/** Visszahívó üzenet ennyi kihagyott nap után (utána már nem zaklatunk). */
export const NUDGE_DAYS = [3, 7, 14, 30] as const;
/** Naponta legfeljebb ennyi emlékeztető jellegű push (sorozat, napi, visszahívó). */
const DAILY_REMINDER_CAP = 2;

type Raw = Record<string, unknown>;
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

export type UserSnapshot = {
  id: string;
  createdAt: Date;
  settings: UserSettings;
  streak: StreakState;
  hasPush: boolean;
  /** nap -> megválaszolt kártyák (az utolsó ~8 nap) */
  days: Map<string, number>;
  lastActiveDay: string | null;
  remindersLast18h: number;
  hasAssignmentSoon: boolean;
};

export type Planned = { kind: "streakRisk" | "dailyReminder" | "nudge" | "weekly" | "assignments"; dedupeKey: string; params: Record<string, string | number>; url: string; push: boolean };

/**
 * Tiszta döntési logika (tesztelhető): az adott órában milyen értesítés jár a felhasználónak.
 * Az „assignments” csak jelzés, a konkrét feladatokat a futtató kérdezi le.
 */
export function planForUser(u: UserSnapshot, now: Date): Planned[] {
  const s = u.settings;
  const tz = isValidTimeZone(s.timezone) ? s.timezone : "Europe/Budapest";
  const h = hourInZone(now, tz);
  if (h >= QUIET_START || h < QUIET_END) return [];
  const today = dayInZone(now, tz);
  const items = u.days.get(today) ?? 0;
  const v = visibleStreak(u.streak, today);
  const inactive = u.lastActiveDay ? dayDiff(u.lastActiveDay, today) : null;
  const accountAge = dayDiff(dayInZone(u.createdAt, tz), today);
  const out: Planned[] = [];
  let reminders = u.remindersLast18h;

  if (u.hasPush && reminders < DAILY_REMINDER_CAP) {
    // 1) Sorozat védelme: este, ha még él a sorozat, de ma nincs meg a cél.
    if (s.notifyStreak && h === STREAK_HOUR && v.atRisk && items < s.dailyGoal) {
      out.push({ kind: "streakRisk", dedupeKey: `streak:${today}`, params: { days: v.current }, url: "/review", push: true });
      reminders++;
    }
    // 2) Napi emlékeztető a választott órában, ha ma még nincs meg a cél.
    //    Aki 3+ napja nem tanult, annak már nem ez megy, hanem a ritkább visszahívó üzenet.
    const recentlyActive = inactive === null ? accountAge <= 14 : inactive < 3;
    const streakAlertSoon = s.notifyStreak && v.atRisk && s.reminderHour === STREAK_HOUR;
    if (s.notifyDaily && h === s.reminderHour && items < s.dailyGoal && recentlyActive && !out.length && !streakAlertSoon && reminders < DAILY_REMINDER_CAP) {
      out.push({ kind: "dailyReminder", dedupeKey: `daily:${today}`, params: { goal: s.dailyGoal }, url: "/review", push: true });
      reminders++;
    }
    // 3) Visszahívó: 3, 7, 14 és 30 nap kihagyás után egyszer-egyszer.
    const base = u.lastActiveDay ?? dayInZone(u.createdAt, tz);
    const gap = dayDiff(base, today);
    const nudgeHour = s.notifyDaily ? s.reminderHour : 17;
    if (s.notifyNudge && h === nudgeHour && items === 0 && (NUDGE_DAYS as readonly number[]).includes(gap) && reminders < DAILY_REMINDER_CAP) {
      out.push({ kind: "nudge", dedupeKey: `nudge:${base}:${gap}`, params: { days: gap }, url: "/review", push: true });
      reminders++;
    }
  }

  // 4) Heti összefoglaló vasárnap este, ha volt tanulás a héten (appon belül is).
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (s.notifyWeekly && dow === 0 && h === WEEKLY_HOUR) {
    let weekItems = 0;
    let active = 0;
    for (let i = 0; i < 7; i++) {
      const n = u.days.get(addDays(today, -i)) ?? 0;
      weekItems += n;
      if (n > 0) active++;
    }
    if (weekItems > 0) out.push({ kind: "weekly", dedupeKey: `weekly:${today}`, params: { items: weekItems, active, streak: v.current }, url: "/stats", push: u.hasPush });
  }

  // 5) Feladat határidő-emlékeztető (a részleteket a futtató tölti ki).
  if (s.notifyAssignments && h === ASSIGNMENT_HOUR && u.hasAssignmentSoon) out.push({ kind: "assignments", dedupeKey: "", params: {}, url: "", push: u.hasPush });

  return out;
}

function parseSettings(raw: unknown): UserSettings {
  const parsed = userSettingsSchema.safeParse({ ...DEFAULT_USER_SETTINGS, ...((raw as object) ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_USER_SETTINGS;
}

async function loadSnapshots(): Promise<UserSnapshot[]> {
  const r = await db.execute(sql`
    select u.id, u.created_at, us.settings,
      s.current, s.longest, s.last_day, s.freezes,
      exists (select 1 from push_subscriptions p where p.user_id = u.id) as has_push,
      (select max(day)::text from daily_activity d where d.user_id = u.id and d.items > 0) as last_active,
      (select coalesce(json_agg(json_build_array(d.day::text, d.items)), '[]'::json) from daily_activity d
         where d.user_id = u.id and d.day >= (current_date - 9)) as recent,
      (select count(*)::int from notifications n where n.user_id = u.id
         and n.kind in ('streakRisk', 'dailyReminder', 'nudge') and n.created_at > now() - interval '18 hours') as reminders,
      exists (
        select 1 from assignments a
        join groups g on g.id = a.group_id
        join user_group_access uga on uga.group_id = a.group_id and uga.user_id = u.id and uga.access_version = g.access_version
        where a.due_at between now() and now() + interval '60 hours'
      ) as assignment_soon
    from users u
    left join user_settings us on us.user_id = u.id
    left join streaks s on s.user_id = u.id`);
  return rows<Raw>(r).map((x) => ({
    id: String(x.id),
    createdAt: new Date(x.created_at as string),
    settings: parseSettings(x.settings),
    streak: {
      current: Number(x.current ?? 0),
      longest: Number(x.longest ?? 0),
      lastDay: (x.last_day as string | null) ?? null,
      freezes: Number(x.freezes ?? 0),
    },
    hasPush: Boolean(x.has_push),
    days: new Map(((x.recent as [string, number][] | null) ?? []).map(([d, n]) => [d, Number(n)])),
    lastActiveDay: (x.last_active as string | null) ?? null,
    remindersLast18h: Number(x.reminders ?? 0),
    hasAssignmentSoon: Boolean(x.assignment_soon),
  }));
}

export type CronReport = { users: number; created: number; byKind: Record<string, number> };

/** Óránként fut (Vercel Cron). Minden felhasználóra a helyi ideje szerint dönt. */
export async function runNotifyCron(now = new Date()): Promise<CronReport> {
  const users = await loadSnapshots();
  const report: CronReport = { users: users.length, created: 0, byKind: {} };
  const bump = (k: string) => {
    report.created++;
    report.byKind[k] = (report.byKind[k] ?? 0) + 1;
  };

  const work = users.map((u) => async () => {
    const plan = planForUser(u, now);
    for (const p of plan) {
      if (p.kind === "assignments") {
        const tz = isValidTimeZone(u.settings.timezone) ? u.settings.timezone : "Europe/Budapest";
        const tomorrow = addDays(dayInZone(now, tz), 1);
        const list = await listAssignmentsForUser(u.id, { includePastDays: 0 });
        for (const a of list) {
          if (dayInZone(new Date(a.dueAt), tz) !== tomorrow || a.percent >= 100) continue;
          if (await createNotification(u.id, "assignmentDue", `adue:${a.id}`, { title: a.title, percent: a.percent }, `/sets/${a.materialId}`, { push: p.push })) bump("assignmentDue");
        }
        continue;
      }
      const params = { ...p.params };
      if (p.kind === "dailyReminder") params.due = await countDueRaw(u.id);
      if (await createNotification(u.id, p.kind, p.dedupeKey, params, p.url, { push: p.push })) bump(p.kind);
    }
  });

  // Kis párhuzamossággal, hogy az adatbázis-kapcsolatok ne fogyjanak el.
  const CONCURRENCY = 4;
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < work.length) {
        const job = work[i++]!;
        try {
          await job();
        } catch (err) {
          console.error("[cron:notify] user failed", err instanceof Error ? err.message : "unknown");
        }
      }
    }),
  );
  return report;
}
