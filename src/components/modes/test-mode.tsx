"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAutoReloadBlocker } from "@/lib/client/app-update";
import { ChevronLeft, ChevronRight, FileCheck2, LayoutGrid, Minus, Plus, X, Check } from "lucide-react";
import type { CardDTO, MaterialDTO, StudyData, TestQuestionDetail } from "@/lib/study-types";
import type { GradeThresholds } from "@/lib/db/schema";
import { useStudyData } from "@/lib/client/study-store";
import { useModeCards } from "@/lib/client/use-mode-cards";
import { playSound } from "@/lib/client/sound";
import { speak } from "@/lib/client/tts";
import { generateTest, isCorrect, normalizeTestSettings, scoreTest, type TestQuestion, type TestSettings } from "@/lib/test-engine";
import type { GradingLevel } from "@/lib/grading";
import { useSettings } from "../providers";
import { Sheet, SheetGroup, ConfirmDialog } from "../sheet";
import { Button, ProgressBar, Spinner, Switch, cn } from "../ui";
import { useToast } from "../toast";
import { GuestNudge } from "../home/guest-nudge";
import { ModeEmpty } from "./mode-header";
import { McOptions, PromptCard, WrittenInput, type OptionState } from "./question-parts";
import { TestAnswerList, TestScoreHeader } from "./test-result-view";

type Phase = "setup" | "running" | "results";

export function TestMode({ material, cards: allCards, serverData, thresholds }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null; thresholds: GradeThresholds }) {
  const t = useTranslations("test");
  // A folyamatban lévő kör nincs mentve, ezért itt az automatikus frissítés csak kilépéskor jöhet.
  useAutoReloadBlocker(true);
  const ts = useTranslations("set");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const { viewer, settings: user } = useSettings();
  const { data, store, ready } = useStudyData(viewer.kind, material.id, serverData);
  const { cards, emptyBecauseStarred } = useModeCards(allCards, data);
  const backHref = `/sets/${material.id}`;

  const [settings, setSettings] = useState<TestSettings | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [locked, setLocked] = useState<Record<number, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [draft, setDraft] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<{ details: TestQuestionDetail[]; correct: number; total: number; percent: number; grade: number; durationMs: number } | null>(null);
  const [answerWithOpen, setAnswerWithOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const submitted = useRef(false);

  const grading: GradingLevel = ((data?.modeSettings.learn as { grading?: GradingLevel } | undefined)?.grading ?? "lenient") as GradingLevel;

  useEffect(() => {
    if (!ready || !data || settings) return;
    setSettings(normalizeTestSettings(data.modeSettings.test, cards.length));
  }, [ready, data, settings, cards.length]);

  const q = questions[current];
  useEffect(() => {
    setDraft(q?.type === "written" ? (answers[q.idx] ?? "") : "");
  }, [current, q?.idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const unanswered = useMemo(() => questions.filter((x) => !answers[x.idx]).length, [questions, answers]);

  if (emptyBecauseStarred) return <ModeEmpty backHref={backHref} title={t("title")} text={ts("starredOnlyEmpty")} actionLabel={t("backToSet")} />;
  if (allCards.length === 0) return <ModeEmpty backHref={backHref} title={t("title")} text={ts("empty")} actionLabel={t("backToSet")} />;
  if (!settings) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const update = (patch: Partial<TestSettings>) => {
    const next = { ...settings, ...patch };
    if (!next.tf && !next.mc && !next.written) {
      toast(t("atLeastOneType"), "error");
      return;
    }
    next.count = Math.max(1, Math.min(cards.length, next.count));
    setSettings(next);
    store.saveModeSettings("test", next);
  };

  const start = () => {
    const qs = generateTest(cards, settings);
    setQuestions(qs);
    setAnswers({});
    setLocked({});
    setCurrent(0);
    setResult(null);
    submitted.current = false;
    setStartedAt(Date.now());
    setPhase("running");
  };

  const setAnswer = (idx: number, value: string) => setAnswers((a) => ({ ...a, [idx]: value }));

  const answerAndMaybeLock = (value: string) => {
    if (!q || locked[q.idx]) return;
    setAnswer(q.idx, value);
    if (settings.instant) {
      setLocked((l) => ({ ...l, [q.idx]: true }));
      const ok = isCorrect(q, value, grading);
      if (user.soundEffects) playSound(ok ? "correct" : "wrong", user.volume);
    }
  };

  const finish = async () => {
    if (submitted.current) return;
    submitted.current = true;
    setConfirmSubmit(false);
    const final = { ...answers };
    if (q?.type === "written" && draft.trim() && !locked[q.idx]) final[q.idx] = draft;
    const s = scoreTest(questions, final, grading, thresholds);
    const durationMs = Date.now() - startedAt;
    const details: TestQuestionDetail[] = s.results.map(({ q: qq, answer, correct }) => ({
      cardId: qq.cardId,
      type: qq.type,
      prompt: qq.prompt,
      shown: qq.shown,
      options: qq.options,
      correctAnswer: qq.type === "tf" ? (qq.truth ? "true" : "false") : qq.answer,
      userAnswer: answer,
      correct,
    }));
    const r = { details, correct: s.correct, total: s.total, percent: s.percent, grade: s.grade, durationMs };
    setResult(r);
    setPhase("results");
    if (user.soundEffects) playSound("finish", user.volume);
    store.recordActivity(r.total);
    await store.saveTestResult({ correct: r.correct, total: r.total, percent: r.percent, grade: r.grade, durationMs, details: { questions: details } });
  };

  const trySubmit = () => {
    const pending = questions.filter((x) => !answers[x.idx] && !(x.idx === q?.idx && draft.trim())).length;
    if (pending > 0) setConfirmSubmit(true);
    else void finish();
  };

  const go = (i: number) => {
    if (q?.type === "written" && !locked[q.idx] && draft.trim()) setAnswer(q.idx, draft);
    setCurrent(Math.max(0, Math.min(questions.length - 1, i)));
  };

  // ---------- Beállítás ----------
  if (phase === "setup") {
    const answerWithLabel = settings.answerWith === "term" ? t("answerWithTerm") : settings.answerWith === "definition" ? t("answerWithDefinition") : t("answerWithBoth");
    return (
      <div className="min-h-dvh">
        <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur pt-safe">
          <div className="mx-auto flex h-16 max-w-xl items-center px-3">
            <Link href={backHref} aria-label={t("exit")} title={t("exit")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
              <X className="size-6" aria-hidden />
            </Link>
          </div>
        </header>
        <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 pb-32">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-muted">{material.title}</p>
              <h1 className="text-3xl font-extrabold">{t("setupTitle")}</h1>
            </div>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <FileCheck2 className="size-7" aria-hidden />
            </span>
          </div>

          <SheetGroup>
            <div className="flex items-center justify-between gap-4 py-3">
              <label htmlFor="q-count" className="font-medium">
                {t("questionCount")} <span className="block text-sm font-normal text-muted">{t("questionCountMax", { max: cards.length })}</span>
              </label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => update({ count: settings.count - 1 })} disabled={settings.count <= 1} aria-label="−" className="flex size-9 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40">
                  <Minus className="size-4" aria-hidden />
                </button>
                <input
                  id="q-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={cards.length}
                  value={settings.count}
                  onChange={(e) => update({ count: Number(e.target.value) || 1 })}
                  className="h-10 w-16 rounded-xl border-2 border-border bg-bg text-center font-bold tabular-nums focus:border-primary focus:outline-none"
                />
                <button type="button" onClick={() => update({ count: settings.count + 1 })} disabled={settings.count >= cards.length} aria-label="+" className="flex size-9 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40">
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            </div>
            <Switch label={t("instantFeedback")} checked={settings.instant} onChange={(v) => update({ instant: v })} />
            <button type="button" onClick={() => setAnswerWithOpen(true)} className="flex w-full items-center justify-between gap-3 py-3.5 text-left">
              <span className="font-medium">{t("answerWith")}</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                {answerWithLabel} <ChevronRight className="size-4" aria-hidden />
              </span>
            </button>
          </SheetGroup>
          <SheetGroup>
            <Switch label={t("trueFalse")} checked={settings.tf} onChange={(v) => update({ tf: v })} />
            <Switch label={t("multipleChoice")} checked={settings.mc} onChange={(v) => update({ mc: v })} />
            <Switch label={t("written")} checked={settings.written} onChange={(v) => update({ written: v })} />
          </SheetGroup>
        </main>
        <div className="fixed inset-x-0 bottom-0 z-20 bg-bg/95 backdrop-blur pb-safe">
          <div className="mx-auto max-w-xl px-5 py-4">
            <Button size="lg" block onClick={start}>
              {t("start")}
            </Button>
          </div>
        </div>
        <Sheet open={answerWithOpen} onClose={() => setAnswerWithOpen(false)} title={t("answerWith")}>
          <div role="radiogroup" aria-label={t("answerWith")} className="flex flex-col gap-2">
            {(["term", "definition", "both"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={settings.answerWith === v}
                onClick={() => {
                  update({ answerWith: v });
                  setAnswerWithOpen(false);
                }}
                className={cn("flex items-center justify-between rounded-2xl border-2 p-4 text-left font-bold", settings.answerWith === v ? "border-primary bg-primary-soft" : "border-border bg-surface")}
              >
                {v === "term" ? t("answerWithTerm") : v === "definition" ? t("answerWithDefinition") : t("answerWithBoth")}
                {settings.answerWith === v ? <Check className="size-5 text-primary" aria-hidden /> : null}
              </button>
            ))}
          </div>
        </Sheet>
      </div>
    );
  }

  // ---------- Eredmény ----------
  if (phase === "results" && result) {
    const wrongCards = [...new Set(result.details.filter((d) => !d.correct).map((d) => d.cardId))];
    return (
      <div className="min-h-dvh">
        <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur pt-safe">
          <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-3">
            <Link href={backHref} aria-label={t("backToSet")} title={t("backToSet")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
              <X className="size-6" aria-hidden />
            </Link>
            <span className="font-bold">{t("resultTitle")}</span>
          </div>
        </header>
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-16 pt-2">
          <TestScoreHeader percent={result.percent} grade={result.grade} correct={result.correct} total={result.total} durationMs={result.durationMs} />
          <div className="flex flex-col gap-2 sm:flex-row">
            {wrongCards.length ? (
              <Button size="lg" className="sm:flex-1" onClick={() => router.push(`/sets/${material.id}/learn?cards=${wrongCards.join(",")}`)}>
                {t("learnMistakes")}
              </Button>
            ) : null}
            <Button size="lg" variant={wrongCards.length ? "secondary" : "primary"} className="sm:flex-1" onClick={() => setPhase("setup")}>
              {t("newTest")}
            </Button>
          </div>
          <GuestNudge compact />
          <TestAnswerList questions={result.details} />
        </main>
      </div>
    );
  }

  if (!q) return null;

  // ---------- Kitöltés ----------
  const isLocked = Boolean(locked[q.idx]);
  const myAnswer = answers[q.idx];
  const correctNow = isLocked ? isCorrect(q, myAnswer, grading) : null;
  const promptLang = q.answerSide === "term" ? material.definitionLang : material.termLang;
  const answerLang = q.answerSide === "term" ? material.termLang : material.definitionLang;
  const sectionLabel = q.type === "tf" ? t("sectionTrueFalse") : q.type === "mc" ? t("sectionMc") : t("sectionWritten");
  const optionStates: OptionState[] | undefined = q.options
    ? q.options.map((o) => {
        if (isLocked) return o === q.answer ? "correct" : o === myAnswer ? "wrong" : "dim";
        return o === myAnswer ? "correct" : "idle";
      })
    : undefined;
  const isLast = current === questions.length - 1;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-2 px-3">
          <button type="button" onClick={() => setConfirmExit(true)} aria-label={t("exit")} title={t("exit")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <X className="size-6" aria-hidden />
          </button>
          <span className="font-bold tabular-nums">{t("questionOf", { current: current + 1, total: questions.length })}</span>
          <button type="button" onClick={() => setNavOpen(true)} aria-label={t("questionsNav")} title={t("questionsNav")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <LayoutGrid className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mx-auto max-w-2xl px-4 pb-2">
          <ProgressBar value={questions.length - unanswered} max={questions.length} label={t("answered")} />
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-4 pb-36">
        <p className="text-sm font-bold uppercase tracking-wider text-muted">{sectionLabel}</p>
        <PromptCard
          label={q.answerSide === "term" ? tc("definition") : tc("term")}
          text={q.prompt}
          lang={promptLang}
          imageId={q.answerSide === "term" ? cards.find((c) => c.id === q.cardId)?.imageId : null}
          onSpeak={() => speak(q.prompt, promptLang, { rate: user.ttsRate, volume: user.volume })}
        />

        {q.type === "tf" ? (
          <>
            <div className="rounded-2xl border-2 border-dashed border-border p-4">
              <p className="text-sm font-semibold text-muted">{q.answerSide === "term" ? t("matchesTerm") : t("matchesDefinition")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-lg font-medium" lang={answerLang}>
                {q.shown}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["true", "false"] as const).map((v) => {
                const chosen = myAnswer === v;
                const right = isLocked && (v === "true") === q.truth;
                const wrong = isLocked && chosen && !right;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={isLocked}
                    onClick={() => answerAndMaybeLock(v)}
                    aria-pressed={chosen}
                    className={cn(
                      "h-14 rounded-2xl border-2 bg-surface font-bold shadow-card",
                      right ? "border-known bg-known-soft" : wrong ? "border-danger bg-danger-soft" : chosen ? "border-primary bg-primary-soft" : "border-transparent hover:border-primary",
                    )}
                  >
                    {v === "true" ? t("true") : t("false")}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {q.type === "mc" && q.options ? (
          <McOptions options={q.options} states={optionStates} onPick={(i) => answerAndMaybeLock(q.options![i]!)} disabled={isLocked} label={sectionLabel} />
        ) : null}

        {q.type === "written" ? (
          <>
            <WrittenInput
              value={isLocked ? (myAnswer ?? "") : draft}
              onChange={(v) => {
                setDraft(v);
                if (!settings.instant) setAnswer(q.idx, v);
              }}
              onSubmit={() => {
                if (!draft.trim()) return;
                if (settings.instant) answerAndMaybeLock(draft);
                else if (isLast) trySubmit();
                else go(current + 1);
              }}
              lang={answerLang}
              label={t("written")}
              showAccents
              disabled={isLocked}
              status={isLocked ? (correctNow ? "correct" : "wrong") : "idle"}
            />
            {settings.instant && !isLocked ? (
              <div className="flex justify-end">
                <Button onClick={() => draft.trim() && answerAndMaybeLock(draft)} disabled={!draft.trim()}>
                  {tc("save")}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {isLocked ? (
          <div role="status" className={cn("rounded-2xl p-4", correctNow ? "bg-known-soft" : "bg-danger-soft")}>
            <p className={cn("font-bold", correctNow ? "text-known" : "text-danger")}>{correctNow ? t("instantCorrect") : t("instantWrong")}</p>
            {!correctNow ? (
              <p className="mt-1 whitespace-pre-wrap break-words" lang={answerLang}>
                {q.type === "tf" ? (q.truth ? t("true") : t("false")) : q.answer}
              </p>
            ) : null}
          </div>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <Button variant="ghost" onClick={() => go(current - 1)} disabled={current === 0}>
            <ChevronLeft className="size-5" aria-hidden /> {t("previous")}
          </Button>
          {isLast ? (
            <Button onClick={trySubmit}>{t("submitTest")}</Button>
          ) : (
            <Button variant={myAnswer || draft ? "primary" : "soft"} onClick={() => go(current + 1)}>
              {myAnswer || draft ? t("nextQuestion") : t("skip")} <ChevronRight className="size-5" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <Sheet open={navOpen} onClose={() => setNavOpen(false)} title={t("questionsNav")}>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {questions.map((x, i) => (
            <button
              key={x.idx}
              type="button"
              onClick={() => {
                go(i);
                setNavOpen(false);
              }}
              aria-current={i === current ? "step" : undefined}
              aria-label={`${i + 1}${answers[x.idx] ? ` (${t("answered")})` : ""}`}
              className={cn(
                "h-11 rounded-xl font-bold tabular-nums",
                i === current ? "ring-2 ring-primary" : "",
                answers[x.idx] ? "bg-primary text-on-primary" : "bg-surface shadow-card",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <Button className="mt-5" block onClick={() => (setNavOpen(false), trySubmit())}>
          {t("submitTest")}
        </Button>
      </Sheet>

      <ConfirmDialog
        open={confirmSubmit}
        title={t("unansweredTitle")}
        text={t("unansweredText", { count: questions.filter((x) => !answers[x.idx] && !(x.idx === q.idx && draft.trim())).length })}
        confirmLabel={t("submitAnyway")}
        cancelLabel={t("keepGoing")}
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={() => void finish()}
      />
      <ConfirmDialog
        open={confirmExit}
        title={t("exit")}
        text={t("exitConfirm")}
        confirmLabel={t("exit")}
        cancelLabel={t("keepGoing")}
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => router.push(backHref)}
        danger
      />
    </div>
  );
}
