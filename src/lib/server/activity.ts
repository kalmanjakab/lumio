import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { applyGoalMet, addDays, dayInZone, EMPTY_STREAK, type StreakState } from "@/lib/streak";
import { loadUserSettings } from "./settings";

export type ActivitySummary = { today: string; items: number; goal: number; goalMet: boolean; streak: StreakState };

function toState(r: { current: number; longest: number; lastDay: string | null; freezes: number } | undefined): StreakState {
  return r ? { current: r.current, longest: r.longest, lastDay: r.lastDay, freezes: r.freezes } : EMPTY_STREAK;
}

export async function getActivitySummary(userId: string): Promise<ActivitySummary> {
  const settings = await loadUserSettings(userId);
  const today = dayInZone(new Date(), settings.timezone);
  const [act, st] = await Promise.all([
    db.select().from(schema.dailyActivity).where(and(eq(schema.dailyActivity.userId, userId), eq(schema.dailyActivity.day, today))),
    db.select().from(schema.streaks).where(eq(schema.streaks.userId, userId)),
  ]);
  return { today, items: act[0]?.items ?? 0, goal: settings.dailyGoal, goalMet: act[0]?.goalMet ?? false, streak: toState(st[0]) };
}

export type ActivityEvent = { goalJustMet: boolean; earnedFreeze: boolean; frozenDays: string[] };

/**
 * Megválaszolt kártyák hozzáadása a mai naphoz. Ha ezzel teljesül a napi cél, a sorozat frissül
 * (sorozatmentőkkel együtt). Tranzakcióban, hogy két párhuzamos kérés ne számoljon kétszer.
 */
export async function recordActivity(userId: string, items: number, reviews: number): Promise<ActivitySummary & ActivityEvent> {
  const settings = await loadUserSettings(userId);
  const today = dayInZone(new Date(), settings.timezone);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.dailyActivity)
      .values({ userId, day: today, items, reviews })
      .onConflictDoUpdate({
        target: [schema.dailyActivity.userId, schema.dailyActivity.day],
        set: { items: sql`${schema.dailyActivity.items} + excluded.items`, reviews: sql`${schema.dailyActivity.reviews} + excluded.reviews` },
      })
      .returning();
    const [st] = await tx.select().from(schema.streaks).where(eq(schema.streaks.userId, userId)).for("update");
    let state = toState(st);
    let ev: ActivityEvent = { goalJustMet: false, earnedFreeze: false, frozenDays: [] };
    if (row && !row.goalMet && row.items >= settings.dailyGoal) {
      const r = applyGoalMet(state, today);
      state = r.state;
      ev = { goalJustMet: true, earnedFreeze: r.earnedFreeze, frozenDays: r.frozenDays };
      await tx.update(schema.dailyActivity).set({ goalMet: true }).where(and(eq(schema.dailyActivity.userId, userId), eq(schema.dailyActivity.day, today)));
      for (const d of r.frozenDays) {
        await tx
          .insert(schema.dailyActivity)
          .values({ userId, day: d, frozen: true })
          .onConflictDoUpdate({ target: [schema.dailyActivity.userId, schema.dailyActivity.day], set: { frozen: true } });
      }
      await tx
        .insert(schema.streaks)
        .values({ userId, ...state })
        .onConflictDoUpdate({ target: schema.streaks.userId, set: { ...state, updatedAt: sql`now()` } });
    }
    return { today, items: row?.items ?? items, goal: settings.dailyGoal, goalMet: (row?.goalMet ?? false) || ev.goalJustMet, streak: state, ...ev };
  });
}

export type HistoryDay = { day: string; items: number; reviews: number; goalMet: boolean; frozen: boolean };

export async function getActivityHistory(userId: string, days = 182): Promise<{ today: string; days: HistoryDay[] }> {
  const settings = await loadUserSettings(userId);
  const today = dayInZone(new Date(), settings.timezone);
  const from = addDays(today, -days);
  const rows = await db
    .select()
    .from(schema.dailyActivity)
    .where(and(eq(schema.dailyActivity.userId, userId), gte(schema.dailyActivity.day, from)));
  return { today, days: rows.map((r) => ({ day: r.day, items: r.items, reviews: r.reviews, goalMet: r.goalMet, frozen: r.frozen })) };
}

/** A layout számára: fióknál a mai állapot, vendégnél null (a böngésző számolja). */
export async function getLayoutActivity(): Promise<ActivitySummary | null> {
  const { getViewer } = await import("./auth");
  const v = await getViewer();
  if (v.kind !== "user") return null;
  try {
    return await getActivitySummary(v.user.id);
  } catch {
    return null;
  }
}
