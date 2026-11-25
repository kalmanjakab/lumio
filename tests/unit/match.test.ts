import { describe, expect, it } from "vitest";
import { buildTiles, canStartWith, isPair, nextRoundCards, normalizeMatchSettings } from "@/lib/match-engine";

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, term: `t${i + 1}`, definition: `d${i + 1}` }));
const ids = (n: number) => cards(n).map((c) => c.id);

describe("Párosítás", () => {
  it("6 pár = 12 csempe, kevesebb kártyánál kevesebb", () => {
    const r = nextRoundCards(ids(20), null);
    expect(r.ids).toHaveLength(6);
    expect(buildTiles(cards(20), r.ids)).toHaveLength(12);
    expect(nextRoundCards(ids(4), null).ids).toHaveLength(4);
  });
  it("nagy készletnél körönként más kártyák", () => {
    const a = nextRoundCards(ids(18), null);
    const b = nextRoundCards(ids(18), a.rotation);
    const c = nextRoundCards(ids(18), b.rotation);
    const all = [...a.ids, ...b.ids, ...c.ids];
    expect(new Set(all).size).toBe(18);
  });
  it("a sor végén nincs ismétlés egy körön belül", () => {
    const a = nextRoundCards(ids(8), null);
    const b = nextRoundCards(ids(8), a.rotation);
    expect(new Set(b.ids).size).toBe(6);
  });
  it("pár felismerése", () => {
    const tiles = buildTiles(cards(2), ["c1", "c2"]);
    const t1 = tiles.find((t) => t.key === "c1:t")!;
    const d1 = tiles.find((t) => t.key === "c1:d")!;
    const d2 = tiles.find((t) => t.key === "c2:d")!;
    expect(isPair(t1, d1)).toBe(true);
    expect(isPair(t1, d2)).toBe(false);
    expect(isPair(t1, t1)).toBe(false);
  });
  it("legalább az egyik oldal bekapcsolva marad; kezdés oldal szerint", () => {
    expect(normalizeMatchSettings({ term: false, definition: false })).toEqual({ term: true, definition: true });
    const t = { key: "x", cardId: "x", side: "term" as const, text: "" };
    const d = { ...t, side: "definition" as const };
    expect(canStartWith(d, { term: true, definition: false })).toBe(false);
    expect(canStartWith(t, { term: true, definition: false })).toBe(true);
    expect(canStartWith(d, { term: true, definition: true })).toBe(true);
  });
});
