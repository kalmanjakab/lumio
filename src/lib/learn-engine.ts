// A Tanulás mód motorja (tiszta függvények, tesztelhető).
//
// Minden kártya lépcsőkön megy végig a bekapcsolt kérdéstípusok nehézségi sorrendjében:
// Kártyák (önértékelés) → Feleletválasztós → Írásos. Ha csak egy típus van bekapcsolva, abból kettő kell.
// Szintek: 0 = új, 1 = tanulás alatt, 2 = ismert (egy lépés van hátra), 3 = elsajátított.
// Hibás válasz: egy lépcsőt visszalép, és ugyanabban a körben 2 kérdéssel később visszajön.

import type { GradingLevel } from "./grading";
import { shuffleArray } from "./flashcards-engine";

export type LearnQType = "flashcard" | "mc" | "written";

export type LearnSettings = {
  shuffle: boolean;
  tts: boolean;
  answerWithTerm: boolean;
  answerWithDefinition: boolean;
  typeFlashcards: boolean;
  typeMc: boolean;
  typeWritten: boolean;
  grading: GradingLevel;
  retype: boolean;
  writeMode: { accentBar: boolean; hintButton: boolean };
};

export const DEFAULT_LEARN_SETTINGS: LearnSettings = {
  shuffle: false,
  tts: false,
  answerWithTerm: true,
  answerWithDefinition: true,
  typeFlashcards: false,
  typeMc: true,
  typeWritten: true,
  grading: "lenient",
  retype: false,
  writeMode: { accentBar: true, hintButton: true },
};

export function normalizeLearnSettings(raw: unknown, defaults: Partial<LearnSettings> = {}): LearnSettings {
  const r = (raw ?? {}) as Partial<LearnSettings>;
  const s: LearnSettings = {
    ...DEFAULT_LEARN_SETTINGS,
    ...defaults,
    ...r,
    writeMode: { ...DEFAULT_LEARN_SETTINGS.writeMode, ...(r.writeMode ?? {}) },
  };
  if (!s.answerWithTerm && !s.answerWithDefinition) s.answerWithDefinition = true;
  if (!s.typeFlashcards && !s.typeMc && !s.typeWritten) s.typeMc = true;
  if (!["lenient", "medium", "strict"].includes(s.grading)) s.grading = "lenient";
  return s;
}

export const ROUND_SIZE = 7;
const MAX_REQUEUE_PER_ROUND = 2;

export function typePath(s: Pick<LearnSettings, "typeFlashcards" | "typeMc" | "typeWritten">): LearnQType[] {
  const order: LearnQType[] = [];
  if (s.typeFlashcards) order.push("flashcard");
  if (s.typeMc) order.push("mc");
  if (s.typeWritten) order.push("written");
  if (order.length === 0) order.push("mc");
  return order.length === 1 ? [order[0]!, order[0]!] : order;
}

export type LearnCardState = { step: number; seen: boolean; lastWrong: boolean; wrong: number };

export type LearnState = {
  v: 1;
  order: string[];
  cards: Record<string, LearnCardState>;
  round: number;
  queue: string[];
  roundCards: string[];
  requeued: Record<string, number>;
  answered: number;
  correctCount: number;
  wrongCount: number;
  missed: string[];
  startedAt: number;
  phase: "question" | "roundSummary" | "finished";
};

export function levelOf(cs: LearnCardState | undefined, pathLen: number): 0 | 1 | 2 | 3 {
  if (!cs || !cs.seen) return 0;
  if (cs.step >= pathLen) return 3;
  if (cs.step === pathLen - 1 && !cs.lastWrong) return 2;
  return 1;
}

/** Korábban mentett szint visszaalakítása lépcsőfokká (pl. ha nincs félbehagyott kör, de van haladás). */
function stateFromLevel(level: number | undefined, pathLen: number): LearnCardState {
  if (!level) return { step: 0, seen: false, lastWrong: false, wrong: 0 };
  if (level >= 3) return { step: pathLen, seen: true, lastWrong: false, wrong: 0 };
  if (level === 2) return { step: pathLen - 1, seen: true, lastWrong: false, wrong: 0 };
  return { step: 0, seen: true, lastWrong: true, wrong: 0 };
}

export function newLearnState(
  cardIds: string[],
  settings: LearnSettings,
  opts: { rnd?: () => number; levels?: Record<string, number>; now?: number } = {},
): LearnState {
  const pathLen = typePath(settings).length;
  const order = settings.shuffle ? shuffleArray(cardIds, opts.rnd) : cardIds.slice();
  const cards: Record<string, LearnCardState> = {};
  for (const id of cardIds) cards[id] = stateFromLevel(opts.levels?.[id], pathLen);
  const base: LearnState = {
    v: 1,
    order,
    cards,
    round: 0,
    queue: [],
    roundCards: [],
    requeued: {},
    answered: 0,
    correctCount: 0,
    wrongCount: 0,
    missed: [],
    startedAt: opts.now ?? Date.now(),
    phase: "question",
  };
  return startRound(base, settings);
}

export function isMastered(state: LearnState, id: string, settings: LearnSettings) {
  return (state.cards[id]?.step ?? 0) >= typePath(settings).length;
}

export function startRound(state: LearnState, settings: LearnSettings): LearnState {
  const pathLen = typePath(settings).length;
  const remaining = state.order.filter((id) => (state.cards[id]?.step ?? 0) < pathLen);
  if (remaining.length === 0) return { ...state, queue: [], roundCards: [], phase: "finished" };
  const inProgress = remaining.filter((id) => state.cards[id]?.seen);
  const fresh = remaining.filter((id) => !state.cards[id]?.seen);
  const roundCards = [...inProgress, ...fresh].slice(0, ROUND_SIZE);
  return { ...state, round: state.round + 1, queue: roundCards.slice(), roundCards, requeued: {}, phase: "question" };
}

export function currentCardId(state: LearnState): string | undefined {
  return state.phase === "question" ? state.queue[0] : undefined;
}

export function questionTypeFor(state: LearnState, cardId: string, settings: LearnSettings): LearnQType {
  const path = typePath(settings);
  const step = Math.min(state.cards[cardId]?.step ?? 0, path.length - 1);
  return path[step]!;
}

export function applyAnswer(state: LearnState, cardId: string, correct: boolean, settings: LearnSettings): LearnState {
  if (state.queue[0] !== cardId) return state;
  const pathLen = typePath(settings).length;
  const prev = state.cards[cardId] ?? { step: 0, seen: false, lastWrong: false, wrong: 0 };
  const cs: LearnCardState = correct
    ? { step: Math.min(pathLen, prev.step + 1), seen: true, lastWrong: false, wrong: prev.wrong }
    : { step: Math.max(0, prev.step - 1), seen: true, lastWrong: true, wrong: prev.wrong + 1 };
  const queue = state.queue.slice(1);
  const requeued = { ...state.requeued };
  if (!correct && queue.length > 0 && (requeued[cardId] ?? 0) < MAX_REQUEUE_PER_ROUND) {
    requeued[cardId] = (requeued[cardId] ?? 0) + 1;
    queue.splice(Math.min(2, queue.length), 0, cardId);
  }
  const cards = { ...state.cards, [cardId]: cs };
  const next: LearnState = {
    ...state,
    cards,
    queue,
    requeued,
    answered: state.answered + 1,
    correctCount: state.correctCount + (correct ? 1 : 0),
    wrongCount: state.wrongCount + (correct ? 0 : 1),
    missed: !correct && !state.missed.includes(cardId) ? [...state.missed, cardId] : state.missed,
  };
  if (queue.length === 0) {
    const allDone = next.order.every((id) => (cards[id]?.step ?? 0) >= pathLen);
    return { ...next, phase: allDone ? "finished" : "roundSummary" };
  }
  return next;
}

export function stats(state: LearnState, settings: LearnSettings) {
  const pathLen = typePath(settings).length;
  const counts = [0, 0, 0, 0];
  for (const id of state.order) counts[levelOf(state.cards[id], pathLen)]!++;
  return { total: state.order.length, new: counts[0]!, learning: counts[1]!, known: counts[2]!, mastered: counts[3]!, remaining: state.order.length - counts[3]! };
}

/** Mentett állapot összefésülése az aktuális kártyákkal (törölt kártyák ki, újak be). */
export function reconcileLearnState(raw: unknown, cardIds: string[], settings: LearnSettings): LearnState | null {
  const s = raw as LearnState | null;
  if (!s || s.v !== 1 || !s.cards || !Array.isArray(s.order)) return null;
  const valid = new Set(cardIds);
  const pathLen = typePath(settings).length;
  const order = s.order.filter((id) => valid.has(id));
  for (const id of cardIds) if (!order.includes(id)) order.push(id);
  const cards: Record<string, LearnCardState> = {};
  for (const id of order) {
    const c = s.cards[id];
    cards[id] = c ? { ...c, step: Math.min(c.step, pathLen) } : { step: 0, seen: false, lastWrong: false, wrong: 0 };
  }
  const queue = (s.queue ?? []).filter((id) => valid.has(id) && (cards[id]?.step ?? 0) < pathLen);
  const roundCards = (s.roundCards ?? []).filter((id) => valid.has(id));
  const fixed: LearnState = {
    ...s,
    order,
    cards,
    queue,
    roundCards,
    missed: (s.missed ?? []).filter((id) => valid.has(id)),
    requeued: s.requeued ?? {},
  };
  if (order.every((id) => cards[id]!.step >= pathLen)) return { ...fixed, queue: [], phase: "finished" };
  if (fixed.phase === "question" && queue.length === 0) return startRound(fixed, settings);
  return fixed;
}

// ---------- Kérdés összeállítása ----------

export type LearnQuestion = {
  cardId: string;
  type: LearnQType;
  answerSide: "term" | "definition";
  prompt: string;
  answer: string;
  options?: string[];
};

export function buildQuestion(
  cards: { id: string; term: string; definition: string }[],
  cardId: string,
  type: LearnQType,
  settings: LearnSettings,
  rnd: () => number = Math.random,
): LearnQuestion {
  const card = cards.find((c) => c.id === cardId)!;
  let answerSide: "term" | "definition";
  if (settings.answerWithTerm && settings.answerWithDefinition) answerSide = rnd() < 0.5 ? "term" : "definition";
  else answerSide = settings.answerWithTerm ? "term" : "definition";
  const prompt = answerSide === "term" ? card.definition : card.term;
  const answer = answerSide === "term" ? card.term : card.definition;
  let qType = type;
  let options: string[] | undefined;
  if (qType === "mc") {
    const seen = new Set([answer.trim().toLowerCase()]);
    const pool = shuffleArray(
      cards.filter((c) => c.id !== cardId),
      rnd,
    );
    const distractors: string[] = [];
    for (const c of pool) {
      const v = answerSide === "term" ? c.term : c.definition;
      const key = v.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        distractors.push(v);
      }
      if (distractors.length >= 3) break;
    }
    if (distractors.length === 0) {
      // Egyetlen kártyánál nincs mit választani: írásos (vagy ha az ki van kapcsolva, önértékelős kártya).
      qType = settings.typeWritten ? "written" : "flashcard";
    } else {
      options = shuffleArray([answer, ...distractors], rnd);
    }
  }
  return { cardId, type: qType, answerSide, prompt, answer, options };
}
