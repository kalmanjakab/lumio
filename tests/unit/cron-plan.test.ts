import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/server/notify", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/server/review", () => ({ countDueRaw: vi.fn() }));
vi.mock("@/lib/server/assignments", () => ({ listAssignmentsForUser: vi.fn() }));

const { planForUser } = await import("@/lib/server/cron-notify");
const { DEFAULT_USER_SETTINGS } = await import("@/lib/validation");

// 2026-11-25 szerda; Budapest télen UTC+1.
const at = (localHour: number, day = "2026-11-25") => new Date(`${day}T${String(localHour - 1).padStart(2, "0")}:05:00Z`);

function user(over: Partial<Parameters<typeof planForUser>[0]> = {}) {
  return {
    id: "u",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    settings: { ...DEFAULT_USER_SETTINGS, timezone: "Europe/Budapest", reminderHour: 18 },
    streak: { current: 5, longest: 5, lastDay: "2026-11-24", freezes: 0 },
    hasPush: true,
    days: new Map([["2026-11-24", 30]]),
    lastActiveDay: "2026-11-24",
    remindersLast18h: 0,
    hasAssignmentSoon: false,
    ...over,
  };
}

describe("planForUser", () => {
  it("sends the daily reminder at the chosen hour", () => {
    expect(planForUser(user(), at(18)).map((p) => p.kind)).toEqual(["dailyReminder"]);
    expect(planForUser(user(), at(17))).toEqual([]);
  });

  it("warns about the streak in the evening, once", () => {
    const p = planForUser(user(), at(20));
    expect(p.map((x) => x.kind)).toEqual(["streakRisk"]);
    expect(p[0]!.params.days).toBe(5);
  });

  it("stays quiet when the goal is already met", () => {
    const u = user({ days: new Map([["2026-11-25", 25]]), streak: { current: 6, longest: 6, lastDay: "2026-11-25", freezes: 0 } });
    expect(planForUser(u, at(18))).toEqual([]);
    expect(planForUser(u, at(20))).toEqual([]);
  });

  it("respects quiet hours and the opt-outs", () => {
    expect(planForUser(user({ settings: { ...user().settings, reminderHour: 21 } }), at(23))).toEqual([]);
    expect(planForUser(user({ settings: { ...user().settings, notifyDaily: false } }), at(18))).toEqual([]);
    expect(planForUser(user({ hasPush: false }), at(18))).toEqual([]);
  });

  it("nudges after 3 days away instead of daily reminders", () => {
    const u = user({ lastActiveDay: "2026-11-22", streak: { current: 0, longest: 5, lastDay: "2026-11-22", freezes: 0 }, days: new Map() });
    const p = planForUser(u, at(18));
    expect(p.map((x) => x.kind)).toEqual(["nudge"]);
    expect(planForUser({ ...u, lastActiveDay: "2026-11-21" }, at(18))).toEqual([]);
  });

  it("caps reminders per day", () => {
    expect(planForUser(user({ remindersLast18h: 2 }), at(18))).toEqual([]);
  });

  it("sends the weekly summary on Sunday evening", () => {
    const u = user({ days: new Map([["2026-11-27", 10], ["2026-11-29", 0]]), streak: { current: 0, longest: 5, lastDay: "2026-11-27", freezes: 0 }, lastActiveDay: "2026-11-27" });
    const p = planForUser(u, at(19, "2026-11-29"));
    expect(p.find((x) => x.kind === "weekly")?.params).toMatchObject({ items: 10, active: 1 });
  });
});
