"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Settings, X } from "lucide-react";

export function ModeHeader({ backHref, center, onSettings, right }: { backHref: string; center: ReactNode; onSettings?: () => void; right?: ReactNode }) {
  const tc = useTranslations("common");
  const tf = useTranslations("flashcards");
  return (
    <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur pt-safe">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-2 px-3">
        <Link href={backHref} aria-label={tf("exit")} title={tf("exit")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
          <X className="size-6" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 truncate text-center font-bold">{center}</div>
        <div className="flex items-center">
          {right}
          {onSettings ? (
            <button type="button" onClick={onSettings} aria-label={tc("settings")} title={tc("settings")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
              <Settings className="size-6" aria-hidden />
            </button>
          ) : (
            <span className="size-11" aria-hidden />
          )}
        </div>
      </div>
    </header>
  );
}

export function ModeEmpty({ backHref, title, text, actionLabel }: { backHref: string; title: string; text: string; actionLabel: string }) {
  return (
    <div className="min-h-dvh">
      <ModeHeader backHref={backHref} center={title} />
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-muted">{text}</p>
        <Link href={backHref} className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
