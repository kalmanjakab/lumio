"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DueItem } from "@/lib/server/review";
import { readGuestSrsAll } from "@/lib/client/study-store";
import { api } from "@/lib/client/api";
import { isDue } from "@/lib/srs";
import { Spinner } from "../ui";
import { ModeHeader } from "./mode-header";
import { ReviewSession, type ReviewItem } from "./review-session";

type LookupCard = { id: string; term: string; definition: string; imageId: string | null; materialId: string; termLang: string; definitionLang: string };

function fromDue(d: Omit<DueItem, "srs"> & { srs: DueItem["srs"] }): ReviewItem {
  return {
    card: { id: d.id, term: d.term, definition: d.definition, imageId: d.imageId },
    materialId: d.materialId,
    termLang: d.termLang,
    definitionLang: d.definitionLang,
    srs: d.srs,
  };
}

/** Az összes készlet esedékes kártyái. Fióknál a szerver adja, vendégnél a böngészőben tárolt állapotból jön. */
export function GlobalReview({ serverItems }: { serverItems: DueItem[] | null }) {
  const t = useTranslations("review");
  const [items, setItems] = useState<ReviewItem[] | null>(serverItems ? serverItems.map(fromDue) : null);

  useEffect(() => {
    if (serverItems) return;
    const all = readGuestSrsAll();
    const now = Date.now();
    const due: { cardId: string; srs: NonNullable<ReviewItem["srs"]> }[] = [];
    for (const map of Object.values(all)) for (const [cardId, srs] of Object.entries(map)) if (isDue(srs, now)) due.push({ cardId, srs });
    due.sort((a, b) => a.srs.due - b.srs.due);
    const pick = due.slice(0, 200);
    if (!pick.length) {
      setItems([]);
      return;
    }
    api<{ cards: LookupCard[] }>("/api/cards/lookup", { method: "POST", body: { ids: pick.map((d) => d.cardId) } })
      .then((r) => {
        const byId = new Map(r.cards.map((c) => [c.id, c]));
        setItems(
          pick
            .filter((d) => byId.has(d.cardId))
            .map((d) => {
              const c = byId.get(d.cardId)!;
              return { card: { id: c.id, term: c.term, definition: c.definition, imageId: c.imageId }, materialId: c.materialId, termLang: c.termLang, definitionLang: c.definitionLang, srs: d.srs };
            }),
        );
      })
      .catch(() => setItems([]));
  }, [serverItems]);

  if (!items) {
    return (
      <div className="min-h-dvh">
        <ModeHeader backHref="/" center={t("todayTitle")} />
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </div>
    );
  }
  return <ReviewSession items={items} backHref="/" title={t("todayTitle")} />;
}
