"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { Sheet } from "../sheet";
import { Spinner } from "../ui";
import { aiErrorKey, aiRequest } from "./ai-client";
import { AiRemaining, MnemonicBox, useAiOn } from "./ai-explain";

/** Kis gomb a kártyalistában: AI memóriatrükk egy kártyához, felugró lapon. */
export function AiCardButton({ cardId, term }: { cardId: string; term: string }) {
  const t = useTranslations("ai");
  const on = useAiOn();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<{ mnemonic: string; tip: string } | null>(null);
  const [err, setErr] = useState("");
  if (!on) return null;

  const load = async () => {
    setState("loading");
    try {
      setData(await aiRequest<{ mnemonic: string; tip: string }>("/api/ai/mnemonic", { cardId }));
      setState("done");
    } catch (e) {
      setErr(t(aiErrorKey(e)));
      setState("error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (state === "idle" || state === "error") void load();
        }}
        aria-label={`${t("mnemonic")}: ${term}`}
        title={t("mnemonic")}
        className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-primary"
      >
        <Lightbulb className="size-5" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={term}>
        {state === "loading" ? (
          <div className="flex items-center gap-2 py-4 text-muted">
            <Spinner className="size-5" /> {t("loading")}
          </div>
        ) : state === "error" ? (
          <p className="py-2 text-muted">{err}</p>
        ) : data ? (
          <div className="flex flex-col gap-2">
            <MnemonicBox data={data} />
            <p className="text-xs text-muted">{t("disclaimer")}</p>
            <AiRemaining />
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
