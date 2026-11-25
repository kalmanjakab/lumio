// A Teszt mód: kérdésgenerálás és értékelés (tiszta függvények, tesztelhető).
import { gradeWritten, type GradingLevel } from "./grading";
import { shuffleArray } from "./flashcards-engine";
import { gradeFor } from "./grading-scale";
import type { GradeThresholds } from "./db/schema";

export type TestType = "tf" | "mc" | "written";

export type TestSettings = {
  count: number;
  instant: boolean;
  answerWith: "term" | "definition" | "both";
  tf: boolean;
  mc: boolean;
  written: boolean;
};

export function defaultTestSettings(cardCount: number): TestSettings {
  return { count: Math.min(20, Math.max(1, cardCount)), instant: false, answerWith: "both", tf: false, mc: true, written: false };
}

export function normalizeTestSettings(raw: unknown, cardCount: number): TestSettings {
  const d = defaultTestSettings(cardCount);
  const r = (raw ?? {}) as Partial<TestSettings>;
  const s: TestSettings = { ...d, ...r };
  s.count = Math.max(1, Math.min(cardCount || 1, Math.round(Number(s.count) || d.count)));
  if (!["term", "definition", "both"].includes(s.answerWith)) s.answerWith = "both";
  if (!s.tf && !s.mc && !s.written) s.mc = true;
  return s;
}

export type TestQuestion = {
  idx: number;
  cardId: string;
  type: TestType;
  answerSide: "term" | "definition";
  prompt: string;
  answer: string;
  shown?: string;
  truth?: boolean;
  options?: string[];
};

type Card = { id: string; term: string; definition: string };

export function generateTest(cards: Card[], settings: TestSettings, rnd: () => number = Math.random): TestQuestion[] {
  const picked = shuffleArray(cards, rnd).slice(0, Math.min(settings.count, cards.length));
  const types: TestType[] = (["tf", "mc", "written"] as TestType[]).filter((t) => settings[t]);
  const per = Math.floor(picked.length / types.length);
  let extra = picked.length - per * types.length;
  const plan: TestType[] = [];
  for (const t of types) {
    const n = per + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    for (let i = 0; i < n; i++) plan.push(t);
  }
  return picked.map((card, i) => {
    const type = plan[i]!;
    const answerSide: "term" | "definition" = settings.answerWith === "both" ? (rnd() < 0.5 ? "term" : "definition") : settings.answerWith;
    const prompt = answerSide === "term" ? card.definition : card.term;
    const answer = answerSide === "term" ? card.term : card.definition;
    const others = cards.filter((c) => c.id !== card.id);
    const valueOf = (c: Card) => (answerSide === "term" ? c.term : c.definition);
    const q: TestQuestion = { idx: i, cardId: card.id, type, answerSide, prompt, answer };
    if (type === "tf") {
      const distinct = others.filter((c) => valueOf(c).trim().toLowerCase() !== answer.trim().toLowerCase());
      const showTrue = distinct.length === 0 || rnd() < 0.5;
      q.shown = showTrue ? answer : valueOf(distinct[Math.floor(rnd() * distinct.length)]!);
      q.truth = showTrue;
    } else if (type === "mc") {
      const seen = new Set([answer.trim().toLowerCase()]);
      const distractors: string[] = [];
      for (const c of shuffleArray(others, rnd)) {
        const v = valueOf(c);
        const key = v.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          distractors.push(v);
        }
        if (distractors.length >= 3) break;
      }
      if (distractors.length === 0) {
        q.type = settings.written ? "written" : "tf";
        if (q.type === "tf") {
          q.shown = answer;
          q.truth = true;
        }
      } else q.options = shuffleArray([answer, ...distractors], rnd);
    }
    return q;
  });
}

/** Válasz: igaz/hamis → "true"/"false", feleletválasztós → az opció szövege, írásos → a beírt szöveg. */
export function isCorrect(q: TestQuestion, answer: string | null | undefined, level: GradingLevel): boolean {
  if (answer == null || answer === "") return false;
  if (q.type === "tf") return (answer === "true") === Boolean(q.truth);
  if (q.type === "mc") return answer === q.answer;
  return gradeWritten(answer, q.answer, level).correct;
}

export function scoreTest(questions: TestQuestion[], answers: Record<number, string>, level: GradingLevel, thresholds?: GradeThresholds) {
  const results = questions.map((q) => ({ q, answer: answers[q.idx] ?? null, correct: isCorrect(q, answers[q.idx], level) }));
  const correct = results.filter((r) => r.correct).length;
  const total = questions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { results, correct, total, percent, grade: gradeFor(percent, thresholds) };
}
