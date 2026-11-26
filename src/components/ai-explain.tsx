"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useSettings } from "./providers";
import { cn } from "./ui";

type Explanation = { verdict: "correct" | "partly" | "wrong" | "none"; explanation: string; example: string };

let enabledPromise: Promise<boolean> | null = null;
function aiAvailable() {
  enabledPromise ??= api<{ enabled: boolean }>("/api/ai/explain")
    .then((r) => r.enabled)
    .catch(() => false);
  return enabledPromise;
}

/** „Magyarázd el” gomb: AI magyarázat a kártyához. Csak bejelentkezve és ha a szerveren be van kapcsolva. */
export function AiExplain({ cardId, answer, className }: { cardId: string; answer?: string | null; className?: string }) {
  const t = useTranslations("ai");
  const { viewer } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [res, setRes] = useState<Explanation | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (viewer.kind !== "user") return;
    let alive = true;
    void aiAvailable().then((v) => alive && setEnabled(v));
    return () => {
      alive = false;
    };
  }, [viewer.kind]);
  useEffect(() => {
    setState("idle");
    setRes(null);
  }, [cardId]);

  if (!enabled) return null;
  if (state === "idle" || state === "loading") {
    return (
      <button
        type="button"
        disabled={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            setRes(await api<Explanation>("/api/ai/explain", { method: "POST", body: { cardId, answer: answer ?? null } }));
            setState("done");
          } catch (e) {
            setErr(e instanceof ApiClientError && e.status === 429 ? t("limit") : t("failed"));
            setState("error");
          }
        }}
        className={cn("inline-flex items-center gap-1.5 text-sm font-semibold text-primary disabled:opacity-60", className)}
      >
        <Sparkles className={cn("size-4", state === "loading" && "animate-pulse")} aria-hidden />
        {state === "loading" ? t("loading") : t("explain")}
      </button>
    );
  }
  if (state === "error") return <p className={cn("text-sm text-muted", className)}>{err}</p>;
  return (
    <div className={cn("rounded-xl bg-surface/70 p-3 text-sm", className)} aria-live="polite">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
        <Sparkles className="size-4" aria-hidden /> {t("title")}
        {res && res.verdict !== "none" ? <span className="text-fg">· {t(`verdict_${res.verdict}`)}</span> : null}
      </p>
      <p>{res?.explanation}</p>
      {res?.example ? <p className="mt-1 italic text-muted">{res.example}</p> : null}
      <p className="mt-2 text-xs text-muted">{t("disclaimer")}</p>
    </div>
  );
}
