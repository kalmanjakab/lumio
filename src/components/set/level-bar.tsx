"use client";

import { useTranslations } from "next-intl";
import { cn } from "../ui";

export type LevelCounts = { newCount: number; learning: number; known: number; mastered: number };

const SEGMENTS = [
  { key: "mastered", cls: "bg-known" },
  { key: "known", cls: "bg-primary" },
  { key: "learning", cls: "bg-learning" },
  { key: "newCount", cls: "bg-border" },
] as const;

/** Négy szint egy sávban: rögzült, tudom, tanulom, új. */
export function LevelBar({ counts, className, legend = true }: { counts: LevelCounts; className?: string; legend?: boolean }) {
  const t = useTranslations("levels");
  const total = counts.newCount + counts.learning + counts.known + counts.mastered;
  if (!total) return null;
  const pct = Math.round(((counts.known + counts.mastered) / total) * 100);
  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={t("aria", { pct, mastered: counts.mastered, known: counts.known, learning: counts.learning, fresh: counts.newCount })}>
        {SEGMENTS.map((s) => (counts[s.key] ? <span key={s.key} className={cn("h-full", s.cls)} style={{ width: `${(counts[s.key] / total) * 100}%` }} /> : null))}
      </div>
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {SEGMENTS.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", s.cls)} aria-hidden />
              {t(s.key, { count: counts[s.key] })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const DOT = ["bg-border", "bg-learning", "bg-primary", "bg-known"];

/** Egy kártya szintjének kis jelölése a listában. */
export function LevelDot({ level }: { level: 0 | 1 | 2 | 3 }) {
  const t = useTranslations("levels");
  const names = ["levelNew", "levelLearning", "levelKnown", "levelMastered"] as const;
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT[level])} title={t(names[level])} aria-label={t(names[level])} role="img" />;
}
