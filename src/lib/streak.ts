// Napi cél és sorozat (streak). Tiszta függvények: a szerver (fiók) és a böngésző (vendég) is ezt használja.
// A napok "ÉÉÉÉ-HH-NN" alakú szövegek a felhasználó saját időzónája szerint.

export type StreakState = { current: number; longest: number; lastDay: string | null; freezes: number };

export const MAX_FREEZES = 2;
/** Ennyi egymást követő teljesített nap után jár egy sorozatmentő. */
export const FREEZE_EVERY = 7;
export const DAILY_GOALS = [10, 20, 30, 50, 100] as const;
export const DEFAULT_DAILY_GOAL = 20;

export const EMPTY_STREAK: StreakState = { current: 0, longest: 0, lastDay: null, freezes: 0 };

function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

export function dayDiff(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * 86400000).toISOString().slice(0, 10);
}

/** A nap a megadott időzónában (pl. "Europe/Budapest"). Hibás zónánál UTC. */
export function dayInZone(date: Date, timeZone: string | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Az óra (0–23) a megadott időzónában. */
export function hourInZone(date: Date, timeZone: string | null | undefined): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || "UTC", hour: "2-digit", hourCycle: "h23" }).format(date);
    return Number(h) % 24;
  } catch {
    return date.getUTCHours();
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ha ma teljesült a napi cél: a sorozat nő. A kimaradt napokat a sorozatmentők fedezik, ha van elég;
 * különben a sorozat újraindul 1-ről. Visszaadja a felhasznált sorozatmentőket és a fedezett napokat is.
 */
export function applyGoalMet(s: StreakState, today: string): { state: StreakState; frozenDays: string[]; earnedFreeze: boolean } {
  if (s.lastDay === today) return { state: s, frozenDays: [], earnedFreeze: false };
  let current = 1;
  let freezes = s.freezes;
  const frozenDays: string[] = [];
  if (s.lastDay && s.current > 0) {
    const gap = dayDiff(s.lastDay, today) - 1;
    if (gap < 0) return { state: s, frozenDays: [], earnedFreeze: false }; // óraátállítás / visszafelé járó idő
    if (gap === 0) current = s.current + 1;
    else if (gap <= freezes) {
      freezes -= gap;
      for (let i = 1; i <= gap; i++) frozenDays.push(addDays(s.lastDay, i));
      current = s.current + 1;
    }
  }
  let earnedFreeze = false;
  if (current % FREEZE_EVERY === 0 && freezes < MAX_FREEZES) {
    freezes += 1;
    earnedFreeze = true;
  }
  return { state: { current, longest: Math.max(s.longest, current), lastDay: today, freezes }, frozenDays, earnedFreeze };
}

/**
 * A ma látható sorozat. Ha tegnap (vagy a sorozatmentőkkel fedezhető napokon) teljesült a cél, még él;
 * ha már nem menthető, 0. A mai napot nem kell még teljesíteni, hogy a sorozat látszódjon.
 */
export function visibleStreak(s: StreakState, today: string): { current: number; alive: boolean; doneToday: boolean; atRisk: boolean } {
  if (!s.lastDay || s.current === 0) return { current: 0, alive: false, doneToday: false, atRisk: false };
  const gap = dayDiff(s.lastDay, today);
  if (gap <= 0) return { current: s.current, alive: true, doneToday: true, atRisk: false };
  // gap-1 nap maradt ki eddig (a mai még folyamatban van).
  if (gap - 1 <= s.freezes) return { current: s.current, alive: true, doneToday: false, atRisk: true };
  return { current: 0, alive: false, doneToday: false, atRisk: false };
}
