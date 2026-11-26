"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Check, X, CircleCheck } from "lucide-react";
import type { CardDTO, MaterialDTO, StudyData } from "@/lib/study-types";
import { useStudyData } from "@/lib/client/study-store";
import { useModeCards } from "@/lib/client/use-mode-cards";
import { speak, stopSpeaking } from "@/lib/client/tts";
import { playSound } from "@/lib/client/sound";
import { gradeWritten, type GradingLevel } from "@/lib/grading";
import {
  applyAnswer,
  buildQuestion,
  currentCardId,
  levelOf,
  newLearnState,
  normalizeLearnSettings,
  questionTypeFor,
  reconcileLearnState,
  startRound,
  stats,
  typePath,
  type LearnQuestion,
  type LearnSettings,
  type LearnState,
} from "@/lib/learn-engine";
import { useSettings } from "../providers";
import { Sheet, SheetGroup, ConfirmDialog } from "../sheet";
import { Button, ProgressBar, Spinner, Switch, cn } from "../ui";
import { useToast } from "../toast";
import { GuestNudge } from "../home/guest-nudge";
import { AiExplain } from "../ai/ai-explain";
import { ModeEmpty, ModeHeader } from "./mode-header";
import { McOptions, PromptCard, WrittenInput, type OptionState, type WrittenInputHandle } from "./question-parts";

type Feedback = {
  correct: boolean;
  userAnswer: string | null;
  picked?: number;
  retypeDone?: boolean;
};

function formatDuration(ms: number, tc: (k: string, v?: Record<string, number>) => string) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? tc("minutesSeconds", { m: Math.floor(s / 60), s: s % 60 }) : tc("seconds", { s });
}

export function LearnMode({ material, cards: allCards, serverData, subset }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null; subset: string[] | null }) {
  const t = useTranslations("learn");
  const ts = useTranslations("set");
  const tc = useTranslations("common");
  const toast = useToast();
  const { viewer, settings: user } = useSettings();
  const { data, store, ready } = useStudyData(viewer.kind, material.id, serverData);
  const tsh = useTranslations("sheet");
  const [localSubset, setLocalSubset] = useState<string[] | null>(subset);
  const { cards: baseCards, emptyBecauseStarred: starredEmpty } = useModeCards(allCards, data);
  const ephemeral = Boolean(localSubset && localSubset.length);
  const cards = useMemo(() => {
    if (!localSubset || localSubset.length === 0) return baseCards;
    const set = new Set(localSubset);
    return allCards.filter((c) => set.has(c.id));
  }, [localSubset, baseCards, allCards]);
  const emptyBecauseStarred = !ephemeral && starredEmpty;
  const backHref = `/sets/${material.id}`;

  const [settings, setSettings] = useState<LearnSettings | null>(null);
  const [state, setState] = useState<LearnState | null>(null);
  const [question, setQuestion] = useState<LearnQuestion | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [retypeText, setRetypeText] = useState("");
  const [retypeError, setRetypeError] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sheet, setSheet] = useState<null | "main" | "grading" | "write">(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const inputRef = useRef<WrittenInputHandle>(null);
  const retypeRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedOnce = useRef(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  // Betöltés.
  useEffect(() => {
    if (!ready || !data || settings) return;
    const s = normalizeLearnSettings(data.modeSettings.learn, { tts: user.defaultTts });
    setSettings(s);
    const ids = cards.map((c) => c.id);
    const levels = Object.fromEntries(Object.entries(data.progress).map(([k, v]) => [k, v.level]));
    const restored = ephemeral ? null : reconcileLearnState(data.studyState.learn, ids, s);
    setState(restored ?? newLearnState(ids, s, { levels: ephemeral ? {} : levels }));
  }, [ready, data, settings, cards, ephemeral, user.defaultTts]);

  const pendingSave = useRef<{ value: LearnState | null } | null>(null);
  const persist = useCallback(
    (next: LearnState | null) => {
      if (ephemeral) return;
      pendingSave.current = { value: next };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (pendingSave.current) store.saveStudyState("learn", pendingSave.current.value);
        pendingSave.current = null;
      }, 400);
    },
    [store, ephemeral],
  );

  // Kilépéskor a még el nem küldött állapotot azonnal mentjük.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSave.current) store.saveStudyState("learn", pendingSave.current.value);
      pendingSave.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [store]);

  const cardId = state ? currentCardId(state) : undefined;
  const typesKey = settings ? `${typePath(settings).join(",")}|${settings.answerWithTerm}|${settings.answerWithDefinition}` : "";
  const qKey = state ? `${state.round}:${state.answered}:${cardId ?? ""}` : "";

  // Új kérdés összeállítása, amikor új kártya kerül sorra.
  useEffect(() => {
    if (!state || !settings || !cardId) {
      setQuestion(null);
      return;
    }
    const type = questionTypeFor(state, cardId, settings);
    setQuestion(buildQuestion(cards, cardId, type, settings));
    setAnswerText("");
    setRetypeText("");
    setRetypeError(false);
    setFlipped(false);
    setFeedback(null);
  }, [qKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ha menet közben változnak a kérdéstípusok vagy a válaszirány, a még megválaszolatlan kérdés újraépül.
  useEffect(() => {
    if (!state || !settings || !cardId || feedback) return;
    setQuestion(buildQuestion(cards, cardId, questionTypeFor(state, cardId, settings), settings));
    setAnswerText("");
    setFlipped(false);
  }, [typesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const promptLang = question ? (question.answerSide === "term" ? material.definitionLang : material.termLang) : material.termLang;
  const answerLang = question ? (question.answerSide === "term" ? material.termLang : material.definitionLang) : material.definitionLang;

  const sayPrompt = useCallback(() => {
    if (question) speak(question.prompt, promptLang, { rate: user.ttsRate, volume: user.volume });
  }, [question, promptLang, user.ttsRate, user.volume]);

  useEffect(() => {
    if (settings?.tts && question && !feedback) sayPrompt();
    if (question?.type === "written" && !feedback) setTimeout(() => inputRef.current?.focus(), 50);
  }, [question]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    if (state?.phase === "finished" && !finishedOnce.current) {
      finishedOnce.current = true;
      setFinishedAt(Date.now());
      if (user.soundEffects) playSound("finish", user.volume);
    }
  }, [state?.phase, user.soundEffects, user.volume]);

  const commit = useCallback(
    (correct: boolean) => {
      if (!state || !settings || !question) return;
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      const next = applyAnswer(state, question.cardId, correct, settings);
      const pathLen = typePath(settings).length;
      const cs = next.cards[question.cardId];
      store.saveProgress([{ cardId: question.cardId, level: levelOf(cs, pathLen), streak: cs?.step ?? 0, wrongDelta: correct ? 0 : 1 }]);
      store.recordActivity(1);
      setState(next);
      persist(next);
    },
    [state, settings, question, store, persist],
  );

  const showFeedback = useCallback(
    (fb: Feedback) => {
      setFeedback(fb);
      if (user.soundEffects) playSound(fb.correct ? "correct" : "wrong", user.volume);
      if (fb.correct && question?.type !== "flashcard") {
        advanceTimer.current = setTimeout(() => commit(true), 1100);
      }
    },
    [user.soundEffects, user.volume, question?.type, commit],
  );

  const submitWritten = () => {
    if (!question || feedback || !settings) return;
    if (!answerText.trim()) return;
    const r = gradeWritten(answerText, question.answer, settings.grading as GradingLevel);
    showFeedback({ correct: r.correct, userAnswer: answerText });
    if (!r.correct && settings.retype) setTimeout(() => retypeRef.current?.focus(), 50);
  };

  const dontKnow = () => {
    if (!question || feedback) return;
    showFeedback({ correct: false, userAnswer: null });
    if (question.type === "written" && settings?.retype) setTimeout(() => retypeRef.current?.focus(), 50);
  };

  const needsRetype = Boolean(feedback && !feedback.correct && settings?.retype && question?.type === "written" && !feedback.retypeDone);

  const continueAfterFeedback = () => {
    if (!feedback) return;
    if (needsRetype) {
      if (question && gradeWritten(retypeText, question.answer, "medium").correct) {
        setFeedback({ ...feedback, retypeDone: true });
        commit(false);
      } else setRetypeError(true);
      return;
    }
    commit(feedback.correct);
  };

  const pickOption = (i: number) => {
    if (!question?.options || feedback) return;
    const correct = question.options[i] === question.answer;
    showFeedback({ correct, userAnswer: question.options[i]!, picked: i });
  };

  // Billentyűk: 1–4 a feleletválasztóshoz, Enter a folytatáshoz.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || confirmRestart || !question) return;
      const tag = (e.target as HTMLElement).tagName;
      if (feedback && e.key === "Enter" && tag !== "INPUT" && tag !== "BUTTON") {
        e.preventDefault();
        continueAfterFeedback();
        return;
      }
      if (!feedback && question.type === "mc" && question.options && /^[1-9]$/.test(e.key) && tag !== "INPUT") {
        const i = Number(e.key) - 1;
        if (i < question.options.length) pickOption(i);
      }
      if (!feedback && question.type === "flashcard" && (e.key === " " || e.key === "Enter") && tag !== "BUTTON") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const changeSettings = (patch: Partial<LearnSettings>) => {
    if (!settings) return;
    const next = normalizeLearnSettings({ ...settings, ...patch });
    const wouldBreak =
      (patch.answerWithTerm === false && !settings.answerWithDefinition) ||
      (patch.answerWithDefinition === false && !settings.answerWithTerm) ||
      (patch.typeFlashcards === false && !settings.typeMc && !settings.typeWritten) ||
      (patch.typeMc === false && !settings.typeFlashcards && !settings.typeWritten) ||
      (patch.typeWritten === false && !settings.typeFlashcards && !settings.typeMc);
    if (wouldBreak) {
      toast(t("atLeastOne"), "error");
      return;
    }
    setSettings(next);
    store.saveModeSettings("learn", next);
    if (patch.shuffle !== undefined && state) {
      const ids = cards.map((c) => c.id);
      const levels = Object.fromEntries(Object.entries(state.cards).map(([k, v]) => [k, levelOf(v, typePath(next).length)]));
      const fresh = newLearnState(ids, next, { levels });
      setState(fresh);
      persist(fresh);
    }
  };

  const restart = () => {
    if (!settings) return;
    setConfirmRestart(false);
    setSheet(null);
    finishedOnce.current = false;
    setLocalSubset(null);
    store.resetProgress();
    const fresh = newLearnState(
      baseCards.map((c) => c.id),
      settings,
    );
    setState(fresh);
    store.saveStudyState("learn", fresh);
  };

  const st = useMemo(() => (state && settings ? stats(state, settings) : null), [state, settings]);

  if (emptyBecauseStarred) return <ModeEmpty backHref={backHref} title={t("title")} text={ts("starredOnlyEmpty")} actionLabel={t("backToSet")} />;
  if (allCards.length === 0 || (ready && cards.length === 0)) return <ModeEmpty backHref={backHref} title={t("title")} text={t("noCards")} actionLabel={t("backToSet")} />;
  if (!state || !settings || !st) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const gradingLabel = settings.grading === "lenient" ? t("gradingLenient") : settings.grading === "medium" ? t("gradingMedium") : t("gradingStrict");

  const sheets = (
    <>
      <Sheet open={sheet === "main"} onClose={() => setSheet(null)} title={t("settingsTitle")}>
        <SheetGroup title={tsh("general")}>
          <Switch label={t("shuffle")} checked={settings.shuffle} onChange={(v) => changeSettings({ shuffle: v })} />
          <Switch label={t("tts")} checked={settings.tts} onChange={(v) => changeSettings({ tts: v })} />
        </SheetGroup>
        <SheetGroup title={t("answerWith")}>
          <Switch label={t("answerWithTerm")} checked={settings.answerWithTerm} onChange={(v) => changeSettings({ answerWithTerm: v })} />
          <Switch label={t("answerWithDefinition")} checked={settings.answerWithDefinition} onChange={(v) => changeSettings({ answerWithDefinition: v })} />
        </SheetGroup>
        <SheetGroup title={t("questionTypes")}>
          <Switch label={t("typeFlashcards")} checked={settings.typeFlashcards} onChange={(v) => changeSettings({ typeFlashcards: v })} />
          <Switch label={t("typeMc")} checked={settings.typeMc} onChange={(v) => changeSettings({ typeMc: v })} />
          <Switch label={t("typeWritten")} checked={settings.typeWritten} onChange={(v) => changeSettings({ typeWritten: v })} />
        </SheetGroup>
        <SheetGroup>
          <button type="button" onClick={() => setSheet("grading")} className="flex w-full items-center justify-between gap-3 py-3.5 text-left">
            <span className="font-medium">{t("grading")}</span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              {gradingLabel} <ChevronRight className="size-4" aria-hidden />
            </span>
          </button>
          <Switch label={t("retype")} description={t("retypeDesc")} checked={settings.retype} onChange={(v) => changeSettings({ retype: v })} />
          <button type="button" onClick={() => setSheet("write")} className="flex w-full items-center justify-between gap-3 py-3.5 text-left">
            <span className="font-medium">{t("writeMode")}</span>
            <ChevronRight className="size-4 text-primary" aria-hidden />
          </button>
        </SheetGroup>
        <SheetGroup>
          <button type="button" onClick={() => setConfirmRestart(true)} className="w-full py-3.5 text-left font-semibold text-danger">
            {t("restart")}
          </button>
        </SheetGroup>
      </Sheet>

      <Sheet open={sheet === "grading"} onClose={() => setSheet("main")} title={t("grading")}>
        <div role="radiogroup" aria-label={t("grading")} className="flex flex-col gap-2">
          {(["lenient", "medium", "strict"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={settings.grading === g}
              onClick={() => {
                changeSettings({ grading: g });
                setSheet("main");
              }}
              className={cn("rounded-2xl border-2 p-4 text-left", settings.grading === g ? "border-primary bg-primary-soft" : "border-border bg-surface")}
            >
              <span className="block font-bold">{g === "lenient" ? t("gradingLenient") : g === "medium" ? t("gradingMedium") : t("gradingStrict")}</span>
              <span className="mt-1 block text-sm text-muted">{g === "lenient" ? t("gradingLenientDesc") : g === "medium" ? t("gradingMediumDesc") : t("gradingStrictDesc")}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "write"} onClose={() => setSheet("main")} title={t("writeModeTitle")}>
        <SheetGroup>
          <Switch label={t("accentBar")} checked={settings.writeMode.accentBar} onChange={(v) => changeSettings({ writeMode: { ...settings.writeMode, accentBar: v } })} />
          <Switch label={t("hintButton")} checked={settings.writeMode.hintButton} onChange={(v) => changeSettings({ writeMode: { ...settings.writeMode, hintButton: v } })} />
        </SheetGroup>
      </Sheet>

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
    </>
  );

  const header = (
    <ModeHeader
      backHref={backHref}
      center={
        <div className="mx-auto flex max-w-xs flex-col items-center gap-1.5">
          <span className="text-sm">{t("title")}</span>
          <ProgressBar value={st.mastered} max={st.total} label={t("progressLabel")} className="w-40" />
        </div>
      }
      onSettings={() => setSheet("main")}
    />
  );

  // ---------- Vége ----------
  if (state.phase === "finished") {
    const elapsed = (finishedAt ?? state.startedAt) - state.startedAt;
    return (
      <div className="min-h-dvh">
        {header}
        <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-8 text-center">
          <CircleCheck className="size-20 text-known" aria-hidden />
          <div>
            <h1 className="text-2xl font-extrabold">{t("finishedTitle")}</h1>
            <p className="mt-1 text-muted">{t("finishedText", { count: st.total })}</p>
          </div>
          <dl className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t("statAnswers"), state.answered],
              [t("statCorrect"), state.correctCount],
              [t("statWrong"), state.wrongCount],
              [t("statTime"), formatDuration(elapsed, tc)],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl bg-surface p-3 shadow-card">
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="text-xl font-extrabold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex w-full flex-col gap-2">
            {state.missed.length ? (
              <Button
                size="lg"
                onClick={() => {
                  const missed = state.missed.slice();
                  setLocalSubset(missed);
                  finishedOnce.current = false;
                  setState(newLearnState(missed, settings));
                }}
              >
                {t("retryMistakes")} ({state.missed.length})
              </Button>
            ) : null}
            <Button size="lg" variant={state.missed.length ? "secondary" : "primary"} onClick={() => setConfirmRestart(true)}>
              {t("restartAll")}
            </Button>
            <Link href={backHref} className="flex h-12 items-center justify-center rounded-full font-semibold text-primary hover:bg-surface-2">
              {t("backToSet")}
            </Link>
          </div>
          <GuestNudge compact />
        </main>
        {sheets}
      </div>
    );
  }

  // ---------- Kör vége ----------
  if (state.phase === "roundSummary") {
    const pathLen = typePath(settings).length;
    return (
      <div className="min-h-dvh">
        {header}
        <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold">{t("roundDone", { round: state.round })}</h1>
            <p className="mt-1 text-muted">{t("roundSummary", { mastered: st.mastered, remaining: st.remaining })}</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            {[
              [t("levelNew"), st.new, "bg-surface-2 text-muted"],
              [t("levelLearning"), st.learning, "bg-learning-soft text-learning"],
              [t("levelKnown"), st.known, "bg-primary-soft text-primary"],
              [t("levelMastered"), st.mastered, "bg-known-soft text-known"],
            ].map(([k, v, cls]) => (
              <div key={String(k)} className={cn("rounded-2xl p-2", String(cls))}>
                <div className="text-xl font-extrabold">{v}</div>
                <div className="font-semibold">{k}</div>
              </div>
            ))}
          </div>
          <section>
            <h2 className="mb-2 font-bold">{t("termsInRound")}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
              {state.roundCards.map((id) => {
                const c = cards.find((x) => x.id === id);
                if (!c) return null;
                const lvl = levelOf(state.cards[id], pathLen);
                return (
                  <li key={id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn("size-2.5 shrink-0 rounded-full", lvl === 3 ? "bg-known" : lvl === 2 ? "bg-primary" : "bg-learning")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.term}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{c.definition}</span>
                    <span className="sr-only">{lvl === 3 ? t("levelMastered") : lvl === 2 ? t("levelKnown") : t("levelLearning")}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <Button
            size="lg"
            onClick={() => {
              const next = startRound(state, settings);
              setState(next);
              persist(next);
            }}
            autoFocus
          >
            {t("nextRound")}
          </Button>
        </main>
        {sheets}
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // ---------- Kérdés ----------
  const answeredLabel = question.answerSide === "term" ? t("typeTerm") : t("typeDefinition");
  const promptLabel = question.answerSide === "term" ? tc("definition") : tc("term");
  const optionStates: OptionState[] | undefined =
    question.options && feedback
      ? question.options.map((o, i) => (o === question.answer ? "correct" : i === feedback.picked ? "wrong" : "dim"))
      : undefined;

  return (
    <div className="min-h-dvh">
      {header}
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-4 pb-40">
        {ephemeral ? <p className="text-center text-sm font-semibold text-muted">{t("subsetNote", { count: cards.length })}</p> : null}

        {question.type === "flashcard" ? (
          <>
            <div className="flip-scene h-64">
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                aria-label={`${flipped ? question.answer : question.prompt}. ${t("flipCard")}`}
                className={cn("flip-inner block size-full", flipped && "is-flipped")}
              >
                {[question.prompt, question.answer].map((text, side) => (
                  <span key={side} className={cn("flip-face flex items-center justify-center rounded-3xl bg-surface p-6 shadow-card", side === 1 && "flip-back")} aria-hidden>
                    <span className="whitespace-pre-wrap break-words text-center text-2xl font-medium">{text}</span>
                  </span>
                ))}
              </button>
            </div>
            <p className="text-center text-sm text-muted">{t("flipCard")}</p>
            {flipped ? (
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" variant="outline" className="border-learning text-learning" onClick={() => commit(false)}>
                  <X className="size-5" aria-hidden /> {t("missedIt")}
                </Button>
                <Button size="lg" variant="outline" className="border-known text-known" onClick={() => commit(true)}>
                  <Check className="size-5" aria-hidden /> {t("gotIt")}
                </Button>
              </div>
            ) : (
              <Button size="lg" variant="soft" onClick={() => setFlipped(true)}>
                {t("showAnswer")}
              </Button>
            )}
          </>
        ) : (
          <>
            <PromptCard
              label={promptLabel}
              text={question.prompt}
              onSpeak={sayPrompt}
              lang={promptLang}
              imageId={question.answerSide === "term" ? allCards.find((c) => c.id === question.cardId)?.imageId : null}
            />
            {question.type === "mc" && question.options ? (
              <>
                <p className="font-semibold text-muted">{t("chooseAnswer")}</p>
                <McOptions options={question.options} states={optionStates} onPick={pickOption} disabled={Boolean(feedback)} label={t("chooseAnswer")} />
              </>
            ) : (
              <>
                <p className="font-semibold text-muted">{answeredLabel}</p>
                <WrittenInput
                  ref={inputRef}
                  value={answerText}
                  onChange={setAnswerText}
                  onSubmit={submitWritten}
                  lang={answerLang}
                  label={answeredLabel}
                  showAccents={settings.writeMode.accentBar}
                  hintAnswer={settings.writeMode.hintButton ? question.answer : null}
                  disabled={Boolean(feedback)}
                  status={feedback ? (feedback.correct ? "correct" : "wrong") : "idle"}
                />
                {!feedback ? (
                  <div className="flex justify-end">
                    <Button onClick={submitWritten} disabled={!answerText.trim()}>
                      {t("submit")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
            {!feedback ? (
              <button type="button" onClick={dontKnow} className="self-center rounded-full px-4 py-2 font-semibold text-primary hover:bg-surface-2">
                {t("dontKnow")}
              </button>
            ) : null}
          </>
        )}
      </main>

      {feedback && question.type !== "flashcard" ? (
        <div
          className={cn("fixed inset-x-0 bottom-0 z-30 animate-sheet-up border-t-4 bg-surface shadow-pop pb-safe", feedback.correct ? "border-known" : "border-danger")}
          role="status"
          aria-live="assertive"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
            <p className={cn("flex items-center gap-2 text-lg font-extrabold", feedback.correct ? "text-known" : "text-danger")}>
              {feedback.correct ? <Check className="size-6" aria-hidden /> : <X className="size-6" aria-hidden />}
              {feedback.correct ? t("correct") : t("incorrect")}
            </p>
            {!feedback.correct ? (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {feedback.userAnswer && question.type === "written" ? (
                  <div className="rounded-xl bg-danger-soft p-3">
                    <p className="font-semibold text-danger">{t("youAnswered")}</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-fg">{feedback.userAnswer}</p>
                  </div>
                ) : null}
                <div className="rounded-xl bg-known-soft p-3">
                  <p className="font-semibold text-known">{t("correctAnswer")}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-fg" lang={answerLang}>
                    {question.answer}
                  </p>
                </div>
              </div>
            ) : null}
            {needsRetype ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  continueAfterFeedback();
                }}
                className="flex flex-col gap-1.5"
              >
                <label htmlFor="retype" className="text-sm font-semibold">
                  {t("retypePrompt")}
                </label>
                <input
                  ref={retypeRef}
                  id="retype"
                  value={retypeText}
                  onChange={(e) => {
                    setRetypeText(e.target.value);
                    setRetypeError(false);
                  }}
                  lang={answerLang}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={cn("h-12 rounded-xl border-2 bg-bg px-4 focus:outline-none", retypeError ? "border-danger" : "border-border focus:border-primary")}
                />
                {retypeError ? <p className="text-sm font-medium text-danger">{t("retypeWrong")}</p> : null}
              </form>
            ) : null}
            {!feedback.correct ? <AiExplain cardId={question.cardId} answer={question.type === "written" ? feedback.userAnswer : null} /> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!feedback.correct && question.type === "written" && feedback.userAnswer ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (advanceTimer.current) clearTimeout(advanceTimer.current);
                    commit(true);
                  }}
                >
                  {t("overrideCorrect")}
                </Button>
              ) : null}
              <Button onClick={continueAfterFeedback} autoFocus={!needsRetype}>
                {tc("continue")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {sheets}
    </div>
  );
}
