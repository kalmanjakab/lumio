"use client";

// Napi cél és sorozat a kliensen. Fióknál a szerver a hiteles forrás (ide csak a választ tükrözzük),
// vendégnél minden a böngészőben számolódik ugyanazokkal a függvényekkel.
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { readLocal, writeLocal } from "./storage";
import { addDays, applyGoalMet, dayInZone, EMPTY_STREAK, type StreakState } from "@/lib/streak";

export type ActivityState = { today: string; items: number; goal: number; goalMet: boolean; streak: StreakState; ready: boolean };
type GuestDay = { items: number; reviews: number; goalMet: boolean; frozen?: boolean };
type GuestActivity = { days: Record<string, GuestDay>; streak: StreakState };
export type ActivityEventInfo = { goalJustMet: boolean; earnedFreeze: boolean; frozenDays: string[]; streak: number };

const KEY = "g:activity";
let kind: "guest" | "user" = "guest";
let state: ActivityState = { today: "", items: 0, goal: 20, goalMet: false, streak: EMPTY_STREAK, ready: false };
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: ActivityEventInfo) => void>();
let pendingItems = 0;
let pendingReviews = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = () => dayInZone(new Date(), localTz());

function set(next: Partial<ActivityState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function readGuest(): GuestActivity {
  return readLocal<GuestActivity>(KEY, { days: {}, streak: EMPTY_STREAK });
}

/** A beállítás a providerből jön: fióknál a szerver adataival, vendégnél a böngészőből. */
export function configureActivity(opts: { kind: "guest" | "user"; goal: number; server?: { today: string; items: number; goalMet: boolean; streak: StreakState } | null }) {
  kind = opts.kind;
  if (opts.kind === "user" && opts.server) {
    set({ today: opts.server.today, items: opts.server.items + pendingItems, goal: opts.goal, goalMet: opts.server.goalMet, streak: opts.server.streak, ready: true });
    return;
  }
  const g = readGuest();
  const d = today();
  set({ today: d, items: g.days[d]?.items ?? 0, goal: opts.goal, goalMet: g.days[d]?.goalMet ?? false, streak: g.streak, ready: true });
}

export function setActivityGoal(goal: number) {
  set({ goal });
}

async function flush() {
  timer = null;
  if (!pendingItems) return;
  const items = pendingItems;
  const reviews = pendingReviews;
  pendingItems = 0;
  pendingReviews = 0;
  try {
    const r = await api<{ today: string; items: number; goal: number; goalMet: boolean; streak: StreakState; goalJustMet: boolean; earnedFreeze: boolean; frozenDays: string[] }>(
      "/api/me/activity",
      { method: "POST", body: { items, reviews }, keepalive: true },
    );
    set({ today: r.today, items: r.items + pendingItems, goal: r.goal, goalMet: r.goalMet, streak: r.streak });
    if (r.goalJustMet) emit({ goalJustMet: true, earnedFreeze: r.earnedFreeze, frozenDays: r.frozenDays, streak: r.streak.current });
  } catch {
    // Hálózati hiba: visszatesszük, a következő alkalommal újra megpróbáljuk (offline tanulásnál is).
    pendingItems += items;
    pendingReviews += reviews;
    persistPending();
  }
}

function emit(e: ActivityEventInfo) {
  for (const l of eventListeners) l(e);
}

const PENDING_KEY = "u:activity-pending";
function persistPending() {
  writeLocal(PENDING_KEY, { items: pendingItems, reviews: pendingReviews });
}

/** Fióknál: a korábban (pl. offline) el nem küldött aktivitás újraküldése. */
export function retryPendingActivity() {
  if (kind !== "user") return;
  const p = readLocal<{ items: number; reviews: number } | null>(PENDING_KEY, null);
  if (p && p.items > 0) {
    writeLocal(PENDING_KEY, null);
    pendingItems += Math.min(500, p.items);
    pendingReviews += Math.min(500, p.reviews);
    void flush();
  }
}

/** Megválaszolt kártyák jelentése (minden tanulási módból). */
export function recordActivity(items: number, reviews = 0) {
  if (items <= 0) return;
  const d = today();
  if (kind === "user") {
    // Napváltáskor a helyi számláló nulláról indul; a szerver a saját időzóna szerinti napot számolja.
    set({ items: (state.today === d || !state.today ? state.items : 0) + items, today: state.today || d });
    pendingItems = Math.min(500, pendingItems + items);
    pendingReviews = Math.min(pendingItems, pendingReviews + reviews);
    if (!timer) timer = setTimeout(flush, 2000);
    return;
  }
  const g = readGuest();
  const day = g.days[d] ?? { items: 0, reviews: 0, goalMet: false };
  day.items += items;
  day.reviews += reviews;
  let ev: ActivityEventInfo | null = null;
  if (!day.goalMet && day.items >= state.goal) {
    day.goalMet = true;
    const r = applyGoalMet(g.streak, d);
    g.streak = r.state;
    for (const f of r.frozenDays) g.days[f] = { ...(g.days[f] ?? { items: 0, reviews: 0, goalMet: false }), frozen: true };
    ev = { goalJustMet: true, earnedFreeze: r.earnedFreeze, frozenDays: r.frozenDays, streak: r.state.current };
  }
  g.days[d] = day;
  // Csak az utolsó ~400 nap marad meg.
  const cutoff = addDays(d, -400);
  for (const k of Object.keys(g.days)) if (k < cutoff) delete g.days[k];
  writeLocal(KEY, g);
  set({ today: d, items: day.items, goalMet: day.goalMet, streak: g.streak });
  if (ev) emit(ev);
}

export function flushActivity() {
  if (timer) {
    clearTimeout(timer);
    void flush();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushActivity);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushActivity();
  });
}

export function onActivityEvent(fn: (e: ActivityEventInfo) => void) {
  eventListeners.add(fn);
  return () => {
    eventListeners.delete(fn);
  };
}

export function useActivity(): ActivityState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Vendég napi előzményei a statisztikához. */
export function readGuestHistory(): { today: string; days: { day: string; items: number; reviews: number; goalMet: boolean; frozen: boolean }[] } {
  const g = readGuest();
  return { today: today(), days: Object.entries(g.days).map(([day, v]) => ({ day, items: v.items, reviews: v.reviews, goalMet: v.goalMet, frozen: Boolean(v.frozen) })) };
}

/** Belépéskor: a vendég aktivitás átküldése a fiókba. */
export function exportGuestActivity() {
  const g = readLocal<GuestActivity | null>(KEY, null);
  if (!g) return null;
  const days = Object.entries(g.days)
    .slice(-400)
    .map(([day, v]) => ({ day, items: Math.min(100000, v.items), reviews: Math.min(100000, v.reviews), goalMet: v.goalMet }));
  return { days, streak: { ...g.streak, freezes: Math.min(2, g.streak.freezes) } };
}
