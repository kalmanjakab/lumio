// A Kártyák mód állapotgépe (tiszta függvények, tesztelhető).

export type FlashcardsSettings = {
  method: "sort" | "browse";
  tts: boolean;
  shuffle: boolean;
  front: "term" | "definition";
};

export type FlashcardsState = {
  v: 1;
  /** Az aktuális kör kártyái sorrendben. */
  queue: string[];
  index: number;
  known: string[];
  learning: string[];
  round: number;
  done: boolean;
  history: { cardId: string; result: "known" | "learning" }[];
};

export function shuffleArray<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function newFlashcardsState(cardIds: string[], shuffle: boolean, rnd?: () => number): FlashcardsState {
  return { v: 1, queue: shuffle ? shuffleArray(cardIds, rnd) : cardIds.slice(), index: 0, known: [], learning: [], round: 1, done: cardIds.length === 0, history: [] };
}

/** Betöltött állapot összefésülése az aktuális kártyalistával (törölt kártyák kiszűrése). */
export function reconcileState(state: unknown, cardIds: string[]): FlashcardsState | null {
  const s = state as FlashcardsState | null;
  if (!s || s.v !== 1 || !Array.isArray(s.queue)) return null;
  const valid = new Set(cardIds);
  const queue = s.queue.filter((id) => valid.has(id));
  if (queue.length === 0) return null;
  const known = (s.known ?? []).filter((id) => valid.has(id));
  const learning = (s.learning ?? []).filter((id) => valid.has(id));
  const index = Math.min(Math.max(0, s.index | 0), queue.length);
  return { v: 1, queue, index, known, learning, round: s.round || 1, done: Boolean(s.done) || index >= queue.length, history: [] };
}

export function answer(state: FlashcardsState, result: "known" | "learning"): FlashcardsState {
  if (state.done) return state;
  const cardId = state.queue[state.index];
  if (!cardId) return state;
  const known = state.known.filter((id) => id !== cardId);
  const learning = state.learning.filter((id) => id !== cardId);
  if (result === "known") known.push(cardId);
  else learning.push(cardId);
  const index = state.index + 1;
  return { ...state, known, learning, index, done: index >= state.queue.length, history: [...state.history, { cardId, result }].slice(-200) };
}

export function undo(state: FlashcardsState): FlashcardsState {
  const last = state.history[state.history.length - 1];
  if (!last || state.index === 0) return state;
  return {
    ...state,
    index: state.index - 1,
    done: false,
    known: state.known.filter((id) => id !== last.cardId),
    learning: state.learning.filter((id) => id !== last.cardId),
    history: state.history.slice(0, -1),
  };
}

/** „Folytatás a nem tudott kártyákkal”: új kör csak a még tanult kártyákkal. A tudottak megmaradnak. */
export function continueWithLearning(state: FlashcardsState, shuffle: boolean, rnd?: () => number): FlashcardsState {
  const ids = state.learning.slice();
  return {
    v: 1,
    queue: shuffle ? shuffleArray(ids, rnd) : ids,
    index: 0,
    known: state.known,
    learning: [],
    round: state.round + 1,
    done: ids.length === 0,
    history: [],
  };
}

/** Lapozás módban: előre/hátra mozgás, rendezés nélkül. */
export function browse(state: FlashcardsState, dir: 1 | -1): FlashcardsState {
  const n = state.queue.length;
  if (n === 0) return state;
  const index = Math.min(Math.max(0, state.index + dir), n - 1);
  return { ...state, index, done: false };
}

export function hintFor(text: string): string {
  // Minden szó első betűje látszik, a többi aláhúzás (pl. „to give up” → „t_ g___ u_”).
  return text
    .split(/(\s+)/)
    .map((w) => (/\s+/.test(w) || w.length === 0 ? w : w[0] + w.slice(1).replace(/[\p{L}\p{N}]/gu, "_")))
    .join("");
}
