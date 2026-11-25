"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-extrabold">{t("genericTitle")}</h1>
      <p className="text-muted">{t("genericText")}</p>
      <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">
        {tc("retry")}
      </button>
    </main>
  );
}
