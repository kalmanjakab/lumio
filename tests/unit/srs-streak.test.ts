import { describe, expect, it } from "vitest";
import { cardLevel, isDue, isValidSrs, previewDue, rateCard } from "@/lib/srs";
import { addDays, applyGoalMet, dayDiff, dayInZone, EMPTY_STREAK, hourInZone, visibleStreak } from "@/lib/streak";

describe("FSRS ütemezés", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  it("új kártya: a Könnyű később jön, mint az Újra", () => {
    const p = previewDue(null, now);
    expect(p[1]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThanOrEqual(p[4]);
  });
  it("értékelés után érvényes állapot, és a Jó nem azonnal esedékes", () => {
    let c = rateCard(null, 3, now);
    expect(isValidSrs(c)).toBe(true);
    c = rateCard(c, 3, new Date(c.due));
    expect(c.state).toBe(2);
    expect(c.due).toBeGreaterThan(now.getTime() + 86400000);
    expect(isDue(c, now.getTime())).toBe(false);
    expect(isDue(c, c.due + 1)).toBe(true);
  });
  it("szint: új, tanulom, tudom, rögzült; a Tanulás mód haladása is számít", () => {
    expect(cardLevel(null, null)).toBe(0);
    const learning = rateCard(null, 1, now);
    expect(cardLevel(learning, null)).toBe(1);
    expect(cardLevel({ ...learning, state: 2, s: 5 }, null)).toBe(2);
    expect(cardLevel({ ...learning, state: 2, s: 40 }, null)).toBe(3);
    expect(cardLevel(null, { level: 3, streak: 0, wrong: 0, at: 0 })).toBe(3);
  });
  it("hibás adatot a szerver elutasít", () => {
    expect(isValidSrs({ due: "x" })).toBe(false);
    expect(isValidSrs({ ...rateCard(null, 3, now), state: 9 })).toBe(false);
  });
});

describe("sorozat", () => {
  it("egymás utáni napok: nő, a 7. napon sorozatmentő jár", () => {
    let s = EMPTY_STREAK;
    for (let i = 0; i < 7; i++) s = applyGoalMet(s, addDays("2026-11-01", i)).state;
    expect(s.current).toBe(7);
    expect(s.freezes).toBe(1);
    expect(s.longest).toBe(7);
  });
  it("ugyanaz a nap kétszer nem számít", () => {
    const a = applyGoalMet(EMPTY_STREAK, "2026-11-01").state;
    expect(applyGoalMet(a, "2026-11-01").state.current).toBe(1);
  });
  it("kimaradt nap: sorozatmentő fedezi, ha van", () => {
    const s = { current: 9, longest: 9, lastDay: "2026-11-10", freezes: 1 };
    const r = applyGoalMet(s, "2026-11-12");
    expect(r.state.current).toBe(10);
    expect(r.state.freezes).toBe(0);
    expect(r.frozenDays).toEqual(["2026-11-11"]);
  });
  it("túl sok kimaradt nap: újraindul", () => {
    const s = { current: 9, longest: 9, lastDay: "2026-11-10", freezes: 1 };
    const r = applyGoalMet(s, "2026-11-13");
    expect(r.state.current).toBe(1);
    expect(r.state.longest).toBe(9);
  });
  it("látható sorozat: tegnapi teljesítés még él, veszélyben van", () => {
    const s = { current: 5, longest: 5, lastDay: "2026-11-25", freezes: 0 };
    expect(visibleStreak(s, "2026-11-26")).toEqual({ current: 5, alive: true, doneToday: false, atRisk: true });
    expect(visibleStreak(s, "2026-11-27").current).toBe(0);
    expect(visibleStreak(s, "2026-11-25").doneToday).toBe(true);
  });
  it("napok és időzóna", () => {
    expect(dayDiff("2026-02-28", "2026-03-01")).toBe(1);
    expect(dayInZone(new Date("2026-11-26T23:30:00Z"), "Europe/Budapest")).toBe("2026-11-27");
    expect(dayInZone(new Date("2026-11-26T23:30:00Z"), "Rossz/Zona")).toBe("2026-11-26");
    expect(hourInZone(new Date("2026-11-26T23:30:00Z"), "Europe/Budapest")).toBe(0);
  });
});
