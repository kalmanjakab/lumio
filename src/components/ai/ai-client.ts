"use client";

import { useSyncExternalStore } from "react";
import { api, ApiClientError } from "@/lib/client/api";

/** A napi AI keretből hátralévő kérések száma (a szerver minden AI válaszban elküldi). */
let remaining: number | null = null;
const listeners = new Set<() => void>();

export function setAiRemaining(n: number | null) {
  remaining = n;
  listeners.forEach((l) => l());
}

export function useAiRemaining() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => remaining,
    () => null,
  );
}

/** AI kérés; a hátralévő keretet frissíti. */
export async function aiRequest<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await api<T & { remaining?: number }>(path, { method: "POST", body });
    if (typeof res.remaining === "number") setAiRemaining(res.remaining);
    return res;
  } catch (e) {
    if (e instanceof ApiClientError && e.code === "ai_daily_limit") setAiRemaining(0);
    throw e;
  }
}

/** A hiba üzenetkulcsa az „ai” névtérben. */
export function aiErrorKey(e: unknown): "limit" | "busy" | "notAllowed" | "failed" {
  if (e instanceof ApiClientError) {
    if (e.code === "ai_daily_limit" || e.status === 429) return "limit";
    if (e.code === "ai_busy") return "busy";
    if (e.code === "ai_not_allowed" || e.code === "ai_disabled") return "notAllowed";
  }
  return "failed";
}
