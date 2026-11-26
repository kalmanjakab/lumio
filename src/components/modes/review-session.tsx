"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Flame, Volume2 } from "lucide-react";
import type { CardDTO } from "@/lib/study-types";
import { previewDue, rateCard, type SrsCard, type SrsRating } from "@/lib/srs";
import { saveReviewFor } from "@/lib/client/study-store";
import { recordActivity, useActivity } from "@/lib/client/activity";
import { speak, stopSpeaking } from "@/lib/client/tts";
import { playSound } from "@/lib/client/sound";
import { useAutoReloadBlocker } from "@/lib/client/app-update";
import { useSettings } from "../providers";
import { ProgressBar, cn } from "../ui";
import { CardImage } from "../card-image";
import { ModeHeader } from "./mode-header";

export type ReviewItem = { card: CardDTO; materialId: string; termLang: string; definitionLang: string; srs: SrsCard | null };

/** Ha az új esedékesség ennyin belül van, a kártya még ebben a körben visszajön. */
const REQUEUE_MS = 20 * 60 * 1000;

export type ReviewSink = (item: ReviewItem, next: SrsCard) => void;

/** Rövid, olvasható időtartam a gombokra: „10 p”, „3 nap”, „2 hó”. */
export function useIntervalLabel() {
  const t = useTranslations("review");
  return useCallback(
    (ms: number) => {
      const min = Math.max(1, Math.round(ms / 60000));
      if (min < 60) return t("unitMin", { n: min });
      const h = Math.round(min / 60);
      if (h < 24) return t("unitHour", { n: h });
      const d = Math.round(h / 24);
      if (d < 31) return t("unitDay", { n: d });
      const mo = Math.round(d / 30);
      if (mo < 12) return t("unitMonth", { n: mo });
      return t("unitYear", { n: Math.round((d / 365) * 10) / 10 });
    },
    [t],
  );
}

/**
 * Ismétlő kör: a kártya eleje, felfedés, majd négy gomb (Újra / Nehéz / Jó / Könnyű).
 * Az FSRS a válasz alapján kiszámolja a következő esedékességet.
 */
export function ReviewSession({
  items: initial,
  backHref,
  title,
  sink,
  doneExtra,
}: {
  items: ReviewItem[];
  backHref: string;
  title: string;
  sink?: ReviewSink;
  doneExtra?: React.ReactNode;
}) {
  const t = useTranslations("review");
  const tc = useTranslations("common");
  const { settings, viewer } = useSettings();
  const activity = useActivity();
  const label = useIntervalLabel();
  const [byId, setById] = useState(() => new Map(initial.map((i) => [i.card.id, i])));
  const [queue, setQueue] = useState<string[]>(() => initial.map((i) => i.card.id));
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const total = initial.length;
  const finished = queue.length === 0;
  useAutoReloadBlocker(!finished && done > 0);

  const current = queue.length ? byId.get(queue[0]!) ?? null : null;
  const frontIsTerm = settings.defaultFront === "term";
  const now = useMemo(() => new Date(), [current?.card.id, revealed]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (current ? previewDue(current.srs, now) : null), [current, now]);

  const say = useCallback(
    (side: "front" | "back") => {
      if (!current) return;
      const isTerm = side === "front" ? frontIsTerm : !frontIsTerm;
      speak(isTerm ? current.card.term : current.card.definition, isTerm ? current.termLang : current.definitionLang, { rate: settings.ttsRate, volume: settings.volume });
    },
    [current, frontIsTerm, settings.ttsRate, settings.volume],
  );

  useEffect(() => {
    if (settings.defaultTts && current && !revealed) say("front");
  }, [current?.card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []);

  const rate = useCallback(
    (r: SrsRating) => {
      if (!current || !revealed) return;
      const at = new Date();
      const next = rateCard(current.srs, r, at);
      const updated = { ...current, srs: next };
      setById((m) => new Map(m).set(current.card.id, updated));
      if (sink) sink(updated, next);
      else saveReviewFor(viewer.kind, current.materialId, current.card.id, next);
      recordActivity(1, 1);
      if (settings.soundEffects) playSound(r === 1 ? "wrong" : "correct", settings.volume);
      setQueue((q) => {
        const rest = q.slice(1);
        return next.due - at.getTime() < REQUEUE_MS ? [...rest, current.card.id] : rest;
      });
      if (r === 1) setAgain((a) => a + 1);
      else setDone((d) => d + 1);
      setRevealed(false);
    },
    [current, revealed, sink, viewer.kind, settings.soundEffects, settings.volume],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        if (settings.defaultTts) say("back");
        return;
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as SrsRating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, rate, say, settings.defaultTts]);

  if (finished) {
    const goalPct = Math.min(100, Math.round((activity.items / Math.max(1, activity.goal)) * 100));
    return (
      <div className="min-h-dvh">
        <ModeHeader backHref={backHref} center={title} />
        <main className="mx-auto flex max-w-md flex-col items-center gap-5 px-6 py-10 text-center">
          <h1 className="text-2xl font-extrabold">{total ? t("doneTitle") : t("nothingDue")}</h1>
          {total ? <p className="text-muted">{t("doneText", { count: done })}</p> : null}
          <div className="w-full rounded-2xl bg-surface p-5 text-left shadow-card">
            <div className="mb-2 flex items-center justify-between font-semibold">
              <span>{t("dailyGoal")}</span>
              <span className="tabular-nums">
                {Math.min(activity.items, activity.goal)} / {activity.goal}
              </span>
            </div>
            <ProgressBar value={goalPct} max={100} />
            {activity.streak.current > 0 ? (
              <p className="mt-3 inline-flex items-center gap-1.5 font-semibold text-accent">
                <Flame className="size-5" aria-hidden /> {t("streakDays", { count: activity.streak.current })}
              </p>
            ) : null}
          </div>
          {doneExtra}
          <Link href={backHref} className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-on-primary">
            {tc("back")}
          </Link>
        </main>
      </div>
    );
  }

  const c = current!;
  const front = frontIsTerm ? c.card.term : c.card.definition;
  const back = frontIsTerm ? c.card.definition : c.card.term;
  const buttons: { r: SrsRating; key: string; cls: string }[] = [
    { r: 1, key: "again", cls: "bg-danger-soft text-danger" },
    { r: 2, key: "hard", cls: "bg-learning-soft text-learning" },
    { r: 3, key: "good", cls: "bg-primary-soft text-primary" },
    { r: 4, key: "easy", cls: "bg-known-soft text-known" },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <ModeHeader backHref={backHref} center={`${Math.min(done + 1, total)} / ${total}`} />
      <div className="mx-auto w-full max-w-2xl px-4">
        <ProgressBar value={done} max={total} label={t("progress")} />
      </div>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4 pb-40">
        <div className="relative flex min-h-64 flex-col items-center justify-center gap-4 rounded-3xl bg-surface p-6 text-center shadow-pop sm:min-h-80">
          <button
            type="button"
            onClick={() => say("front")}
            aria-label={tc("speak")}
            title={tc("speak")}
            className="absolute left-3 top-3 flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Volume2 className="size-5" aria-hidden />
          </button>
          {!frontIsTerm ? <CardImage id={c.card.imageId} size="lg" /> : null}
          <p className="whitespace-pre-wrap break-words text-2xl font-medium leading-snug sm:text-4xl">{front}</p>
          {revealed ? (
            <>
              <hr className="w-full border-border" />
              {frontIsTerm ? <CardImage id={c.card.imageId} size="lg" /> : null}
              <p className="whitespace-pre-wrap break-words text-xl leading-snug text-fg sm:text-3xl" aria-live="polite">
                {back}
              </p>
              <button type="button" onClick={() => say("back")} className="text-sm font-semibold text-primary hover:underline">
                {tc("speak")}
              </button>
            </>
          ) : null}
        </div>
        {again ? <p className="text-center text-sm text-muted">{t("againCount", { count: again })}</p> : null}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-safe backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {!revealed ? (
            <button
              type="button"
              onClick={() => {
                setRevealed(true);
                if (settings.defaultTts) say("back");
              }}
              className="h-14 w-full rounded-2xl bg-primary text-lg font-bold text-on-primary"
            >
              {t("show")}
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {buttons.map((b) => (
                <button
                  key={b.r}
                  type="button"
                  onClick={() => rate(b.r)}
                  className={cn("flex h-16 flex-col items-center justify-center rounded-2xl font-bold transition-transform active:scale-95", b.cls)}
                >
                  <span>{t(b.key)}</span>
                  <span className="text-xs font-semibold opacity-80">{preview ? label(preview[b.r] - now.getTime()) : ""}</span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 hidden text-center text-xs text-muted sm:block">{revealed ? t("keysRate") : t("keysShow")}</p>
        </div>
      </div>
    </div>
  );
}
