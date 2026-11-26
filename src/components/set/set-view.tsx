"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Layers, RefreshCcw, FileCheck2, Shapes, Star, Volume2, Globe, Users, UserRound, CalendarClock, Ear } from "lucide-react";
import type { CardDTO, MaterialDTO, StudyData, TestResultRecord } from "@/lib/study-types";
import { useStudyData } from "@/lib/client/study-store";
import { speak } from "@/lib/client/tts";
import { useSettings } from "../providers";
import { CardPreview } from "./card-preview";
import { GuestNudge } from "../home/guest-nudge";
import { SetOwnerActions } from "./own-set-actions";
import { OfflineToggle } from "./offline-toggle";
import { AiStudyTips } from "../ai/ai-study-tips";
import { AiCardButton } from "../ai/ai-card-button";
import { CardImage } from "../card-image";
import { LevelBar, LevelDot } from "./level-bar";
import { cardLevel, isDue, levelCounts } from "@/lib/srs";
import { Switch, cn } from "../ui";

const MODES = [
  { key: "review", icon: CalendarClock },
  { key: "flashcards", icon: Layers },
  { key: "learn", icon: RefreshCcw },
  { key: "test", icon: FileCheck2 },
  { key: "match", icon: Shapes },
  { key: "dictation", icon: Ear },
] as const;

export function SetView({ material, cards, serverData }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null }) {
  const t = useTranslations("set");
  const tc = useTranslations("common");
  const tr = useTranslations("review");
  const format = useFormatter();
  const { viewer, settings } = useSettings();
  const { data, store } = useStudyData(viewer.kind, material.id, serverData);
  const [starred, setStarred] = useState<Set<string>>(new Set(serverData?.starred ?? []));
  const [starredOnly, setStarredOnly] = useState<boolean>(Boolean((serverData?.modeSettings.set as { starredOnly?: boolean } | undefined)?.starredOnly));

  useEffect(() => {
    if (!data) return;
    setStarred(new Set(data.starred));
    setStarredOnly(Boolean((data.modeSettings.set as { starredOnly?: boolean } | undefined)?.starredOnly));
  }, [data]);

  const visible = useMemo(() => (starredOnly ? cards.filter((c) => starred.has(c.id)) : cards), [cards, starred, starredOnly]);
  const counts = useMemo(() => levelCounts(cards.map((c) => c.id), data?.srs ?? {}, data?.progress ?? {}), [cards, data]);
  const mastered = counts.mastered;
  const dueCount = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => isDue(data?.srs?.[c.id], now)).length;
  }, [cards, data]);
  const tests: TestResultRecord[] = data?.tests ?? [];

  const toggleStar = (id: string) => {
    setStarred((s) => {
      const n = new Set(s);
      const on = !n.has(id);
      if (on) n.add(id);
      else n.delete(id);
      store.setStar(id, on);
      return n;
    });
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{material.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {material.isOwn ? (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4" aria-hidden /> {t("ownSet")}
            </span>
          ) : material.groupId ? (
            <Link href={`/groups/${material.groupId}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
              <Users className="size-4" aria-hidden /> {material.groupName}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-4" aria-hidden /> {tc("public")}
            </span>
          )}
          <span aria-hidden>·</span>
          <span>{tc("cards", { count: cards.length })}</span>
          {mastered > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-known">{t("progressMastered", { count: mastered })}</span>
            </>
          ) : null}
        </div>
        {material.description ? <p className="mt-2 max-w-prose text-fg">{material.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <SetOwnerActions materialId={material.id} isOwn={material.isOwn} />
          <OfflineToggle material={material} cards={cards} />
          {cards.length ? <AiStudyTips materialId={material.id} /> : null}
        </div>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-muted shadow-card">{t("empty")}</p>
      ) : (
        <>
          <CardPreview cards={visible.length ? visible : cards} termLang={material.termLang} definitionLang={material.definitionLang} />

          {data ? <LevelBar counts={counts} className="mb-6" /> : null}

          <section aria-labelledby="modes-title" className="mb-6">
            <h2 id="modes-title" className="sr-only">
              {t("modes")}
            </h2>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {MODES.map(({ key, icon: Icon }) => (
                <li key={key}>
                  <Link
                    href={`/sets/${material.id}/${key}`}
                    className="flex h-full items-center gap-3 rounded-2xl bg-surface p-4 font-bold shadow-card transition-[transform,background] hover:-translate-y-0.5 hover:bg-surface-2 sm:p-5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block">{t(key)}</span>
                      {key === "review" && dueCount > 0 ? <span className="block text-xs font-semibold text-accent">{tr("dueBadge", { count: dueCount })}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="mb-8 rounded-2xl bg-surface px-4 shadow-card">
            <Switch
              label={t("starredOnly")}
              checked={starredOnly}
              onChange={(v) => {
                setStarredOnly(v);
                store.saveModeSettings("set", { starredOnly: v });
              }}
            />
          </div>
          {starredOnly && visible.length === 0 ? <p className="-mt-5 mb-8 text-sm font-medium text-learning">{t("starredOnlyEmpty")}</p> : null}

          {tests.length ? (
            <section aria-labelledby="tests-title" className="mb-8">
              <h2 id="tests-title" className="mb-3 text-lg font-bold">
                {t("pastTests")}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
                {tests.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={`/sets/${material.id}/tests/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                      <span className="font-semibold">{format.dateTime(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
                      <span className="text-sm text-muted">{t("testSummary", { percent: r.percent, grade: r.grade })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="terms-title">
            <h2 id="terms-title" className="mb-3 text-lg font-bold">
              {t("termsInSet", { count: cards.length })}
            </h2>
            <ul className="flex flex-col gap-2">
              {cards.map((c) => {
                const on = starred.has(c.id);
                return (
                  <li key={c.id} className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-card">
                    {data ? (
                      <span className="mt-2">
                        <LevelDot level={cardLevel(data.srs?.[c.id], data.progress[c.id])} />
                      </span>
                    ) : null}
                    <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6">
                      <span className="whitespace-pre-wrap break-words font-semibold">{c.term}</span>
                      <span className="flex items-start justify-between gap-3 sm:border-l sm:border-border sm:pl-6">
                        <span className="whitespace-pre-wrap break-words text-fg">{c.definition}</span>
                        <CardImage id={c.imageId} size="sm" className="mx-0 shrink-0" />
                      </span>
                    </div>
                    <div className="-my-1 flex shrink-0 gap-1">
                      <AiCardButton cardId={c.id} term={c.term} />
                      <button
                        type="button"
                        onClick={() => speak(c.term, material.termLang, { rate: settings.ttsRate, volume: settings.volume })}
                        aria-label={`${tc("speak")}: ${c.term}`}
                        title={tc("speak")}
                        className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <Volume2 className="size-5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStar(c.id)}
                        aria-pressed={on}
                        aria-label={on ? tc("unstar") : tc("star")}
                        title={on ? tc("unstar") : tc("star")}
                        className={cn("flex size-10 items-center justify-center rounded-full hover:bg-surface-2", on ? "text-accent" : "text-muted hover:text-fg")}
                      >
                        <Star className="size-5" fill={on ? "currentColor" : "none"} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="mt-8">
            <GuestNudge compact />
          </div>
        </>
      )}
    </div>
  );
}
