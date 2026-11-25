// A Párosítás játék logikája (tiszta függvények, tesztelhető).
import { shuffleArray } from "./flashcards-engine";

export type MatchSettings = { term: boolean; definition: boolean };
export const DEFAULT_MATCH_SETTINGS: MatchSettings = { term: true, definition: true };
export const PAIRS_PER_ROUND = 6;
export const PENALTY_MS = 1000;

export function normalizeMatchSettings(raw: unknown): MatchSettings {
  const r = (raw ?? {}) as Partial<MatchSettings>;
  const s = { term: r.term ?? true, definition: r.definition ?? true };
  if (!s.term && !s.definition) s.term = s.definition = true;
  return s;
}

export type Tile = { key: string; cardId: string; side: "term" | "definition"; text: string };

export type Rotation = { order: string[]; offset: number };

/** Nagy készletnél körönként más kártyák jönnek: egy kevert sorrendben haladunk végig. */
export function nextRoundCards(cardIds: string[], rot: Rotation | null, size = PAIRS_PER_ROUND, rnd: () => number = Math.random): { ids: string[]; rotation: Rotation } {
  const n = Math.min(size, cardIds.length);
  const valid = new Set(cardIds);
  let order = rot ? rot.order.filter((id) => valid.has(id)) : [];
  for (const id of cardIds) if (!order.includes(id)) order.push(id);
  let offset = rot?.offset ?? 0;
  if (!rot || offset >= order.length) {
    order = shuffleArray(cardIds, rnd);
    offset = 0;
  }
  let ids = order.slice(offset, offset + n);
  let nextOffset = offset + n;
  if (ids.length < n) {
    // A sor végén a maradékot újrakevert kártyákkal egészítjük ki (ismétlés nélkül).
    const fill = shuffleArray(cardIds.filter((id) => !ids.includes(id)), rnd).slice(0, n - ids.length);
    ids = [...ids, ...fill];
    nextOffset = order.length;
  }
  return { ids, rotation: { order, offset: nextOffset } };
}

export function buildTiles(cards: { id: string; term: string; definition: string }[], ids: string[], rnd: () => number = Math.random): Tile[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const tiles: Tile[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    tiles.push({ key: `${id}:t`, cardId: id, side: "term", text: c.term });
    tiles.push({ key: `${id}:d`, cardId: id, side: "definition", text: c.definition });
  }
  return shuffleArray(tiles, rnd);
}

export function isPair(a: Tile, b: Tile) {
  return a.cardId === b.cardId && a.side !== b.side;
}

/** Ha csak az egyik oldal van bekapcsolva, azzal az oldallal kell kezdeni a párosítást. */
export function canStartWith(tile: Tile, s: MatchSettings) {
  if (s.term && s.definition) return true;
  return s.term ? tile.side === "term" : tile.side === "definition";
}
