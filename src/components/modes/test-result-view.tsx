"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type { TestQuestionDetail } from "@/lib/study-types";
import { Switch, cn } from "../ui";

export function formatMs(ms: number, tc: (k: string, v?: Record<string, number>) => string) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? tc("minutesSeconds", { m: Math.floor(s / 60), s: s % 60 }) : tc("seconds", { s });
}

export function TestScoreHeader({ percent, grade, correct, total, durationMs }: { percent: number; grade: number; correct: number; total: number; durationMs: number }) {
  const t = useTranslations("test");
  const tc = useTranslations("common");
  const color = grade >= 4 ? "var(--known)" : grade === 3 ? "var(--primary)" : "var(--learning)";
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-10">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-3)" strokeWidth="12" />
          <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="12" strokeDasharray={`${(percent / 100) * 314} 314`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold tabular-nums">{percent}%</span>
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-center sm:grid-cols-1 sm:text-left">
        <div>
          <dt className="text-sm text-muted">{t("grade")}</dt>
          <dd className="text-2xl font-extrabold" style={{ color }}>
            {t("gradeValue", { grade })}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{t("resultTitle")}</dt>
          <dd className="text-lg font-bold">{t("score", { correct, total })}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{t("elapsed")}</dt>
          <dd className="text-lg font-bold tabular-nums">{formatMs(durationMs, tc)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TestAnswerList({ questions }: { questions: TestQuestionDetail[] }) {
  const t = useTranslations("test");
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const list = onlyMistakes ? questions.filter((q) => !q.correct) : questions;
  const tfLabel = (v: string | null) => (v === "true" ? t("true") : v === "false" ? t("false") : v);
  return (
    <section>
      <div className="mb-3 rounded-2xl bg-surface px-4 shadow-card">
        <Switch label={t("onlyMistakes")} checked={onlyMistakes} onChange={setOnlyMistakes} />
      </div>
      {list.length === 0 ? <p className="py-6 text-center font-semibold text-known">{t("allCorrect")}</p> : null}
      <ol className="flex flex-col gap-3">
        {list.map((q, i) => (
          <li key={`${q.cardId}-${i}`} className={cn("rounded-2xl border-l-4 bg-surface p-4 shadow-card", q.correct ? "border-known" : "border-danger")}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="whitespace-pre-wrap break-words font-semibold">{q.prompt}</p>
              {q.correct ? <Check className="size-5 shrink-0 text-known" aria-label={t("instantCorrect")} /> : <X className="size-5 shrink-0 text-danger" aria-label={t("instantWrong")} />}
            </div>
            {q.type === "tf" && q.shown ? <p className="mb-2 text-sm text-muted">→ {q.shown}</p> : null}
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className={cn("rounded-xl p-2.5", q.correct ? "bg-known-soft" : "bg-danger-soft")}>
                <p className={cn("font-semibold", q.correct ? "text-known" : "text-danger")}>{t("yourAnswer")}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{q.userAnswer ? tfLabel(q.userAnswer) : <em className="text-muted">{t("noAnswer")}</em>}</p>
              </div>
              {!q.correct ? (
                <div className="rounded-xl bg-known-soft p-2.5">
                  <p className="font-semibold text-known">{t("correctAnswer")}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{tfLabel(q.correctAnswer)}</p>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
