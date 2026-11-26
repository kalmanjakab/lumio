"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Flame } from "lucide-react";
import { useActivity } from "@/lib/client/activity";
import { visibleStreak } from "@/lib/streak";
import { cn } from "../ui";

/** Sorozat a felső sávban: színes, ha ma már teljesült a cél, halvány, ha még nem. */
export function StreakBadge() {
  const t = useTranslations("streak");
  const a = useActivity();
  if (!a.ready) return <span className="size-11" aria-hidden />;
  const v = visibleStreak(a.streak, a.today);
  const done = a.goalMet || v.doneToday;
  return (
    <Link
      href="/stats"
      aria-label={t("badge", { count: v.current })}
      title={t("badge", { count: v.current })}
      className={cn("inline-flex h-11 items-center gap-1 rounded-full px-2.5 font-bold tabular-nums hover:bg-surface-2", done ? "text-accent" : "text-muted")}
    >
      <Flame className="size-6" fill={done ? "currentColor" : "none"} aria-hidden />
      {v.current}
    </Link>
  );
}
