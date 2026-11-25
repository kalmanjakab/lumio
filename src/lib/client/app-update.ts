"use client";

// Automatikus frissítés: ha új verzió jelent meg, az app magától újratölt,
// de csak olyankor, amikor ez nem okoz adatvesztést.
import { useEffect } from "react";

/** Az éppen futó build azonosítója (a buildbe égetve). */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

// Az újratöltést teljesen tiltó dolgok (pl. mentetlen admin szerkesztő, folyamatban lévő teszt).
const hardBlockers = new Set<symbol>();
const listeners = new Set<() => void>();

/** Amíg az „active” igaz, az app nem tölt újra magától (csak ha a felhasználó elnavigál innen). */
export function useAutoReloadBlocker(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const token = Symbol("blocker");
    hardBlockers.add(token);
    return () => {
      hardBlockers.delete(token);
      // A blokkoló megszűnt (pl. mentés vagy kilépés): ha vár frissítés, most jöhet.
      queueMicrotask(() => listeners.forEach((fn) => fn()));
    };
  }, [active]);
}

export function hasHardBlocker() {
  return hardBlockers.size > 0;
}

export function onBlockersChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Van-e épp kitöltés alatt álló beviteli mező (ilyenkor nem töltünk újra a felhasználó szeme előtt). */
export function isEditingSomething(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const passive = ["button", "checkbox", "radio", "range", "submit", "reset", "color"];
    return !passive.includes(el.type);
  }
  return false;
}

/** A tanulási módok (Kártyák, Tanulás) folyamatosan mentenek, de látható állapotban nem szakítjuk meg őket. */
export function isStudyPath(pathname: string): boolean {
  return /^\/sets\/[^/]+\/(flashcards|learn|test|match)(\/|$)/.test(pathname);
}

/**
 * Döntés: most újratölthetünk-e.
 * - „navigation”: a felhasználó másik oldalra lépett → mehet, ha nincs kemény blokkoló.
 * - „hidden”: az app a háttérbe került → mehet, ha nincs kemény blokkoló (a módok mentenek pagehide-kor).
 * - „idle”: látható oldalon csak akkor, ha nem tanul, nem gépel és nincs blokkoló.
 */
export function mayReload(reason: "navigation" | "hidden" | "idle", ctx: { hardBlocked: boolean; editing: boolean; studying: boolean }): boolean {
  if (ctx.hardBlocked) return false;
  if (reason === "navigation" || reason === "hidden") return true;
  return !ctx.editing && !ctx.studying;
}
