"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { readGuestProgress, readGuestRecent, readGuestStudyState } from "@/lib/client/study-store";
import { cn } from "../ui";

export type ContinueItem = {
  materialId: string;
  title: string;
  mode: string;
  cardCount: number;
  done: number;
  kind: "sorted" | "learned" | "none";
};

function guestItems(materials: { id: string; title: string; cardCount: number }[]): ContinueItem[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const out: ContinueItem[] = [];
  for (const r of readGuestRecent()) {
    const m = byId.get(r.materialId);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    if (r.mode === "flashcards") {
      const st = readGuestStudyState(m.id, "flashcards")?.state as { known?: string[]; learning?: string[] } | undefined;
      const done = (st?.known?.length ?? 0) + (st?.learning?.length ?? 0);
      out.push({ materialId: m.id, title: m.title, mode: r.mode, cardCount: m.cardCount, done: Math.min(done, m.cardCount), kind: "sorted" });
    } else if (r.mode === "learn") {
      const mastered = Object.values(readGuestProgress(m.id)).filter((p) => p.level >= 3).length;
      out.push({ materialId: m.id, title: m.title, mode: r.mode, cardCount: m.cardCount, done: Math.min(mastered, m.cardCount), kind: "learned" });
    } else {
      out.push({ materialId: m.id, title: m.title, mode: r.mode, cardCount: m.cardCount, done: 0, kind: "none" });
    }
    if (out.length >= 8) break;
  }
  return out;
}

export function ContinueCarousel({ serverItems, materials }: { serverItems: ContinueItem[] | null; materials: { id: string; title: string; cardCount: number }[] }) {
  const t = useTranslations("home");
  const [items, setItems] = useState<ContinueItem[] | null>(serverItems);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (serverItems === null) setItems(guestItems(materials));
  }, [serverItems, materials]);

  if (!items || items.length === 0) return null;

  const scrollTo = (i: number) => {
    const el = ref.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  return (
    <section aria-labelledby="continue-title" className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="continue-title" className="text-lg font-bold sm:text-xl">
          {t("continue")}
        </h2>
        {items.length > 1 ? (
          <div className="hidden gap-1 sm:flex">
            <button type="button" onClick={() => scrollTo(Math.max(0, active - 1))} aria-label={t("previous")} title={t("previous")} className="flex size-10 items-center justify-center rounded-full bg-surface shadow-card disabled:opacity-40" disabled={active === 0}>
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => scrollTo(Math.min(items.length - 1, active + 1))} aria-label={t("nextItem")} title={t("nextItem")} className="flex size-10 items-center justify-center rounded-full bg-surface shadow-card disabled:opacity-40" disabled={active >= items.length - 1}>
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={ref}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6"
        onScroll={(e) => {
          const el = e.currentTarget;
          const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1;
          setActive(Math.round(el.scrollLeft / (w + 16)));
        }}
      >
        {items.map((it) => {
          const pct = it.cardCount ? (it.done / it.cardCount) * 100 : 0;
          const href = `/sets/${it.materialId}/${it.mode === "learn" || it.mode === "flashcards" || it.mode === "test" || it.mode === "match" ? it.mode : ""}`;
          return (
            <article key={it.materialId} className="relative w-[85%] shrink-0 snap-start overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card sm:w-[26rem]">
              <div className="pointer-events-none absolute -right-6 -top-6 flex size-32 items-center justify-center rounded-full bg-primary-soft/70" aria-hidden>
                <Layers className="size-12 text-primary/50" />
              </div>
              <h3 className="relative line-clamp-2 min-h-[3.25rem] pr-16 text-lg font-bold">{it.title}</h3>
              {it.kind !== "none" ? (
                <>
                  <div className="relative mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className={cn("h-full", it.kind === "sorted" ? "bg-known" : "bg-known")} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {it.kind === "sorted" ? t("sorted", { done: it.done, total: it.cardCount }) : t("learned", { done: it.done, total: it.cardCount })}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">{it.cardCount}</p>
              )}
              <Link href={href} className="relative mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover">
                {t("continueButton")}
              </Link>
            </article>
          );
        })}
      </div>
      {items.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {items.map((it, i) => (
            <span key={it.materialId} className={cn("size-2 rounded-full transition-colors", i === active ? "bg-primary" : "bg-surface-3")} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
