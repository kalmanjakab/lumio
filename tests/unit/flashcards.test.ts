import { describe, expect, it } from "vitest";
import { answer, browse, continueWithLearning, hintFor, newFlashcardsState, reconcileState, undo } from "@/lib/flashcards-engine";

describe("Kártyák mód", () => {
  it("rendez tudom / még tanulom szerint és a végén kész", () => {
    let s = newFlashcardsState(["a", "b", "c"], false);
    s = answer(s, "known");
    s = answer(s, "learning");
    s = answer(s, "known");
    expect(s.done).toBe(true);
    expect(s.known).toEqual(["a", "c"]);
    expect(s.learning).toEqual(["b"]);
  });
  it("visszavonás", () => {
    let s = newFlashcardsState(["a", "b"], false);
    s = answer(s, "known");
    s = undo(s);
    expect(s.index).toBe(0);
    expect(s.known).toEqual([]);
  });
  it("folytatás a nem tudott kártyákkal", () => {
    let s = newFlashcardsState(["a", "b", "c"], false);
    s = answer(answer(answer(s, "learning"), "known"), "learning");
    s = continueWithLearning(s, false);
    expect(s.queue).toEqual(["a", "c"]);
    expect(s.known).toEqual(["b"]);
    expect(s.round).toBe(2);
  });
  it("lapozás nem lép túl a széleken", () => {
    let s = newFlashcardsState(["a", "b"], false);
    s = browse(s, -1);
    expect(s.index).toBe(0);
    s = browse(browse(browse(s, 1), 1), 1);
    expect(s.index).toBe(1);
  });
  it("tipp: szavanként az első betű", () => {
    expect(hintFor("to give up")).toBe("t_ g___ u_");
    expect(hintFor("alma")).toBe("a___");
  });
  it("mentett állapot: törölt kártyák kiesnek", () => {
    const s = reconcileState({ v: 1, queue: ["a", "x", "b"], index: 1, known: ["a", "x"], learning: [], round: 1, done: false, history: [] }, ["a", "b"]);
    expect(s?.queue).toEqual(["a", "b"]);
    expect(s?.known).toEqual(["a"]);
  });
});
