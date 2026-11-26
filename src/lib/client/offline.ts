"use client";

import { localKeys, readLocal, removeLocal, writeLocal } from "./storage";

// Offline mentett készletek a böngészőben (csak szöveg, kép nélkül).
// Csak nyilvános és saját készlet menthető; kijelentkezéskor mind törlődik.

export type OfflineCard = { id: string; term: string; definition: string };
export type OfflineSet = { id: string; title: string; termLang: string; definitionLang: string; cards: OfflineCard[]; savedAt: number };

const PREFIX = "off:set:";
const PENDING = "off:pending";
export const OFFLINE_MAX_SETS = 30;
export const OFFLINE_EVENT = "flashly:offline-changed";

function emit() {
  try {
    window.dispatchEvent(new Event(OFFLINE_EVENT));
  } catch {
    /* nincs teendő */
  }
}

export function listOffline(): OfflineSet[] {
  return localKeys(PREFIX)
    .map((k) => readLocal<OfflineSet | null>(k, null))
    .filter((s): s is OfflineSet => Boolean(s && Array.isArray(s.cards)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function isSavedOffline(id: string) {
  return readLocal<OfflineSet | null>(PREFIX + id, null) !== null;
}

export function saveOffline(set: Omit<OfflineSet, "savedAt">): "ok" | "full" | "error" {
  if (!isSavedOffline(set.id) && localKeys(PREFIX).length >= OFFLINE_MAX_SETS) return "full";
  const value: OfflineSet = { ...set, cards: set.cards.map((c) => ({ id: c.id, term: c.term, definition: c.definition })), savedAt: Date.now() };
  writeLocal(PREFIX + set.id, value);
  const ok = isSavedOffline(set.id);
  emit();
  return ok ? "ok" : "error";
}

export function removeOffline(id: string) {
  removeLocal(PREFIX + id);
  emit();
}

/** Kijelentkezéskor: minden offline adat törlése erről az eszközről. */
export function clearOffline() {
  for (const k of localKeys("off:")) removeLocal(k);
  emit();
}

// ---------- Offline tanulás „kimenő postafiókja” ----------
// Offline nem tudjuk elküldeni a napi aktivitást; napra bontva eltesszük, és online állapotban elküldjük.

function localDay() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addOfflineActivity(items: number) {
  const p = readLocal<Record<string, number>>(PENDING, {});
  const day = localDay();
  p[day] = Math.min(100000, (p[day] ?? 0) + items);
  writeLocal(PENDING, p);
}

/** A ma offline megválaszolt kártyák száma (a régebbi napok elvesznek: azokat a szerver már nem tudja jóváírni). */
export function takeOfflineActivity(): number {
  const p = readLocal<Record<string, number>>(PENDING, {});
  removeLocal(PENDING);
  return p[localDay()] ?? 0;
}
