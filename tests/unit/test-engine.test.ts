import { describe, expect, it } from "vitest";
import { generateTest, isCorrect, normalizeTestSettings, scoreTest, defaultTestSettings } from "@/lib/test-engine";

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, term: `term${i + 1}`, definition: `def${i + 1}` }));
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe("Teszt beállítások", () => {
  it("alapértékek: feleletválasztós be, a többi ki, max 20 kérdés", () => {
    expect(defaultTestSettings(50)).toMatchObject({ count: 20, instant: false, answerWith: "both", tf: false, mc: true, written: false });
    expect(defaultTestSettings(5).count).toBe(5);
  });
  it("kérdésszám nem lehet több a kártyáknál; legalább egy típus marad", () => {
    const s = normalizeTestSettings({ count: 99, tf: false, mc: false, written: false }, 10);
    expect(s.count).toBe(10);
    expect(s.mc).toBe(true);
  });
});

describe("Kérdésgenerálás", () => {
  it("annyi kérdés, ahányat kértek, típusok szekciókban", () => {
    const qs = generateTest(cards(12), { count: 9, instant: false, answerWith: "definition", tf: true, mc: true, written: true }, rnd);
    expect(qs).toHaveLength(9);
    expect(qs.map((q) => q.type)).toEqual(["tf", "tf", "tf", "mc", "mc", "mc", "written", "written", "written"]);
    expect(new Set(qs.map((q) => q.cardId)).size).toBe(9);
  });
  it("igaz/hamis: vagy a helyes, vagy egy másik jelentés", () => {
    const qs = generateTest(cards(10), { count: 10, instant: false, answerWith: "definition", tf: true, mc: false, written: false }, rnd);
    for (const q of qs) {
      if (q.truth) expect(q.shown).toBe(q.answer);
      else expect(q.shown).not.toBe(q.answer);
    }
  });
  it("feleletválasztós: 4 opció, köztük a helyes", () => {
    const qs = generateTest(cards(10), { count: 5, instant: false, answerWith: "term", tf: false, mc: true, written: false }, rnd);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.answer);
      expect(q.answer.startsWith("term")).toBe(true);
    }
  });
  it("egy kártyánál a feleletválasztós helyett más típus jön", () => {
    const [q] = generateTest(cards(1), { count: 1, instant: false, answerWith: "term", tf: false, mc: true, written: false }, rnd);
    expect(q!.type).toBe("tf");
    expect(q!.truth).toBe(true);
  });
});

describe("Értékelés", () => {
  it("igaz/hamis, feleletválasztós, írásos", () => {
    const qs = generateTest(cards(6), { count: 6, instant: false, answerWith: "definition", tf: true, mc: true, written: true }, rnd);
    const answers: Record<number, string> = {};
    for (const q of qs) {
      if (q.type === "tf") answers[q.idx] = q.truth ? "true" : "false";
      if (q.type === "mc") answers[q.idx] = q.answer;
      if (q.type === "written") answers[q.idx] = q.answer.toUpperCase();
    }
    const r = scoreTest(qs, answers, "strict");
    expect(r.correct).toBe(6);
    expect(r.percent).toBe(100);
    expect(r.grade).toBe(5);
  });
  it("megválaszolatlan = hibás, osztályzat a küszöbök szerint", () => {
    const qs = generateTest(cards(10), { count: 10, instant: false, answerWith: "definition", tf: false, mc: true, written: false }, rnd);
    const answers: Record<number, string> = {};
    qs.slice(0, 7).forEach((q) => (answers[q.idx] = q.answer));
    const r = scoreTest(qs, answers, "lenient");
    expect(r.correct).toBe(7);
    expect(r.grade).toBe(4);
    expect(isCorrect(qs[9]!, null, "lenient")).toBe(false);
  });
});
