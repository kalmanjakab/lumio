import { describe, expect, it } from "vitest";
import { isStudyPath, mayReload } from "@/lib/client/app-update";

const ctx = (o: Partial<{ hardBlocked: boolean; editing: boolean; studying: boolean }> = {}) => ({ hardBlocked: false, editing: false, studying: false, ...o });

describe("Automatikus frissítés – mikor tölthet újra", () => {
  it("felismeri a tanulási oldalakat", () => {
    expect(isStudyPath("/sets/abc/flashcards")).toBe(true);
    expect(isStudyPath("/sets/abc/test")).toBe(true);
    expect(isStudyPath("/sets/abc")).toBe(false);
    expect(isStudyPath("/settings")).toBe(false);
  });
  it("mentetlen adat (kemény blokkoló) mellett soha", () => {
    for (const r of ["navigation", "hidden", "idle"] as const) expect(mayReload(r, ctx({ hardBlocked: true }))).toBe(false);
  });
  it("látható oldalon tanulás vagy gépelés közben nem, egyébként igen", () => {
    expect(mayReload("idle", ctx())).toBe(true);
    expect(mayReload("idle", ctx({ studying: true }))).toBe(false);
    expect(mayReload("idle", ctx({ editing: true }))).toBe(false);
  });
  it("oldalváltáskor és háttérbe kerüléskor igen", () => {
    expect(mayReload("navigation", ctx({ studying: true, editing: true }))).toBe(true);
    expect(mayReload("hidden", ctx({ studying: true }))).toBe(true);
  });
});
