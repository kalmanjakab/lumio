"use client";

import { useEffect, useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { addDays, dayDiff } from "@/lib/streak";
import { cn } from "../ui";

export type HeatDay = { day: string; items: number; goalMet: boolean; frozen: boolean };

/** Naptár-hőtérkép: oszlopok a hetek, sorok a napok (hétfőtől). Minél sötétebb, annál többet tanultál. */
export function Heatmap({ today, days, goal, weeks = 26 }: { today: string; days: HeatDay[]; goal: number; weeks?: number }) {
  const t = useTranslations("stats");
  const format = useFormatter();
  const by = new Map(days.map((d) => [d.day, d]));
  const scroller = useRef<HTMLDivElement>(null);
  // Keskeny kijelzőn a legfrissebb hetek látszódjanak.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [today]);
  // A rács a mai hét vasárnapjáig tart.
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = hétfő
  const end = addDays(today, 6 - dow);
  const start = addDays(end, -(weeks * 7 - 1));
  const cols: string[][] = [];
  for (let w = 0; w < weeks; w++) cols.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const level = (d: HeatDay | undefined): string => {
    if (!d || d.items === 0) return d?.frozen ? "frozen" : "0";
    if (d.goalMet) return d.items >= goal * 2 ? "4" : "3";
    return d.items >= goal / 2 ? "2" : "1";
  };
  const cls: Record<string, string> = {
    "0": "bg-surface-2",
    "1": "bg-primary/25",
    "2": "bg-primary/50",
    "3": "bg-primary/80",
    "4": "bg-primary",
    frozen: "bg-accent/40",
  };
  return (
    <div>
      <div ref={scroller} className="no-scrollbar overflow-x-auto">
        <div className="flex w-max gap-[3px]" role="img" aria-label={t("heatmapAria", { weeks })}>
          {cols.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((day) => {
                const d = by.get(day);
                const future = dayDiff(today, day) > 0;
                return (
                  <span
                    key={day}
                    title={
                      future
                        ? undefined
                        : `${format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}: ${t("dayItems", { count: d?.items ?? 0 })}${d?.frozen ? ` (${t("frozenDay")})` : ""}`
                    }
                    className={cn("size-3 rounded-[3px] sm:size-3.5", future ? "bg-transparent" : cls[level(d)], day === today && "ring-2 ring-fg/40")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t("less")}</span>
        {["0", "1", "2", "3", "4"].map((k) => (
          <span key={k} className={cn("size-3 rounded-[3px]", cls[k])} aria-hidden />
        ))}
        <span>{t("more")}</span>
        <span className="ml-3 inline-flex items-center gap-1">
          <span className={cn("size-3 rounded-[3px]", cls.frozen)} aria-hidden /> {t("frozenDay")}
        </span>
      </div>
    </div>
  );
}
