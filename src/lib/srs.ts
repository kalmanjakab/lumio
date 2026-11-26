// Ütemezett ismétlés (spaced repetition) az FSRS algoritmussal (ts-fsrs csomag).
// Az FSRS minden kártyára megbecsli, mennyire stabil az emléke, és úgy ütemezi a következő ismétlést,
// hogy akkor jöjjön, amikor kb. 90% eséllyel még emlékszel rá.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { ProgressEntry } from "./study-types";

/** Egy kártya ismétlési állapota tömören (JSON-ban tárolható, a dátumok ezredmásodpercben). */
export type SrsCard = {
  due: number;
  s: number; // stabilitás (nap)
  d: number; // nehézség (1–10)
  ed: number; // eltelt napok
  sd: number; // ütemezett napok
  ls: number; // tanulási lépés
  reps: number;
  lapses: number;
  state: number; // 0 új, 1 tanulás, 2 ismétlés, 3 újratanulás
  lr: number | null; // utolsó ismétlés
};

export type SrsRating = 1 | 2 | 3 | 4; // Újra, Nehéz, Jó, Könnyű

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 3 * 365, enable_fuzz: true, enable_short_term: true }));

function toCard(c: SrsCard | null | undefined, now: Date): Card {
  if (!c) return createEmptyCard(now);
  return {
    due: new Date(c.due),
    stability: c.s,
    difficulty: c.d,
    elapsed_days: c.ed,
    scheduled_days: c.sd,
    learning_steps: c.ls,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.lr ? new Date(c.lr) : undefined,
  };
}

function fromCard(c: Card): SrsCard {
  return {
    due: c.due.getTime(),
    s: round(c.stability),
    d: round(c.difficulty),
    ed: c.elapsed_days,
    sd: c.scheduled_days,
    ls: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lr: c.last_review ? c.last_review.getTime() : null,
  };
}

const round = (x: number) => Math.round(x * 10000) / 10000;

/** Az értékelés utáni új állapot. */
export function rateCard(card: SrsCard | null | undefined, rating: SrsRating, now = new Date()): SrsCard {
  const res = scheduler.next(toCard(card, now), now, rating as unknown as Grade);
  return fromCard(res.card);
}

/** Mind a négy gombhoz: mikor jönne legközelebb a kártya (ezredmásodperc). */
export function previewDue(card: SrsCard | null | undefined, now = new Date()): Record<SrsRating, number> {
  const p = scheduler.repeat(toCard(card, now), now);
  return {
    1: p[Rating.Again].card.due.getTime(),
    2: p[Rating.Hard].card.due.getTime(),
    3: p[Rating.Good].card.due.getTime(),
    4: p[Rating.Easy].card.due.getTime(),
  };
}

export function isDue(card: SrsCard | null | undefined, now = Date.now()): boolean {
  return Boolean(card && card.state !== 0 && card.due <= now);
}

/** Ennyi napnál stabilabb emlék számít „rögzültnek”. */
export const MASTERED_STABILITY_DAYS = 21;

/**
 * A kártya szintje a megjelenítéshez: 0 = új, 1 = tanulom, 2 = tudom, 3 = rögzült.
 * Az ismétlés (FSRS) és a Tanulás mód haladását is figyelembe veszi; a kettő közül a jobbat mutatja.
 */
export function cardLevel(srs: SrsCard | null | undefined, progress: ProgressEntry | null | undefined): 0 | 1 | 2 | 3 {
  let a: 0 | 1 | 2 | 3 = 0;
  if (srs && srs.state !== 0) {
    if (srs.state === 1 || srs.state === 3) a = 1;
    else a = srs.s >= MASTERED_STABILITY_DAYS ? 3 : 2;
  }
  const b = (progress ? Math.max(0, Math.min(3, progress.level)) : 0) as 0 | 1 | 2 | 3;
  return (Math.max(a, b) as 0 | 1 | 2 | 3);
}

export function levelCounts(cardIds: string[], srs: Record<string, SrsCard>, progress: Record<string, ProgressEntry>) {
  const out = [0, 0, 0, 0];
  for (const id of cardIds) out[cardLevel(srs[id], progress[id])]!++;
  return { newCount: out[0]!, learning: out[1]!, known: out[2]!, mastered: out[3]! };
}

/** Érvényesség-ellenőrzés a szerveren (a kliens számolja az FSRS-t, a szerver csak tárol). */
export function isValidSrs(c: unknown): c is SrsCard {
  if (!c || typeof c !== "object") return false;
  const x = c as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const int = (v: unknown, min: number, max: number) => num(v, min, max) && Number.isInteger(v);
  const year2000 = 946684800000;
  const year2100 = 4102444800000;
  return (
    num(x.due, year2000, year2100) &&
    num(x.s, 0, 1e6) &&
    num(x.d, 0, 11) &&
    int(x.ed, 0, 1e6) &&
    int(x.sd, 0, 1e6) &&
    int(x.ls, 0, 100) &&
    int(x.reps, 0, 1e6) &&
    int(x.lapses, 0, 1e6) &&
    int(x.state, 0, 3) &&
    (x.lr === null || num(x.lr, year2000, year2100))
  );
}
