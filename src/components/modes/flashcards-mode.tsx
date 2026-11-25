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
import { lockGesture, swipeDecision, swipeProgress, swipeThreshold } from "@/lib/swipe";
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
  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean; th?: number }>({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<null | { result: "known" | "learning"; x: number; y: number }>(null);
  const [shortcutHidden, setShortcutHidden] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // Az épp folyó húzás adatai. A „lock” dönti el, hogy húzás vagy görgetés ez.
  const gesture = useRef<{ id: number; x: number; y: number; lock: null | "swipe" | "scroll"; samples: { x: number; t: number }[]; captured: boolean; th: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const deciding = useRef(false);
  const suppressClickUntil = useRef(0);
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

  // Egyetlen válaszkezelő a gombokhoz, a billentyűkhöz és a húzáshoz.
  // A „deciding” zár miatt egy kártyára csak egy válasz kerülhet rögzítésre.
  const decide = useCallback(
    (result: "known" | "learning", from?: { x: number; y: number }) => {
      if (!state || state.done || deciding.current) return;
      deciding.current = true;
      // A kártya a húzás irányába repül ki (gombnál vízszintesen).
      const w = Math.max(window.innerWidth, 400) * 1.2;
      const sx = result === "known" ? 1 : -1;
      const vx = from ? from.x : sx;
      const vy = from ? from.y : 0;
      const len = Math.hypot(vx, vy) || 1;
      setLeaving({ result, x: (Math.abs(vx) / len) * w * sx, y: (vy / len) * w });
      setTimeout(() => {
        update((s) => answer(s, result));
        setLeaving(null);
        setDrag({ x: 0, y: 0, active: false });
        deciding.current = false;
      }, 220);
    },
    [state, update],
  );

  // Érintésnél a görgetést csak akkor tiltjuk le, ha a mozdulat már biztosan kártyahúzás.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current?.lock === "swipe" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  });

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
  const progress = drag.active ? swipeProgress(drag.x, drag.y, drag.th ?? 100) : 0;
  const tilt = Math.max(-15, Math.min(15, dx / 16));
  const intent = leaving ? leaving.result : progress > 0.25 ? (dx > 0 ? "known" : "learning") : null;
  const feedback = leaving ? 1 : progress;

  const resetDrag = () => setDrag({ x: 0, y: 0, active: false });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leaving || deciding.current || gesture.current) return;
    if (e.pointerType === "mouse" && (e.button !== 0 || !sortMode)) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lock: null, samples: [{ x: e.clientX, t: e.timeStamp }], captured: false, th: swipeThreshold(e.currentTarget.offsetWidth) };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const x = e.clientX - g.x;
    const y = e.clientY - g.y;
    if (!g.lock) {
      g.lock = lockGesture(x, y);
      if (g.lock === "scroll") {
        // Függőleges mozdulat: a böngésző görget, a kártya marad.
        gesture.current = null;
        return;
      }
      if (!g.lock) return;
    }
    if (!g.captured) {
      g.captured = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    g.samples.push({ x: e.clientX, t: e.timeStamp });
    if (g.samples.length > 6) g.samples.shift();
    setDrag({ x, y: y * 0.6, active: true, th: g.th });
  };
  const endGesture = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.lock !== "swipe") {
      resetDrag();
      return;
    }
    // A húzás után érkező „click” ne fordítsa meg a kártyát.
    suppressClickUntil.current = Date.now() + 400;
    const x = e.clientX - g.x;
    const y = e.clientY - g.y;
    const first = g.samples.find((p) => e.timeStamp - p.t <= 120) ?? g.samples[0]!;
    const dt = Math.max(1, e.timeStamp - first.t);
    const vx = (e.clientX - first.x) / dt;
    const dir = cancelled ? null : swipeDecision(x, y, vx, g.th);
    if (!dir) {
      resetDrag();
      return;
    }
    if (sortMode) decide(dir === "right" ? "known" : "learning", { x, y });
    else {
      update((s) => browse(s, dir === "left" ? 1 : -1));
      resetDrag();
    }
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
            ref={cardRef}
            data-testid="flashcard"
            className={cn("absolute inset-0 touch-manipulation", drag.active && "cursor-grabbing select-none")}
            style={{
              transform: leaving
                ? `translate(${leaving.x}px, ${leaving.y}px) rotate(${leaving.result === "known" ? 18 : -18}deg)`
                : `translate(${drag.x}px, ${drag.y}px) rotate(${tilt}deg)`,
              transition: leaving
                ? "transform 0.22s ease-in, opacity 0.22s ease-in"
                : drag.active
                  ? "none"
                  : "transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
              opacity: leaving ? 0 : 1,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endGesture(e, false)}
            onPointerCancel={(e) => endGesture(e, true)}
            onLostPointerCapture={(e) => {
              // Csak a saját elfogásunk elvesztése számít (a belső elemek implicit elfogása nem).
              if (e.target === e.currentTarget) endGesture(e, true);
            }}
          >
            <div className={cn("flip-inner size-full", flipped && "is-flipped")}>
              {(["front", "back"] as const).map((side) => (
                <div
                  key={side}
                  className={cn(
                    "flip-face flex flex-col rounded-3xl border-2 bg-surface shadow-pop",
                    side === "back" && "flip-back",
                    sortMode && intent === "known" ? "border-known" : sortMode && intent === "learning" ? "border-learning" : "border-transparent",
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
                      if (drag.active || leaving || Date.now() < suppressClickUntil.current) return;
                      setFlipped((f) => !f);
                    }}
                    tabIndex={(side === "back") !== flipped ? -1 : 0}
                    aria-label={`${side === "front" ? frontText : backText}. ${t("tapToFlip")}`}
                    className="flex flex-1 flex-col items-center justify-center overflow-auto px-6 pb-6 text-center"
                  >
                    <span className="whitespace-pre-wrap break-words text-2xl font-medium leading-snug sm:text-4xl">{side === "front" ? frontText : backText}</span>
                    {side === "front" && showHint ? <span className="mt-4 font-mono text-lg tracking-widest text-muted">{hintFor(backText)}</span> : null}
                  </button>
                  {sortMode && intent && side === (flipped ? "back" : "front") ? (
                    <>
                      <span
                        aria-hidden
                        className={cn("pointer-events-none absolute inset-0 rounded-3xl", intent === "known" ? "bg-known-soft" : "bg-learning-soft")}
                        style={{ opacity: Math.min(0.55, feedback * 0.55) }}
                      />
                      <span className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
                        <span
                          data-testid="swipe-feedback"
                          data-intent={intent}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border-2 bg-surface px-4 py-1.5 text-sm font-bold shadow-card",
                            intent === "known" ? "border-known text-known" : "border-learning text-learning",
                          )}
                          style={{ opacity: Math.min(1, 0.4 + feedback), transform: `scale(${0.85 + feedback * 0.2})` }}
                        >
                          {intent === "known" ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
                          {intent === "known" ? t("know") : t("stillLearning")}
                        </span>
                      </span>
                    </>
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
