import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEARN_SETTINGS,
  ROUND_SIZE,
  applyAnswer,
  buildQuestion,
  currentCardId,
  levelOf,
  newLearnState,
  normalizeLearnSettings,
  questionTypeFor,
  reconcileLearnState,
  startRound,
  stats,
  typePath,
  type LearnSettings,
} from "@/lib/learn-engine";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);
const cards = (n: number) => ids(n).map((id, i) => ({ id, term: `term${i + 1}`, definition: `def${i + 1}` }));
const S: LearnSettings = { ...DEFAULT_LEARN_SETTINGS };

describe("kérdéstípus-sorrend", () => {
  it("alapból feleletválasztós, majd írásos", () => {
    expect(typePath(S)).toEqual(["mc", "written"]);
  });
  it("mindhárom típussal: kártya → feleletválasztós → írásos", () => {
    expect(typePath({ typeFlashcards: true, typeMc: true, typeWritten: true })).toEqual(["flashcard", "mc", "written"]);
  });
  it("egy típusnál kétszer kell jól válaszolni", () => {
    expect(typePath({ typeFlashcards: false, typeMc: true, typeWritten: false })).toEqual(["mc", "mc"]);
  });
  it("legalább egy típus és egy válaszirány mindig marad", () => {
    const s = normalizeLearnSettings({ typeMc: false, typeWritten: false, typeFlashcards: false, answerWithTerm: false, answerWithDefinition: false });
    expect(s.typeMc).toBe(true);
    expect(s.answerWithDefinition).toBe(true);
  });
});

describe("szintlépés", () => {
  it("új → tanulás alatt/ismert → elsajátított", () => {
    let st = newLearnState(ids(1), S);
    const id = "c1";
    expect(levelOf(st.cards[id], 2)).toBe(0);
    expect(questionTypeFor(st, id, S)).toBe("mc");
    st = applyAnswer(st, id, true, S);
    expect(levelOf(st.cards[id], 2)).toBe(2);
    expect(st.phase).toBe("roundSummary");
    st = startRound(st, S);
    expect(questionTypeFor(st, id, S)).toBe("written");
    st = applyAnswer(st, id, true, S);
    expect(levelOf(st.cards[id], 2)).toBe(3);
    expect(st.phase).toBe("finished");
  });

  it("hibás válasz visszaléptet és tanulás alatt lesz", () => {
    let st = newLearnState(ids(3), S);
    st = applyAnswer(st, "c1", true, S); // c1: ismert
    st = applyAnswer(st, "c2", false, S); // c2 hibás → visszajön
    expect(levelOf(st.cards.c2, 2)).toBe(1);
    expect(st.missed).toEqual(["c2"]);
    expect(st.queue).toContain("c2");
  });

  it("a hibás kártya 2 kérdéssel később jön vissza ugyanabban a körben", () => {
    let st = newLearnState(ids(5), S);
    st = applyAnswer(st, "c1", false, S);
    expect(st.queue).toEqual(["c2", "c3", "c1", "c4", "c5"]);
  });

  it("egy körben legfeljebb kétszer jön vissza ugyanaz a hibás kártya", () => {
    let st = newLearnState(ids(4), S);
    for (let i = 0; i < 12 && st.phase === "question"; i++) {
      const cur = currentCardId(st)!;
      st = applyAnswer(st, cur, cur !== "c1", S);
    }
    expect(st.phase).toBe("roundSummary");
    expect(st.cards.c1!.wrong).toBe(3);
  });
});

describe("körök", () => {
  it(`egy kör legfeljebb ${ROUND_SIZE} kártya`, () => {
    const st = newLearnState(ids(20), S);
    expect(st.roundCards.length).toBe(ROUND_SIZE);
    expect(st.round).toBe(1);
  });
  it("a következő kör a félkész kártyákkal kezd", () => {
    let st = newLearnState(ids(10), S);
    while (st.phase === "question") st = applyAnswer(st, currentCardId(st)!, true, S);
    st = startRound(st, S);
    expect(st.roundCards.slice(0, 7)).toEqual(ids(7));
  });
  it("végigjátszás: minden kártya elsajátítva", () => {
    let st = newLearnState(ids(9), S);
    let guard = 0;
    while (st.phase !== "finished" && guard++ < 200) {
      if (st.phase === "roundSummary") st = startRound(st, S);
      else st = applyAnswer(st, currentCardId(st)!, true, S);
    }
    expect(st.phase).toBe("finished");
    expect(stats(st, S).mastered).toBe(9);
  });
  it("korábbi szintekből folytatja", () => {
    const st = newLearnState(ids(3), S, { levels: { c1: 3, c2: 2 } });
    expect(stats(st, S)).toMatchObject({ mastered: 1, known: 1, new: 1 });
    expect(st.roundCards).toEqual(["c2", "c3"]);
  });
});

describe("kérdések összeállítása", () => {
  it("4 opció ugyanabból a készletből, köztük a helyes", () => {
    const q = buildQuestion(cards(10), "c1", "mc", { ...S, answerWithTerm: false });
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain("def1");
    expect(q.prompt).toBe("term1");
  });
  it("kevés kártyánál kevesebb opció", () => {
    const q = buildQuestion(cards(2), "c1", "mc", { ...S, answerWithTerm: false });
    expect(q.options).toHaveLength(2);
  });
  it("egy kártyánál írásosra vált", () => {
    const q = buildQuestion(cards(1), "c1", "mc", S);
    expect(q.type).toBe("written");
  });
  it("válasz szóval: a jelentést mutatja", () => {
    const q = buildQuestion(cards(3), "c2", "written", { ...S, answerWithDefinition: false });
    expect(q.prompt).toBe("def2");
    expect(q.answer).toBe("term2");
  });
});

describe("mentett állapot", () => {
  it("törölt kártyák kiesnek, újak bekerülnek", () => {
    let st = newLearnState(ids(3), S);
    st = applyAnswer(st, "c1", true, S);
    const r = reconcileLearnState(JSON.parse(JSON.stringify(st)), ["c1", "c3", "c4"], S)!;
    expect(r.order).toEqual(["c1", "c3", "c4"]);
    expect(r.cards.c2).toBeUndefined();
    expect(r.cards.c4!.seen).toBe(false);
  });
  it("érvénytelen állapotnál null", () => {
    expect(reconcileLearnState({ foo: 1 }, ids(2), S)).toBeNull();
  });
});
