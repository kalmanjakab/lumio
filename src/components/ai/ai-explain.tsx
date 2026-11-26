"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb, Sparkles } from "lucide-react";
import { useSettings } from "../providers";
import { cn } from "../ui";
import { aiErrorKey, aiRequest, useAiRemaining } from "./ai-client";

type Explanation = { verdict: "correct" | "partly" | "wrong" | "none"; explanation: string; example: string };
type Mnemonic = { mnemonic: string; tip: string };

export function useAiOn() {
  const { viewer } = useSettings();
  return viewer.kind === "user" && viewer.ai;
}

export function AiRemaining({ className }: { className?: string }) {
  const t = useTranslations("ai");
  const n = useAiRemaining();
  if (n === null) return null;
  return <p className={cn("text-xs text-muted", className)}>{t("remaining", { count: n })}</p>;
}

/** Hibás válasz után: „Magyarázd el” és „Memóriatrükk” gombok, AI válasszal. Csak akinek az admin bekapcsolta. */
export function AiExplain({ cardId, answer, className }: { cardId: string; answer?: string | null; className?: string }) {
  const t = useTranslations("ai");
  const on = useAiOn();
  const [busy, setBusy] = useState<"explain" | "mnemonic" | null>(null);
  const [exp, setExp] = useState<Explanation | null>(null);
  const [mn, setMn] = useState<Mnemonic | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setExp(null);
    setMn(null);
    setErr("");
    setBusy(null);
  }, [cardId]);

  if (!on) return null;

  const run = async (kind: "explain" | "mnemonic") => {
    setBusy(kind);
    setErr("");
    try {
      if (kind === "explain") setExp(await aiRequest<Explanation>("/api/ai/explain", { cardId, answer: answer ?? null }));
      else setMn(await aiRequest<Mnemonic>("/api/ai/mnemonic", { cardId }));
    } catch (e) {
      setErr(t(aiErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center gap-1.5 text-sm font-semibold text-primary disabled:opacity-60";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!exp || !mn ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {!exp ? (
            <button type="button" disabled={busy !== null} onClick={() => run("explain")} className={btn}>
              <Sparkles className={cn("size-4", busy === "explain" && "animate-pulse")} aria-hidden />
              {busy === "explain" ? t("loading") : t("explain")}
            </button>
          ) : null}
          {!mn ? (
            <button type="button" disabled={busy !== null} onClick={() => run("mnemonic")} className={btn}>
              <Lightbulb className={cn("size-4", busy === "mnemonic" && "animate-pulse")} aria-hidden />
              {busy === "mnemonic" ? t("loading") : t("mnemonic")}
            </button>
          ) : null}
        </div>
      ) : null}
      {err ? <p className="text-sm text-muted">{err}</p> : null}
      {exp ? (
        <div className="rounded-xl bg-surface/70 p-3 text-sm" aria-live="polite">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Sparkles className="size-4" aria-hidden /> {t("title")}
            {exp.verdict !== "none" ? <span className="text-fg">· {t(`verdict_${exp.verdict}`)}</span> : null}
          </p>
          <p>{exp.explanation}</p>
          {exp.example ? <p className="mt-1 italic text-muted">{exp.example}</p> : null}
        </div>
      ) : null}
      {mn ? <MnemonicBox data={mn} /> : null}
      {exp || mn ? (
        <div>
          <p className="text-xs text-muted">{t("disclaimer")}</p>
          <AiRemaining />
        </div>
      ) : null}
    </div>
  );
}

export function MnemonicBox({ data }: { data: Mnemonic }) {
  const t = useTranslations("ai");
  return (
    <div className="rounded-xl bg-surface/70 p-3 text-sm" aria-live="polite">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
        <Lightbulb className="size-4" aria-hidden /> {t("mnemonicTitle")}
      </p>
      <p>{data.mnemonic}</p>
      {data.tip ? <p className="mt-1 text-muted">{data.tip}</p> : null}
    </div>
  );
}
