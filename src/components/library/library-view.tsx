"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Star, Volume2 } from "lucide-react";
import { useSettings } from "../providers";
import { GroupTile, MaterialRow } from "../material-row";
import { EmptyState, cn } from "../ui";
import { api } from "@/lib/client/api";
import { readGuestRecent, readGuestStarredAll, readGuestTestsAll } from "@/lib/client/study-store";
import { speak } from "@/lib/client/tts";

type Starred = { id: string; term: string; definition: string; materialId: string; materialTitle: string; termLang: string; definitionLang: string };
type Recent = { materialId: string; title: string; cardCount: number };
type TestItem = { id: string; materialId: string; materialTitle: string; percent: number; grade: number; createdAt: string };
type Group = { id: string; name: string; materialCount: number | null };

const TABS = ["groups", "starred", "recent", "tests"] as const;
type Tab = (typeof TABS)[number];

export function LibraryView({
  groups,
  materials,
  serverStarred,
  serverRecent,
  serverTests,
}: {
  groups: Group[];
  materials: { id: string; title: string; cardCount: number }[];
  serverStarred: Starred[] | null;
  serverRecent: Recent[] | null;
  serverTests: TestItem[] | null;
}) {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const ts = useTranslations("set");
  const format = useFormatter();
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("groups");
  const [starred, setStarred] = useState<Starred[] | null>(serverStarred);
  const [recent, setRecent] = useState<Recent[] | null>(serverRecent);
  const [tests, setTests] = useState<TestItem[] | null>(serverTests);

  useEffect(() => {
    const byId = new Map(materials.map((m) => [m.id, m]));
    if (serverRecent === null) {
      const seen = new Set<string>();
      const list: Recent[] = [];
      for (const r of readGuestRecent()) {
        const m = byId.get(r.materialId);
        if (m && !seen.has(m.id)) {
          seen.add(m.id);
          list.push({ materialId: m.id, title: m.title, cardCount: m.cardCount });
        }
      }
      setRecent(list);
    }
    if (serverTests === null) {
      const all = readGuestTestsAll();
      const list: TestItem[] = [];
      for (const [mid, arr] of Object.entries(all)) {
        const m = byId.get(mid);
        if (!m) continue;
        for (const r of arr) list.push({ id: r.id, materialId: mid, materialTitle: m.title, percent: r.percent, grade: r.grade, createdAt: r.createdAt });
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setTests(list);
    }
    if (serverStarred === null) {
      const ids = Object.values(readGuestStarredAll()).flat();
      if (ids.length === 0) setStarred([]);
      else
        api<{ cards: Starred[] }>("/api/cards/lookup", { method: "POST", body: { ids } })
          .then((r) => setStarred(r.cards))
          .catch(() => setStarred([]));
    }
  }, [materials, serverRecent, serverStarred, serverTests]);

  const tabLabel: Record<Tab, string> = { groups: t("tabGroups"), starred: t("tabStarred"), recent: t("tabRecent"), tests: t("tabTests") };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      <div role="tablist" aria-label={t("title")} className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setTab(k)}
            className={cn("h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors", tab === k ? "bg-primary text-on-primary" : "bg-surface text-muted shadow-card hover:text-fg")}
          >
            {tabLabel[k]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "groups" ? (
          groups.length === 0 ? (
            <EmptyState>{tc("locked")}</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <li key={g.id}>
                  <GroupTile href={`/groups/${g.id}`} name={g.name} meta={tc("materials", { count: g.materialCount ?? 0 })} locked={false} />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "starred" ? (
          starred === null ? null : starred.length === 0 ? (
            <EmptyState icon={<Star className="size-8" aria-hidden />}>{t("noStarred")}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {starred.map((c) => (
                <li key={c.id} className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-card">
                  <div className="min-w-0 flex-1">
                    <div className="grid gap-1 sm:grid-cols-2 sm:gap-6">
                      <span className="whitespace-pre-wrap break-words font-semibold">{c.term}</span>
                      <span className="whitespace-pre-wrap break-words">{c.definition}</span>
                    </div>
                    <Link href={`/sets/${c.materialId}`} className="mt-1 inline-block text-sm font-semibold text-primary hover:underline">
                      {c.materialTitle}
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => speak(c.term, c.termLang, { rate: settings.ttsRate, volume: settings.volume })}
                    aria-label={`${tc("speak")}: ${c.term}`}
                    title={tc("speak")}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                  >
                    <Volume2 className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "recent" ? (
          recent === null ? null : recent.length === 0 ? (
            <EmptyState>{t("noRecent")}</EmptyState>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {recent.map((r) => (
                <li key={r.materialId}>
                  <MaterialRow href={`/sets/${r.materialId}`} title={r.title} meta={tc("cards", { count: r.cardCount })} />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "tests" ? (
          tests === null ? null : tests.length === 0 ? (
            <EmptyState>{t("noTests")}</EmptyState>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
              {tests.map((r) => (
                <li key={r.id}>
                  <Link href={`/sets/${r.materialId}/tests/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.materialTitle}</span>
                      <span className="block text-sm text-muted">{format.dateTime(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">{ts("testSummary", { percent: r.percent, grade: r.grade })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
