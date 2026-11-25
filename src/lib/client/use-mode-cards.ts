"use client";

import { useMemo } from "react";
import type { CardDTO, StudyData } from "@/lib/study-types";

/** A „Csak a csillagozott kártyák” kapcsoló alapján szűrt kártyalista. */
export function useModeCards(cards: CardDTO[], data: StudyData | null, subset?: string[] | null) {
  return useMemo(() => {
    if (subset && subset.length) {
      const set = new Set(subset);
      return { cards: cards.filter((c) => set.has(c.id)), starredOnly: false, emptyBecauseStarred: false };
    }
    const starredOnly = Boolean((data?.modeSettings.set as { starredOnly?: boolean } | undefined)?.starredOnly);
    if (!starredOnly) return { cards, starredOnly, emptyBecauseStarred: false };
    const starred = new Set(data?.starred ?? []);
    const filtered = cards.filter((c) => starred.has(c.id));
    return { cards: filtered, starredOnly, emptyBecauseStarred: filtered.length === 0 };
  }, [cards, data, subset]);
}
