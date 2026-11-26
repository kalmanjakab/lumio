"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAutoReloadBlocker } from "@/lib/client/app-update";
import { Shapes, Trophy } from "lucide-react";
import type { CardDTO, MaterialDTO, StudyData } from "@/lib/study-types";
import { useStudyData } from "@/lib/client/study-store";
import { useModeCards } from "@/lib/client/use-mode-cards";
import { playSound } from "@/lib/client/sound";
import { readLocal, writeLocal } from "@/lib/client/storage";
import {
  PENALTY_MS,
  buildTiles,
  canStartWith,
  isPair,
  nextRoundCards,
  normalizeMatchSettings,
  type MatchSettings,
  type Rotation,
  type Tile,
} from "@/lib/match-engine";
import { useSettings } from "../providers";
import { Sheet, SheetGroup } from "../sheet";
import { Button, Spinner, Switch, cn } from "../ui";
import { useToast } from "../toast";
import { GuestNudge } from "../home/guest-nudge";
import { ModeEmpty, ModeHeader } from "./mode-header";

type Phase = "ready" | "playing" | "done";

function fmt(ms: number) {
  return (ms / 1000).toFixed(1);
}

export function MatchMode({ material, cards: allCards, serverData }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null }) {
  const t = useTranslations("match");
  // A folyamatban lévő kör nincs mentve, ezért itt az automatikus frissítés csak kilépéskor jöhet.
  useAutoReloadBlocker(true);
  const ts = useTranslations("set");
  const toast = useToast();
  const { viewer, settings: user } = useSettings();
  const { data, store, ready } = useStudyData(viewer.kind, material.id, serverData);
  const { cards, emptyBecauseStarred } = useModeCards(allCards, data);
  const backHref = `/sets/${material.id}`;

  const [settings, setSettings] = useState<MatchSettings | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(0);
  const [now, setNow] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [penaltyFlash, setPenaltyFlash] = useState(0);
  const [finalMs, setFinalMs] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [isRecord, setIsRecord] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null);
  const dragStart = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || !data || settings) return;
    setSettings(normalizeMatchSettings(data.modeSettings.match));
    setBest(data.matchBestMs);
  }, [ready, data, settings]);

  useEffect(() => {
    if (phase !== "playing") return;
    const tick = () => {
      setNow(performance.now());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [phase]);

  const elapsed = phase === "playing" ? Math.max(0, now - startAt) + penalty : finalMs;

  const start = () => {
    const rotKey = `matchRot:${material.id}`;
    const rot = readLocal<Rotation | null>(rotKey, null);
    const { ids, rotation } = nextRoundCards(
      cards.map((c) => c.id),
      rot,
    );
    writeLocal(rotKey, rotation);
    setTiles(buildTiles(cards, ids));
    setGone(new Set());
    setSelected(null);
    setWrong([]);
    setPenalty(0);
    setIsRecord(false);
    setHint(null);
    const s = performance.now();
    setStartAt(s);
    setNow(s);
    setPhase("playing");
  };

  const finish = useCallback(
    async (ms: number) => {
      setFinalMs(ms);
      setPhase("done");
      if (user.soundEffects) playSound("finish", user.volume);
      const prevBest = best;
      store.recordActivity(Math.floor(tiles.length / 2));
      const newBest = await store.saveMatchTime(Math.round(ms));
      setBest(newBest);
      setIsRecord(prevBest === null || Math.round(ms) < prevBest);
    },
    [best, store, tiles.length, user.soundEffects, user.volume],
  );

  const attempt = (aKey: string, bKey: string) => {
    const a = tiles.find((x) => x.key === aKey);
    const b = tiles.find((x) => x.key === bKey);
    if (!a || !b || a.key === b.key) return;
    if (isPair(a, b)) {
      if (user.soundEffects) playSound("match", user.volume);
      const nextGone = new Set(gone);
      nextGone.add(a.key);
      nextGone.add(b.key);
      setGone(nextGone);
      setSelected(null);
      if (nextGone.size === tiles.length) {
        const ms = performance.now() - startAt + penalty;
        void finish(ms);
      }
    } else {
      if (user.soundEffects) playSound("wrong", user.volume);
      setWrong([a.key, b.key]);
      setPenalty((p) => p + PENALTY_MS);
      setPenaltyFlash((n) => n + 1);
      setSelected(null);
      setTimeout(() => setWrong([]), 420);
    }
  };

  const tap = (key: string) => {
    if (phase !== "playing" || gone.has(key) || !settings) return;
    const tile = tiles.find((x) => x.key === key)!;
    if (!selected) {
      if (!canStartWith(tile, settings)) {
        setHint(t("pickFirst", { side: settings.term ? t("term") : t("definition") }));
        return;
      }
      setHint(null);
      setSelected(key);
      return;
    }
    if (selected === key) {
      setSelected(null);
      return;
    }
    attempt(selected, key);
  };

  // Húzás: egy csempét a párjára lehet húzni.
  const onPointerDown = (e: React.PointerEvent, key: string) => {
    if (phase !== "playing" || gone.has(key)) return;
    dragStart.current = { key, x: e.clientX, y: e.clientY, moved: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = dragStart.current;
      if (!st) return;
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) > 10) st.moved = true;
      if (st.moved) setDrag({ key: st.key, x: dx, y: dy });
    };
    const up = (e: PointerEvent) => {
      const st = dragStart.current;
      dragStart.current = null;
      if (!st) return;
      if (st.moved) {
        setDrag(null);
        const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.tile && (n as HTMLElement).dataset.tile !== st.key) as HTMLElement | undefined;
        const target = el?.dataset.tile;
        if (target && !gone.has(target)) {
          const a = tiles.find((x) => x.key === st.key)!;
          const b = tiles.find((x) => x.key === target)!;
          if (settings && !canStartWith(a, settings) && canStartWith(b, settings)) attempt(b.key, a.key);
          else attempt(a.key, b.key);
        }
      } else {
        tap(st.key);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  if (emptyBecauseStarred) return <ModeEmpty backHref={backHref} title={t("title")} text={ts("starredOnlyEmpty")} actionLabel={t("backToSet")} />;
  if (allCards.length < 2 || (ready && cards.length < 2)) return <ModeEmpty backHref={backHref} title={t("title")} text={t("needTwo")} actionLabel={t("backToSet")} />;
  if (!settings) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const explain = settings.term && settings.definition ? t("explainBoth") : settings.term ? t("explainTerm") : t("explainDefinition");
  const changeSettings = (patch: Partial<MatchSettings>) => {
    const next = { ...settings, ...patch };
    if (!next.term && !next.definition) {
      toast(t("atLeastOne"), "error");
      return;
    }
    setSettings(next);
    store.saveModeSettings("match", next);
  };

  const sheet = (
    <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("settingsTitle")}>
      <SheetGroup title={t("section")}>
        <Switch label={t("term")} checked={settings.term} onChange={(v) => changeSettings({ term: v })} />
        <Switch label={t("definition")} checked={settings.definition} onChange={(v) => changeSettings({ definition: v })} />
      </SheetGroup>
      <p className="mt-2 px-1 text-sm text-muted">{explain}</p>
      <SheetGroup>
        <button
          type="button"
          onClick={() => {
            setSheetOpen(false);
            setPhase("ready");
          }}
          className="w-full py-3.5 text-left font-semibold text-danger"
        >
          {t("restart")}
        </button>
      </SheetGroup>
    </Sheet>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <ModeHeader
        backHref={backHref}
        center={
          phase === "playing" ? (
            <span className="relative inline-flex items-center gap-2 tabular-nums" aria-label={t("time")}>
              {fmt(elapsed)}
              <span key={penaltyFlash} className={cn("text-sm font-bold text-danger", penaltyFlash ? "animate-pop-in" : "hidden")} aria-hidden>
                {penaltyFlash ? t("penalty") : ""}
              </span>
            </span>
          ) : (
            t("title")
          )
        }
        onSettings={() => setSheetOpen(true)}
      />

      {phase === "ready" ? (
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 pb-16 text-center">
          <span className="flex size-20 items-center justify-center rounded-3xl bg-primary-soft text-primary">
            <Shapes className="size-10" aria-hidden />
          </span>
          <h1 className="text-3xl font-extrabold">{t("readyTitle")}</h1>
          <p className="text-muted">{t("readyText")}</p>
          <p className="text-sm text-muted">{explain}</p>
          {best ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 font-semibold shadow-card">
              <Trophy className="size-4 text-accent" aria-hidden /> {t("bestTime")}: {fmt(best)} s
            </p>
          ) : null}
          <Button size="lg" block onClick={start} autoFocus>
            {t("start")}
          </Button>
        </main>
      ) : null}

      {phase === "playing" ? (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-3 pb-6 pt-2">
          <p className="mb-3 text-center text-sm text-muted" aria-live="polite">
            {hint ?? t("tileHint")}
          </p>
          <div className={cn("grid flex-1 gap-2.5 sm:gap-3", tiles.length > 8 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}>
            {tiles.map((tile) => {
              const isGone = gone.has(tile.key);
              const isSel = selected === tile.key;
              const isWrong = wrong.includes(tile.key);
              const dragging = drag?.key === tile.key;
              return (
                <button
                  key={tile.key}
                  type="button"
                  data-tile={tile.key}
                  disabled={isGone}
                  aria-hidden={isGone}
                  aria-pressed={isSel}
                  onPointerDown={(e) => onPointerDown(e, tile.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      tap(tile.key);
                    }
                  }}
                  onClick={(e) => e.preventDefault()}
                  style={dragging ? { transform: `translate(${drag.x}px, ${drag.y}px) scale(1.04)`, zIndex: 10 } : undefined}
                  className={cn(
                    "relative flex min-h-20 touch-none select-none items-center justify-center rounded-2xl border-2 bg-surface p-2.5 text-center text-sm font-medium shadow-card transition-colors sm:min-h-28 sm:text-base",
                    isGone && "animate-tile-out pointer-events-none",
                    isSel && "border-primary bg-primary-soft",
                    isWrong && "animate-shake border-danger bg-danger-soft",
                    !isSel && !isWrong && "border-transparent hover:border-border",
                    dragging && "shadow-pop",
                  )}
                >
                  <span className="line-clamp-5 whitespace-pre-wrap break-words" lang={tile.side === "term" ? material.termLang : material.definitionLang}>
                    {tile.text}
                  </span>
                </button>
              );
            })}
          </div>
        </main>
      ) : null}

      {phase === "done" ? (
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 pb-16 text-center">
          <h1 className="text-3xl font-extrabold">{t("finishedTitle")}</h1>
          <div className="w-full rounded-3xl bg-surface p-6 shadow-card">
            <p className="text-sm font-semibold text-muted">{t("yourTime")}</p>
            <p className="text-5xl font-extrabold tabular-nums">{fmt(finalMs)} s</p>
            {isRecord ? <p className="mt-2 font-bold text-known">{t("newRecord")}</p> : null}
            {best ? (
              <p className="mt-3 inline-flex items-center gap-2 text-muted">
                <Trophy className="size-4 text-accent" aria-hidden /> {t("bestTime")}: {fmt(best)} s
              </p>
            ) : null}
          </div>
          <Button size="lg" block onClick={start} autoFocus>
            {t("playAgain")}
          </Button>
          <Link href={backHref} className="font-semibold text-primary hover:underline">
            {t("backToSet")}
          </Link>
          <GuestNudge compact />
        </main>
      ) : null}
      {sheet}
    </div>
  );
}
