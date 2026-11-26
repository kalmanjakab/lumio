"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { CardDTO, MaterialDTO, StudyData } from "@/lib/study-types";
import { useStudyData } from "@/lib/client/study-store";
import { useModeCards } from "@/lib/client/use-mode-cards";
import { isDue } from "@/lib/srs";
import { useSettings } from "../providers";
import { Spinner } from "../ui";
import { ModeEmpty, ModeHeader } from "./mode-header";
import { ReviewSession, type ReviewItem } from "./review-session";

type Plan = { items: ReviewItem[]; key: number };

/** Egy készlet ismétlése: az esedékes kártyák, utánuk legfeljebb N új kártya. */
export function ReviewMode({ material, cards: allCards, serverData }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null }) {
  const t = useTranslations("review");
  const tc = useTranslations("common");
  const ts = useTranslations("set");
  const format = useFormatter();
  const { viewer, settings } = useSettings();
  const { data, ready } = useStudyData(viewer.kind, material.id, serverData);
  const { cards, emptyBecauseStarred } = useModeCards(allCards, data, null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const backHref = `/sets/${material.id}`;

  const info = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const toItem = (c: CardDTO): ReviewItem => ({ card: c, materialId: material.id, termLang: material.termLang, definitionLang: material.definitionLang, srs: data.srs[c.id] ?? null });
    const seen = cards.filter((c) => data.srs[c.id] && data.srs[c.id]!.state !== 0);
    const due = seen.filter((c) => isDue(data.srs[c.id], now)).sort((a, b) => data.srs[a.id]!.due - data.srs[b.id]!.due);
    const fresh = cards.filter((c) => !data.srs[c.id] || data.srs[c.id]!.state === 0);
    const nextDue = seen.filter((c) => !isDue(data.srs[c.id], now)).reduce<number | null>((m, c) => (m === null ? data.srs[c.id]!.due : Math.min(m, data.srs[c.id]!.due)), null);
    return {
      normal: [...due, ...fresh.slice(0, settings.newPerSession)].map(toItem),
      dueCount: due.length,
      newCount: Math.min(fresh.length, settings.newPerSession),
      freshTotal: fresh.length,
      early: seen.slice().sort((a, b) => data.srs[a.id]!.due - data.srs[b.id]!.due).slice(0, 50).map(toItem),
      moreNew: fresh.slice(0, 20).map(toItem),
      nextDue,
    };
  }, [data, cards, material, settings.newPerSession]);

  if (!ready || !info) {
    return (
      <div className="min-h-dvh">
        <ModeHeader backHref={backHref} center={t("title")} />
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </div>
    );
  }
  if (emptyBecauseStarred || cards.length === 0) {
    return <ModeEmpty backHref={backHref} title={t("title")} text={emptyBecauseStarred ? ts("starredOnlyEmpty") : t("noCards")} actionLabel={tc("back")} />;
  }

  const start = (items: ReviewItem[]) => setPlan({ items, key: Date.now() });
  const active = plan ?? (info.normal.length ? { items: info.normal, key: 0 } : null);
  if (active) {
    return (
      <ReviewSession
        key={active.key}
        items={active.items}
        backHref={backHref}
        title={material.title}
        doneExtra={
          info.freshTotal > 0 ? (
            <button type="button" onClick={() => start(info.moreNew)} className="font-semibold text-primary hover:underline">
              {t("learnMoreNew")}
            </button>
          ) : null
        }
      />
    );
  }

  // Nincs esedékes és nincs új kártya: lehetőség korábbi ismétlésre.
  return (
    <div className="min-h-dvh">
      <ModeHeader backHref={backHref} center={t("title")} />
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-14 text-center">
        <h1 className="text-2xl font-extrabold">{t("nothingDue")}</h1>
        <p className="text-muted">
          {info.nextDue ? t("nextDue", { when: format.relativeTime(new Date(info.nextDue), new Date()) }) : t("allCaughtUp")}
        </p>
        {info.early.length ? (
          <button type="button" onClick={() => start(info.early)} className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-on-primary">
            {t("reviewEarly")}
          </button>
        ) : null}
      </main>
    </div>
  );
}
