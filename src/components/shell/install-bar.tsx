"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Share, X } from "lucide-react";
import { useInstall } from "../providers";
import { readLocal, writeLocal } from "@/lib/client/storage";
import { LogoMark } from "../logo";

const DISMISS_DAYS = 14;

export function InstallBar() {
  const t = useTranslations("install");
  const { canPrompt, isIos, isStandalone, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const at = readLocal<number>("installDismissedAt", 0);
    setDismissed(Date.now() - at < DISMISS_DAYS * 86400_000);
  }, []);

  if (isStandalone || dismissed || (!canPrompt && !isIos)) return null;

  const dismiss = () => {
    writeLocal("installDismissedAt", Date.now());
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label={isIos ? t("iosTitle") : t("title")}
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-40 animate-sheet-up rounded-2xl bg-surface p-4 shadow-pop lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96"
      data-testid="install-bar"
    >
      <div className="flex items-start gap-3">
        <LogoMark className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{isIos ? t("iosTitle") : t("title")}</p>
          <p className="mt-0.5 text-sm text-muted">
            {isIos ? (
              <>
                <Share className="mr-1 inline size-4 align-[-3px]" aria-hidden />
                {t("iosText")}
              </>
            ) : (
              t("text")
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          title={t("dismiss")}
          className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {!isIos ? (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={dismiss} className="h-10 rounded-full px-4 text-sm font-semibold hover:bg-surface-2">
            {t("dismiss")}
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await promptInstall();
              if (!ok) dismiss();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary"
          >
            <Download className="size-4" aria-hidden />
            {t("button")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
