"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, Keyboard, Lightbulb, Maximize, Minimize, Star, Undo2, Volume2, X } from "lucide-react";
import type { CardDTO, MaterialDTO, StudyData } from "@/lib/study-types";
import { useStudyData } from "@/lib/client/study-store";
import { useModeCards } from "@/lib/client/use-mode-cards";
import { speak, stopSpeaking } from "@/lib/client/tts";
import { playSound } from "@/lib/client/sound";
import { readLocal, writeLocal } from "@/lib/client/storage";
import {
  answer,
  browse,
  continueWithLearning,
  hintFor,
  newFlashcardsState,
  reconcileState,
  undo as undoState,
  type FlashcardsSettings,
  type FlashcardsState,
} from "@/lib/flashcards-engine";
import { useSettings } from "../providers";
import { Sheet, SheetGroup, ConfirmDialog } from "../sheet";
import { DualProgress, Segmented, Spinner, Switch, cn } from "../ui";
import { GuestNudge } from "../home/guest-nudge";
import { ModeEmpty, ModeHeader } from "./mode-header";

const SWIPE_THRESHOLD = 90;

export function FlashcardsMode({ material, cards: allCards, serverData }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null }) {
  const t = useTranslations("flashcards");
  const ts = useTranslations("set");
  const tc = useTranslations("common");
  const { viewer, settings: userSettings } = useSettings();
  const { data, store, ready } = useStudyData(viewer.kind, material.id, serverData);
  const { cards, emptyBecauseStarred } = useModeCards(allCards, data);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const backHref = `/sets/${material.id}`;

  const [settings, setSettings] = useState<FlashcardsSettings | null>(null);
  const [state, setState] = useState<FlashcardsState | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<null | "known" | "learning">(null);
  const [shortcutHidden, setShortcutHidden] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const dragStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedSound = useRef(false);

  // Első betöltés: beállítások és félbehagyott állapot.
  useEffect(() => {
    if (!ready || !data || settings) return;
    const saved = (data.modeSettings.flashcards ?? {}) as Partial<FlashcardsSettings>;
    const s: FlashcardsSettings = {
      method: saved.method === "browse" ? "browse" : "sort",
      tts: saved.tts ?? userSettings.defaultTts,
      shuffle: saved.shuffle ?? false,
      front: saved.front ?? userSettings.defaultFront,
    };
    setSettings(s);
    setStarred(new Set(data.starred));
    const ids = cards.map((c) => c.id);
    setState(reconcileState(data.studyState.flashcards, ids) ?? newFlashcardsState(ids, s.shuffle));
    setShortcutHidden(readLocal<boolean>("fcShortcutHidden", false));
  }, [ready, data, settings, cards, userSettings.defaultFront, userSettings.defaultTts]);

  const pendingSave = useRef<FlashcardsState | null>(null);
  const persist = useCallback(
    (next: FlashcardsState) => {
      pendingSave.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (pendingSave.current) store.saveStudyState("flashcards", { ...pendingSave.current, history: [] });
        pendingSave.current = null;
      }, 500);
    },
    [store],
  );

  // Kilépéskor (vagy az oldal elhagyásakor) a még el nem küldött állapotot azonnal mentjük.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSave.current) store.saveStudyState("flashcards", { ...pendingSave.current, history: [] });
      pendingSave.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [store]);

  const update = useCallback(
    (fn: (s: FlashcardsState) => FlashcardsState) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        if (next !== prev) persist(next);
        return next;
      });
      setFlipped(false);
      setShowHint(false);
    },
    [persist],
  );

  const changeSettings = (patch: Partial<FlashcardsSettings>) => {
    setSettings((s) => {
      const next = { ...s!, ...patch };
      store.saveModeSettings("flashcards", next);
      return next;
    });
  };

  const current = state && !state.done ? byId.get(state.queue[state.index] ?? "") : undefined;
  const frontIsTerm = (settings?.front ?? "term") === "term";
  const frontText = current ? (frontIsTerm ? current.term : current.definition) : "";
  const backText = current ? (frontIsTerm ? current.definition : current.term) : "";

  const sayCurrent = useCallback(
    (side: "front" | "back") => {
      if (!current) return;
      const isTerm = side === "front" ? frontIsTerm : !frontIsTerm;
      speak(isTerm ? current.term : current.definition, isTerm ? material.termLang : material.definitionLang, { rate: userSettings.ttsRate, volume: userSettings.volume });
    },
    [current, frontIsTerm, material.termLang, material.definitionLang, userSettings.ttsRate, userSettings.volume],
  );

  // Automatikus felolvasás, ha be van kapcsolva.
  useEffect(() => {
    if (settings?.tts && current) sayCurrent(flipped ? "back" : "front");
  }, [settings?.tts, current?.id, flipped]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    if (state?.done && !finishedSound.current) {
      finishedSound.current = true;
      if (userSettings.soundEffects) playSound("finish", userSettings.volume);
    }
    if (state && !state.done) finishedSound.current = false;
  }, [state, userSettings.soundEffects, userSettings.volume]);

  const decide = useCallback(
    (result: "known" | "learning") => {
      if (!state || state.done || leaving) return;
      setLeaving(result);
      setTimeout(() => {
        update((s) => answer(s, result));
        setLeaving(null);
        setDrag({ x: 0, y: 0, active: false });
      }, 180);
    },
    [state, leaving, update],
  );

  const toggleStar = () => {
    if (!current) return;
    setStarred((s) => {
      const n = new Set(s);
      const on = !n.has(current.id);
      if (on) n.add(current.id);
      else n.delete(current.id);
      store.setStar(current.id, on);
      return n;
    });
  };

  // Billentyűzet asztali gépen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheetOpen || methodOpen || confirmRestart) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (target.tagName === "BUTTON" && e.key === " " && !target.dataset.card) return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (settings?.method === "browse") update((s) => browse(s, 1));
        else decide("known");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (settings?.method === "browse") update((s) => browse(s, -1));
        else decide("learning");
      } else if (e.key.toLowerCase() === "z" && !e.metaKey && !e.ctrlKey) {
        update(undoState);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings?.method, decide, update, sheetOpen, methodOpen, confirmRestart]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (emptyBecauseStarred) {
    return <ModeEmpty backHref={backHref} title={t("title")} text={ts("starredOnlyEmpty")} actionLabel={t("backToSet")} />;
  }
  if (allCards.length === 0) {
    return <ModeEmpty backHref={backHref} title={t("title")} text={ts("empty")} actionLabel={t("backToSet")} />;
  }
  if (!state || !settings) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const total = state.queue.length;
  const sortMode = settings.method === "sort";
  const dx = drag.x;
  const tilt = Math.max(-12, Math.min(12, dx / 18));
  const intent = dx > 40 ? "known" : dx < -40 ? "learning" : null;
  const flyX = leaving === "known" ? 600 : leaving === "learning" ? -600 : dx;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!sortMode && e.pointerType === "mouse") return;
    dragStart.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragStart.current;
    if (!st) return;
    const x = e.clientX - st.x;
    const y = e.clientY - st.y;
    if (Math.abs(x) > 8) st.moved = true;
    if (st.moved) setDrag({ x, y: y * 0.2, active: true });
  };
  const onPointerUp = () => {
    const st = dragStart.current;
    dragStart.current = null;
    if (!st) return;
    if (!st.moved) {
      setDrag({ x: 0, y: 0, active: false });
      return;
    }
    if (sortMode && Math.abs(drag.x) > SWIPE_THRESHOLD) decide(drag.x > 0 ? "known" : "learning");
    else if (!sortMode && Math.abs(drag.x) > SWIPE_THRESHOLD) {
      update((s) => browse(s, drag.x < 0 ? 1 : -1));
      setDrag({ x: 0, y: 0, active: false });
    } else setDrag({ x: 0, y: 0, active: false });
  };

  const settingsSheet = (
    <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("settingsTitle")}>
      <SheetGroup>
        <button type="button" onClick={() => setMethodOpen(true)} className="flex w-full items-center justify-between gap-3 py-3.5 text-left">
          <span className="font-medium">{t("studyMethod")}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            {settings.method === "sort" ? t("methodSort") : t("methodBrowse")}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </button>
        <Switch label={t("tts")} checked={settings.tts} onChange={(v) => changeSettings({ tts: v })} />
        <Switch
          label={t("shuffle")}
          checked={settings.shuffle}
          onChange={(v) => {
            changeSettings({ shuffle: v });
            const ids = cards.map((c) => c.id);
            const fresh = newFlashcardsState(ids, v);
            setState(fresh);
            persist(fresh);
            setFlipped(false);
          }}
        />
        <div className="py-3">
          <p className="mb-2 font-medium">{t("front")}</p>
          <Segmented
            label={t("frontLabel")}
            value={settings.front}
            onChange={(v) => {
              changeSettings({ front: v });
              setFlipped(false);
            }}
            options={[
              { value: "term", label: `${t("frontLabel")}: ${tc("term")}` },
              { value: "definition", label: `${t("frontLabel")}: ${tc("definition")}` },
            ]}
          />
        </div>
      </SheetGroup>
      <SheetGroup>
        <button type="button" onClick={() => setConfirmRestart(true)} className="w-full py-3.5 text-left font-semibold text-danger">
          {t("restart")}
        </button>
      </SheetGroup>
    </Sheet>
  );

  const methodSheet = (
    <Sheet open={methodOpen} onClose={() => setMethodOpen(false)} title={t("studyMethod")}>
      <div role="radiogroup" aria-label={t("studyMethod")} className="flex flex-col gap-2">
        {(["sort", "browse"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={settings.method === m}
            onClick={() => {
              changeSettings({ method: m });
              setMethodOpen(false);
            }}
            className={cn("rounded-2xl border-2 p-4 text-left", settings.method === m ? "border-primary bg-primary-soft" : "border-border bg-surface")}
          >
            <span className="block font-bold">{m === "sort" ? t("methodSort") : t("methodBrowse")}</span>
            <span className="mt-0.5 block text-sm text-muted">{m === "sort" ? t("methodSortDesc") : t("methodBrowseDesc")}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );

  const restart = () => {
    setConfirmRestart(false);
    setSheetOpen(false);
    const fresh = newFlashcardsState(cards.map((c) => c.id), settings.shuffle);
    setState(fresh);
    persist(fresh);
    setFlipped(false);
  };

  const confirm = (
    <ConfirmDialog
      open={confirmRestart}
      title={t("restart")}
      text={t("restartConfirm")}
      confirmLabel={t("restartAll")}
      cancelLabel={tc("cancel")}
      onCancel={() => setConfirmRestart(false)}
      onConfirm={restart}
      danger
    />
  );

  // ---------- Összegző képernyő ----------
  if (state.done) {
    const knownN = state.known.length;
    const learningN = state.learning.length;
    const pct = total ? Math.round((knownN / (knownN + learningN || 1)) * 100) : 0;
    return (
      <div className="min-h-dvh">
        <ModeHeader backHref={backHref} center={t("title")} onSettings={() => setSheetOpen(true)} />
        <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-8 text-center">
          <div className="relative size-40">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--learning)" strokeWidth="14" opacity={learningN ? 1 : 0.15} />
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--known)" strokeWidth="14" strokeDasharray={`${(pct / 100) * 314} 314`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold">{pct}%</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">{learningN === 0 ? t("allKnown") : t("summaryTitle")}</h1>
            <p className="mt-1 text-muted">{t("summaryText")}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3">
            <div className="rounded-2xl bg-known-soft p-4">
              <p className="text-3xl font-extrabold text-known">{knownN}</p>
              <p className="font-semibold text-known">{t("summaryKnow")}</p>
            </div>
            <div className="rounded-2xl bg-learning-soft p-4">
              <p className="text-3xl font-extrabold text-learning">{learningN}</p>
              <p className="font-semibold text-learning">{t("summaryLearning")}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2">
            {learningN > 0 ? (
              <button
                type="button"
                onClick={() => update((s) => continueWithLearning(s, settings.shuffle))}
                className="h-12 rounded-full bg-primary font-semibold text-on-primary hover:bg-primary-hover"
              >
                {t("continueLearning")}
              </button>
            ) : null}
            <button type="button" onClick={restart} className={cn("h-12 rounded-full font-semibold", learningN > 0 ? "bg-surface shadow-card" : "bg-primary text-on-primary")}>
              {t("restartAll")}
            </button>
            <Link href={backHref} className="flex h-12 items-center justify-center rounded-full font-semibold text-primary hover:bg-surface-2">
              {t("backToSet")}
            </Link>
          </div>
          <GuestNudge compact />
        </main>
        {settingsSheet}
        {methodSheet}
        {confirm}
      </div>
    );
  }

  // ---------- Kártya nézet ----------
  const isStarred = current ? starred.has(current.id) : false;
  return (
    <div className="flex min-h-dvh flex-col">
      <ModeHeader
        backHref={backHref}
        center={<span className="tabular-nums">{tc("of", { current: Math.min(state.index + 1, total), total })}</span>}
        onSettings={() => setSheetOpen(true)}
      />
      <div className="mx-auto w-full max-w-3xl px-4">
        <DualProgress learning={sortMode ? state.learning.length : 0} known={sortMode ? state.known.length : state.index + 1} total={total} />
        {sortMode ? (
          <div className="mt-3 flex items-center justify-between">
            <span className="min-w-10 rounded-full border-2 border-learning bg-learning-soft px-3 py-0.5 text-center font-bold tabular-nums text-learning" aria-label={t("stillLearningCount", { count: state.learning.length })}>
              {state.learning.length}
            </span>
            {state.round > 1 ? <span className="text-sm font-semibold text-muted">{t("round", { round: state.round })}</span> : null}
            <span className="min-w-10 rounded-full border-2 border-known bg-known-soft px-3 py-0.5 text-center font-bold tabular-nums text-known" aria-label={t("knowCount", { count: state.known.length })}>
              {state.known.length}
            </span>
          </div>
        ) : null}
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="flip-scene relative flex-1" style={{ minHeight: "18rem" }}>
          <div
            className="absolute inset-0 touch-pan-y select-none"
            style={{
              transform: `translate(${flyX}px, ${drag.y}px) rotate(${leaving ? (leaving === "known" ? 14 : -14) : tilt}deg)`,
              transition: drag.active && !leaving ? "none" : "transform 0.2s ease-out",
              opacity: leaving ? 0 : 1,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className={cn("flip-inner size-full", flipped && "is-flipped")}>
              {(["front", "back"] as const).map((side) => (
                <div
                  key={side}
                  className={cn(
                    "flip-face flex flex-col rounded-3xl border-2 bg-surface shadow-pop",
                    side === "back" && "flip-back",
                    intent === "known" ? "border-known" : intent === "learning" ? "border-learning" : "border-transparent",
                  )}
                  aria-hidden={(side === "back") !== flipped}
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          sayCurrent(side);
                        }}
                        aria-label={tc("speak")}
                        title={tc("speak")}
                        tabIndex={(side === "back") !== flipped ? -1 : 0}
                        className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <Volume2 className="size-5" aria-hidden />
                      </button>
                      {side === "front" ? (
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowHint((h) => !h);
                          }}
                          tabIndex={flipped ? -1 : 0}
                          className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"
                        >
                          <Lightbulb className="size-4" aria-hidden /> {t("hint")}
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar();
                      }}
                      aria-pressed={isStarred}
                      aria-label={isStarred ? tc("unstar") : tc("star")}
                      title={isStarred ? tc("unstar") : tc("star")}
                      tabIndex={(side === "back") !== flipped ? -1 : 0}
                      className={cn("flex size-10 items-center justify-center rounded-full hover:bg-surface-2", isStarred ? "text-accent" : "text-muted hover:text-fg")}
                    >
                      <Star className="size-5" fill={isStarred ? "currentColor" : "none"} aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    data-card="1"
                    onClick={() => {
                      if (!drag.active) setFlipped((f) => !f);
                    }}
                    tabIndex={(side === "back") !== flipped ? -1 : 0}
                    aria-label={`${side === "front" ? frontText : backText}. ${t("tapToFlip")}`}
                    className="flex flex-1 flex-col items-center justify-center overflow-auto px-6 pb-6 text-center"
                  >
                    <span className="whitespace-pre-wrap break-words text-2xl font-medium leading-snug sm:text-4xl">{side === "front" ? frontText : backText}</span>
                    {side === "front" && showHint ? <span className="mt-4 font-mono text-lg tracking-widest text-muted">{hintFor(backText)}</span> : null}
                  </button>
                  {intent && side === (flipped ? "back" : "front") ? (
                    <span
                      className={cn(
                        "pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-bold",
                        intent === "known" ? "bg-known-soft text-known" : "bg-learning-soft text-learning",
                      )}
                    >
                      {intent === "known" ? t("know") : t("stillLearning")}
                    </span>
                  ) : null}
                  {!shortcutHidden && side === "front" ? (
                    <div className="hidden items-center justify-center gap-3 rounded-b-3xl bg-primary-soft px-4 py-2.5 text-sm lg:flex">
                      <Keyboard className="size-4 text-primary" aria-hidden />
                      <span className="font-semibold">{t("shortcutTitle")}</span>
                      <span className="text-muted">{t("shortcutText")}</span>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          writeLocal("fcShortcutHidden", true);
                          setShortcutHidden(true);
                        }}
                        className="ml-2 rounded-full px-2 py-0.5 font-semibold text-primary hover:bg-surface"
                      >
                        {t("shortcutDismiss")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-sm text-muted lg:hidden">{sortMode ? t("swipeHint") : t("tapToFlip")}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => update(undoState)}
            disabled={state.index === 0 || state.history.length === 0}
            aria-label={t("undo")}
            title={t("undo")}
            className="flex size-12 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30"
          >
            <Undo2 className="size-5" aria-hidden />
          </button>
          {sortMode ? (
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => decide("learning")}
                aria-label={t("stillLearning")}
                title={t("stillLearning")}
                className="flex size-16 items-center justify-center rounded-full border-2 border-learning bg-surface text-learning shadow-card transition-transform active:scale-95"
              >
                <X className="size-7" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => decide("known")}
                aria-label={t("know")}
                title={t("know")}
                className="flex size-16 items-center justify-center rounded-full border-2 border-known bg-surface text-known shadow-card transition-transform active:scale-95"
              >
                <Check className="size-7" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => update((s) => browse(s, -1))}
                disabled={state.index === 0}
                aria-label={t("previous")}
                title={t("previous")}
                className="flex size-14 items-center justify-center rounded-full bg-surface shadow-card disabled:opacity-40"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => (state.index >= total - 1 ? update((s) => ({ ...s, index: total, done: true, known: s.queue.slice() })) : update((s) => browse(s, 1)))}
                aria-label={t("nextCard")}
                title={t("nextCard")}
                className="flex size-14 items-center justify-center rounded-full bg-surface shadow-card"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen?.().catch(() => {});
            }}
            aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
            title={fullscreen ? t("exitFullscreen") : t("fullscreen")}
            className="flex size-12 items-center justify-center rounded-full hover:bg-surface-2"
          >
            {fullscreen ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
          </button>
        </div>
      </main>
      {settingsSheet}
      {methodSheet}
      {confirm}
    </div>
  );
}
