"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudUpload, X } from "lucide-react";
import { readLocal, writeLocal } from "@/lib/client/storage";
import { useSettings } from "../providers";

const SNOOZE_DAYS = 7;

/** Nem tolakodó regisztrációs ajánló vendégeknek; elutasítás után egy hétig nem jön elő. */
export function GuestNudge({ compact }: { compact?: boolean }) {
  const t = useTranslations("nudge");
  const { viewer } = useSettings();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const at = readLocal<number>("nudgeDismissedAt", 0);
    setShow(Date.now() - at > SNOOZE_DAYS * 86400_000);
  }, []);
  if (viewer.kind !== "guest" || !show) return null;
  if (compact) {
    return (
      <p className="text-center text-sm text-muted">
        {t("summaryHint")}{" "}
        <Link href="/login?mode=register" className="font-semibold text-primary hover:underline">
          {t("cta")}
        </Link>
      </p>
    );
  }
  return (
    <aside className="mb-8 flex items-start gap-3 rounded-2xl bg-primary-soft p-4">
      <CloudUpload className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-fg">{t("title")}</p>
        <p className="mt-0.5 text-sm text-muted">{t("text")}</p>
        <div className="mt-3 flex gap-2">
          <Link href="/login?mode=register" className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary">
            {t("cta")}
          </Link>
          <button
            type="button"
            className="h-9 rounded-full px-3 text-sm font-semibold text-primary hover:bg-surface"
            onClick={() => {
              writeLocal("nudgeDismissedAt", Date.now());
              setShow(false);
            }}
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label={t("dismiss")}
        title={t("dismiss")}
        onClick={() => {
          writeLocal("nudgeDismissedAt", Date.now());
          setShow(false);
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface"
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
