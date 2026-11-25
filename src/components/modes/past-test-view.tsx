"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { TestResultRecord } from "@/lib/study-types";
import { readLocal } from "@/lib/client/storage";
import { TestAnswerList, TestScoreHeader } from "./test-result-view";
import { Spinner } from "../ui";

export function PastTestView({ materialId, materialTitle, record, localId }: { materialId: string; materialTitle: string; record: TestResultRecord | null; localId: string | null }) {
  const t = useTranslations("test");
  const format = useFormatter();
  const [rec, setRec] = useState<TestResultRecord | null | undefined>(record ?? undefined);
  useEffect(() => {
    if (localId) {
      const list = readLocal<TestResultRecord[]>(`g:tests:${materialId}`, []);
      setRec(list.find((r) => r.id === localId) ?? null);
    }
  }, [localId, materialId]);
  const backHref = `/sets/${materialId}`;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-3">
          <Link href={backHref} aria-label={t("backToSet")} title={t("backToSet")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <X className="size-6" aria-hidden />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm text-muted">{materialTitle}</p>
            <p className="font-bold">{t("pastResult")}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-16 pt-2">
        {rec === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : rec === null ? (
          <p className="py-16 text-center text-muted">{t("notFound")}</p>
        ) : (
          <>
            <p className="text-center text-sm text-muted">{format.dateTime(new Date(rec.createdAt), { dateStyle: "long", timeStyle: "short" })}</p>
            <TestScoreHeader percent={rec.percent} grade={rec.grade} correct={rec.correct} total={rec.total} durationMs={rec.durationMs} />
            <TestAnswerList questions={rec.details.questions} />
          </>
        )}
      </main>
    </div>
  );
}
