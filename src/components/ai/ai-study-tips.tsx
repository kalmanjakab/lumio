"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Sheet } from "../sheet";
import { Button, Spinner } from "../ui";
import { aiErrorKey, aiRequest } from "./ai-client";
import { AiRemaining, useAiOn } from "./ai-explain";

type Tips = { summary: string; tips: string[]; cards: { term: string; hint: string }[] };

/** „AI tanulási tippek” egy készlethez, a felhasználó legnehezebb kártyái alapján. */
export function AiStudyTips({ materialId }: { materialId: string }) {
  const t = useTranslations("ai");
  const on = useAiOn();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<Tips | null>(null);
  const [err, setErr] = useState("");
  if (!on) return null;

  const load = async () => {
    setState("loading");
    try {
      setData(await aiRequest<Tips>("/api/ai/tips", { materialId }));
      setState("done");
    } catch (e) {
      setErr(t(aiErrorKey(e)));
      setState("error");
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="soft"
        onClick={() => {
          setOpen(true);
          if (state === "idle" || state === "error") void load();
        }}
      >
        <Sparkles className="size-4" aria-hidden /> {t("tips")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("tipsTitle")}>
        {state === "loading" ? (
          <div className="flex items-center gap-2 py-4 text-muted">
            <Spinner className="size-5" /> {t("tipsLoading")}
          </div>
        ) : state === "error" ? (
          <p className="py-2 text-muted">{err}</p>
        ) : data ? (
          <div className="flex flex-col gap-4 text-sm" aria-live="polite">
            {data.summary ? <p className="text-base">{data.summary}</p> : null}
            <ul className="flex list-disc flex-col gap-2 pl-5">
              {data.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
            {data.cards.length ? (
              <section>
                <h3 className="mb-2 font-bold">{t("tipsHard")}</h3>
                <ul className="flex flex-col gap-2">
                  {data.cards.map((c, i) => (
                    <li key={i} className="rounded-xl bg-surface-2 p-3">
                      <p className="font-semibold">{c.term}</p>
                      <p className="text-muted">{c.hint}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <div>
              <p className="text-xs text-muted">{t("disclaimer")}</p>
              <AiRemaining />
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              {t("tipsAgain")}
            </Button>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
