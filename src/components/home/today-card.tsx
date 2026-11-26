"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Flame } from "lucide-react";
import { useActivity } from "@/lib/client/activity";
import { readGuestSrsAll } from "@/lib/client/study-store";
import { isDue } from "@/lib/srs";
import { visibleStreak } from "@/lib/streak";
import { useSettings } from "../providers";
import { cn } from "../ui";

/** Főoldali kártya: mai cél, sorozat, esedékes ismétlések. */
export function TodayCard({ serverDue }: { serverDue: number | null }) {
  const t = useTranslations("streak");
  const a = useActivity();
  const { viewer } = useSettings();
  const [due, setDue] = useState<number | null>(serverDue);

  useEffect(() => {
    if (viewer.kind !== "guest") return;
    const now = Date.now();
    let n = 0;
    for (const set of Object.values(readGuestSrsAll())) for (const c of Object.values(set)) if (isDue(c, now)) n++;
    setDue(n);
  }, [viewer.kind]);

  if (!a.ready || !a.today) return null;
  const v = visibleStreak(a.streak, a.today);
  const pct = Math.min(100, Math.round((a.items / Math.max(1, a.goal)) * 100));
  return (
    <section aria-label={t("todayTitle")} className="mb-8 rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="whitespace-nowrap text-lg font-bold">{t("todayTitle")}</h2>
            <Link href="/stats" className={cn("inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold", v.current > 0 ? "text-accent" : "text-muted")}>
              <Flame className="size-4" aria-hidden /> {t("badge", { count: v.current })}
            </Link>
          </div>
          <p className="text-sm text-muted">
            {a.goalMet ? t("goalDone") : v.atRisk ? t("atRisk") : t("goalLeft", { count: Math.max(0, a.goal - a.items) })}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={Math.min(a.items, a.goal)}>
              <div className={cn("h-full rounded-full transition-all", a.goalMet ? "bg-known" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{t("todayProgress", { done: a.items, goal: a.goal })}</span>
          </div>
        </div>
        {due !== null && due > 0 ? (
          <Link href="/review" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-on-primary">
            <CalendarClock className="size-5" aria-hidden /> {t("reviewDue", { count: due })}
          </Link>
        ) : due === 0 ? (
          <span className="text-sm text-muted">{t("noReviewDue")}</span>
        ) : null}
      </div>
    </section>
  );
}
