"use client";

import { useEffect, useMemo, useState } from "react";
import { api, fireAndForget } from "./api";
import { localKeys, readLocal, removeLocal, writeLocal } from "./storage";
import type { StudyData, ProgressEntry, TestResultRecord } from "@/lib/study-types";

export type { StudyData, ProgressEntry, TestResultRecord };

type Kind = "guest" | "user";

const k = {
  settings: (m: string, mode: string) => `g:settings:${m}:${mode}`,
  state: (m: string, mode: string) => `g:state:${m}:${mode}`,
  progress: (m: string) => `g:progress:${m}`,
  starred: (m: string) => `g:starred:${m}`,
  tests: (m: string) => `g:tests:${m}`,
  match: (m: string) => `g:match:${m}`,
  recent: () => `g:recent`,
};

type RecentEntry = { materialId: string; mode: string; at: number };

function touchRecent(materialId: string, mode: string) {
  const list = readLocal<RecentEntry[]>(k.recent(), []).filter((r) => !(r.materialId === materialId && r.mode === mode));
  list.unshift({ materialId, mode, at: Date.now() });
  writeLocal(k.recent(), list.slice(0, 30));
}

export function readGuestRecent(): RecentEntry[] {
  return readLocal<RecentEntry[]>(k.recent(), []);
}

export function readGuestStudyState(materialId: string, mode: string) {
  return readLocal<{ state: unknown; updatedAt: number } | null>(k.state(materialId, mode), null);
}

export function readGuestProgress(materialId: string): Record<string, ProgressEntry> {
  return readLocal<Record<string, ProgressEntry>>(k.progress(materialId), {});
}

export function readGuestStarredAll(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of localKeys("g:starred:")) {
    const m = key.slice("g:starred:".length);
    out[m] = readLocal<string[]>(key, []);
  }
  return out;
}

export function readGuestTestsAll(): Record<string, TestResultRecord[]> {
  const out: Record<string, TestResultRecord[]> = {};
  for (const key of localKeys("g:tests:")) {
    const m = key.slice("g:tests:".length);
    out[m] = readLocal<TestResultRecord[]>(key, []);
  }
  return out;
}

export function loadGuestStudyData(materialId: string): StudyData {
  const modes = ["set", "flashcards", "learn", "test", "match"];
  const modeSettings: Record<string, unknown> = {};
  const studyState: Record<string, unknown> = {};
  for (const mode of modes) {
    const s = readLocal<unknown>(k.settings(materialId, mode), null);
    if (s) modeSettings[mode] = s;
    const st = readLocal<{ state: unknown } | null>(k.state(materialId, mode), null);
    if (st) studyState[mode] = st.state;
  }
  return {
    modeSettings,
    studyState,
    progress: readGuestProgress(materialId),
    starred: readLocal<string[]>(k.starred(materialId), []),
    tests: readLocal<TestResultRecord[]>(k.tests(materialId), []),
    matchBestMs: readLocal<number | null>(k.match(materialId), null),
  };
}

export function createStudyStore(kind: Kind, materialId: string) {
  return {
    saveModeSettings(mode: string, settings: unknown) {
      if (kind === "guest") writeLocal(k.settings(materialId, mode), settings);
      else fireAndForget("/api/me/mode-settings", { materialId, mode, settings }, "PUT");
    },
    saveStudyState(mode: string, state: unknown | null) {
      if (kind === "guest") {
        if (state === null) removeLocal(k.state(materialId, mode));
        else {
          writeLocal(k.state(materialId, mode), { state, updatedAt: Date.now() });
          touchRecent(materialId, mode);
        }
      } else fireAndForget("/api/me/study-state", { materialId, mode, state }, "PUT");
    },
    saveProgress(updates: { cardId: string; level: number; streak: number; wrongDelta: number }[]) {
      if (updates.length === 0) return;
      if (kind === "guest") {
        const cur = readGuestProgress(materialId);
        for (const u of updates) {
          const prev = cur[u.cardId];
          cur[u.cardId] = { level: u.level, streak: u.streak, wrong: (prev?.wrong ?? 0) + u.wrongDelta, at: Date.now() };
        }
        writeLocal(k.progress(materialId), cur);
      } else fireAndForget("/api/me/progress", { materialId, updates });
    },
    resetProgress() {
      if (kind === "guest") removeLocal(k.progress(materialId));
      else fireAndForget("/api/me/progress", { materialId, reset: true });
    },
    setStar(cardId: string, starred: boolean) {
      if (kind === "guest") {
        const cur = new Set(readLocal<string[]>(k.starred(materialId), []));
        if (starred) cur.add(cardId);
        else cur.delete(cardId);
        writeLocal(k.starred(materialId), [...cur]);
      } else fireAndForget("/api/me/starred", { materialId, cardId, starred });
    },
    async saveTestResult(result: Omit<TestResultRecord, "id" | "createdAt">): Promise<string | null> {
      if (kind === "guest") {
        const id = `local-${Date.now()}`;
        const list = readLocal<TestResultRecord[]>(k.tests(materialId), []);
        list.unshift({ ...result, id, createdAt: new Date().toISOString() });
        writeLocal(k.tests(materialId), list.slice(0, 20));
        touchRecent(materialId, "test");
        return id;
      }
      try {
        const r = await api<{ id: string }>("/api/me/test-results", { method: "POST", body: { materialId, ...result } });
        return r.id;
      } catch {
        return null;
      }
    },
    async saveMatchTime(ms: number): Promise<number> {
      if (kind === "guest") {
        const prev = readLocal<number | null>(k.match(materialId), null);
        const best = prev == null ? ms : Math.min(prev, ms);
        writeLocal(k.match(materialId), best);
        touchRecent(materialId, "match");
        return best;
      }
      try {
        const r = await api<{ bestMs: number }>("/api/me/match-times", { method: "POST", body: { materialId, ms } });
        return r.bestMs;
      } catch {
        return ms;
      }
    },
  };
}

export type StudyStore = ReturnType<typeof createStudyStore>;

/** A szerverről kapott adatok (fiók) vagy a böngészőben tárolt adatok (vendég) egységes elérése. */
export function useStudyData(kind: Kind, materialId: string, serverData: StudyData | null) {
  const [data, setData] = useState<StudyData | null>(kind === "user" ? serverData : null);
  useEffect(() => {
    if (kind === "guest") setData(loadGuestStudyData(materialId));
  }, [kind, materialId]);
  const store = useMemo(() => createStudyStore(kind, materialId), [kind, materialId]);
  return { data, store, ready: data !== null };
}

/** Belépés után a vendégként gyűjtött adatok átküldése a fiókba, majd törlése az eszközről. */
export async function importGuestDataAfterLogin() {
  try {
    const keys = localKeys("g:");
    if (keys.length === 0) return;
    const materials = new Set<string>();
    for (const key of keys) {
      const parts = key.split(":");
      if (parts[1] !== "recent" && parts[2]) materials.add(parts[2]);
    }
    const payload = [...materials].slice(0, 200).map((materialId) => ({ materialId, ...loadGuestStudyData(materialId) }));
    for (let i = 0; i < payload.length; i += 20) {
      await api("/api/me/import-guest", { method: "POST", body: { items: payload.slice(i, i + 20) } });
    }
    for (const key of keys) removeLocal(key);
  } catch (e) {
    console.warn("[import]", e);
  }
}
