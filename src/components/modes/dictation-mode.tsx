"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Eye, EyeOff, RotateCcw, Snail, Volume2, X } from "lucide-react";
import type { CardDTO, MaterialDTO, StudyData } from "@/lib/study-types";
import { useStudyData } from "@/lib/client/study-store";
import { useModeCards } from "@/lib/client/use-mode-cards";
import { readLocal, writeLocal } from "@/lib/client/storage";
import { speak, stopSpeaking, ttsSupported } from "@/lib/client/tts";
import { playSound } from "@/lib/client/sound";
import { gradeWritten, type GradingLevel } from "@/lib/grading";
import { useSettings } from "../providers";
import { Sheet } from "../sheet";
import { Button, ProgressBar, Segmented, Spinner, Switch, cn } from "../ui";
import { CardImage } from "../card-image";
import { AiExplain } from "../ai-explain";
import { ModeEmpty, ModeHeader } from "./mode-header";
import { WrittenInput, type WrittenInputHandle } from "./question-parts";

type Prefs = { target: "term" | "definition"; grading: GradingLevel; showMeaning: boolean };
const DEFAULT_PREFS: Prefs = { target: "term", grading: "medium", showMeaning: true };
type Result = { cardId: string; correct: boolean; given: string };

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/**
 * Diktálás: a gép felolvassa a kifejezést, te leírod. A „term” célnál a kiejtett szót kell leírni
 * (helyesírás), a „definition” célnál a jelentését (hallás utáni megértés).
 */
export function DictationMode({ material, cards: allCards, serverData }: { material: MaterialDTO; cards: CardDTO[]; serverData: StudyData | null }) {
  const t = useTranslations("dictation");
  const tc = useTranslations("common");
  const ts = useTranslations("set");
  const tl = useTranslations("learn");
  const { viewer, settings: user } = useSettings();
  const { data, store, ready } = useStudyData(viewer.kind, material.id, serverData);
  const { cards, emptyBecauseStarred } = useModeCards(allCards, data, null);
  const backHref = `/sets/${material.id}`;

  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setPrefsState({ ...DEFAULT_PREFS, ...readLocal<Partial<Prefs>>("dictation", {}) });
    setSupported(ttsSupported());
  }, []);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...p };
      writeLocal("dictation", next);
      return next;
    });

  const [queue, setQueue] = useState<CardDTO[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | { correct: boolean; overridden?: boolean }>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [sheet, setSheet] = useState(false);
  const inputRef = useRef<WrittenInputHandle>(null);

  const start = useCallback((list: CardDTO[]) => {
    setQueue(shuffle(list));
    setIdx(0);
    setInput("");
    setFeedback(null);
    setResults([]);
  }, []);

  useEffect(() => {
    if (ready && cards.length && queue === null) start(cards);
  }, [ready, cards, queue, start]);

  const card = queue && idx < queue.length ? queue[idx]! : null;
  const say = useCallback(
    (slow = false) => {
      if (!card) return;
      speak(card.term, material.termLang, { rate: (slow ? 0.6 : 1) * user.ttsRate, volume: user.volume });
    },
    [card, material.termLang, user.ttsRate, user.volume],
  );

  // Új kártyánál automatikus felolvasás.
  useEffect(() => {
    if (!card || feedback) return;
    const id = setTimeout(() => {
      say();
      inputRef.current?.focus();
    }, 250);
    return () => clearTimeout(id);
  }, [card, feedback, say]);
  useEffect(() => () => stopSpeaking(), []);

  const answer = card ? (prefs.target === "term" ? card.term : card.definition) : "";
  const answerLang = prefs.target === "term" ? material.termLang : material.definitionLang;

  const submit = () => {
    if (!card || feedback) return;
    if (!input.trim()) {
      say();
      return;
    }
    const r = gradeWritten(input, answer, prefs.grading);
    setFeedback({ correct: r.correct });
    setResults((prev) => [...prev, { cardId: card.id, correct: r.correct, given: input }]);
    store.recordActivity(1);
    if (user.soundEffects) playSound(r.correct ? "correct" : "wrong", user.volume);
  };

  const override = () => {
    if (!card || !feedback || feedback.correct) return;
    setFeedback({ correct: true, overridden: true });
    setResults((prev) => prev.map((x, i) => (i === prev.length - 1 ? { ...x, correct: true } : x)));
  };

  const next = () => {
    if (!queue) return;
    const last = results[results.length - 1];
    // A hibás kártya a kör végén még egyszer előjön (egyszer).
    if (last && !last.correct && card && queue.slice(idx + 1).every((c) => c.id !== card.id) && results.filter((r) => r.cardId === card.id).length < 2) {
      setQueue([...queue, card]);
    }
    setIdx((i) => i + 1);
    setInput("");
    setFeedback(null);
    if (idx + 1 >= queue.length && user.soundEffects) playSound("finish", user.volume);
  };

  // Enter a visszajelzésnél a következőre lép.
  useEffect(() => {
    if (!feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    const id = setTimeout(() => window.addEventListener("keydown", onKey), 50);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  });

  const firstTry = useMemo(() => {
    const seen = new Set<string>();
    let ok = 0;
    for (const r of results) {
      if (seen.has(r.cardId)) continue;
      seen.add(r.cardId);
      if (r.correct) ok++;
    }
    return { ok, total: seen.size };
  }, [results]);

  const header = (
    <ModeHeader
      backHref={backHref}
      center={queue && card ? `${Math.min(idx + 1, queue.length)} / ${queue.length}` : t("title")}
      onSettings={() => setSheet(true)}
    />
  );

  const settingsSheet = (
    <Sheet open={sheet} onClose={() => setSheet(false)} title={t("settings")}>
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 font-medium">{t("target")}</p>
          <Segmented
            label={t("target")}
            value={prefs.target}
            onChange={(v) => {
              setPrefs({ target: v });
              start(cards);
            }}
            options={[
              { value: "term", label: t("targetTerm") },
              { value: "definition", label: t("targetDefinition") },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 font-medium">{tl("grading")}</p>
          <Segmented
            label={tl("grading")}
            value={prefs.grading}
            onChange={(v) => setPrefs({ grading: v })}
            options={[
              { value: "lenient", label: tl("gradingLenient") },
              { value: "medium", label: tl("gradingMedium") },
              { value: "strict", label: tl("gradingStrict") },
            ]}
          />
        </div>
        {prefs.target === "term" ? <Switch label={t("showMeaning")} checked={prefs.showMeaning} onChange={(v) => setPrefs({ showMeaning: v })} /> : null}
        <Button variant="soft" onClick={() => (start(cards), setSheet(false))}>
          <RotateCcw className="size-4" aria-hidden /> {t("restart")}
        </Button>
      </div>
    </Sheet>
  );

  if (!ready || (queue === null && cards.length > 0)) {
    return (
      <div className="min-h-dvh">
        <ModeHeader backHref={backHref} center={t("title")} />
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </div>
    );
  }
  if (!supported) return <ModeEmpty backHref={backHref} title={t("title")} text={t("noTts")} actionLabel={tc("back")} />;
  if (emptyBecauseStarred || cards.length === 0) {
    return <ModeEmpty backHref={backHref} title={t("title")} text={emptyBecauseStarred ? ts("starredOnlyEmpty") : t("noCards")} actionLabel={tc("back")} />;
  }

  // ---------- Vége ----------
  if (!card) {
    const misses = [...new Set(results.filter((r) => !r.correct).map((r) => r.cardId))];
    const missCards = cards.filter((c) => misses.includes(c.id));
    return (
      <div className="min-h-dvh">
        {header}
        {settingsSheet}
        <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
          <div className="rounded-2xl bg-surface p-6 text-center shadow-card">
            <h1 className="text-2xl font-extrabold">{t("doneTitle")}</h1>
            <p className="mt-2 text-lg">{t("doneScore", { ok: firstTry.ok, total: firstTry.total })}</p>
          </div>
          {missCards.length ? (
            <section className="rounded-2xl bg-surface p-5 shadow-card">
              <h2 className="mb-3 font-bold">{t("practiceThese")}</h2>
              <ul className="flex flex-col divide-y divide-border">
                {missCards.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold" lang={material.termLang}>
                        {c.term}
                      </p>
                      <p className="text-sm text-muted" lang={material.definitionLang}>
                        {c.definition}
                      </p>
                    </div>
                    <button type="button" onClick={() => speak(c.term, material.termLang, { rate: user.ttsRate, volume: user.volume })} aria-label={t("play")} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
                      <Volume2 className="size-5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            {missCards.length ? <Button onClick={() => start(missCards)}>{t("retryMisses", { count: missCards.length })}</Button> : null}
            <Button variant={missCards.length ? "secondary" : "primary"} onClick={() => start(cards)}>
              {t("restart")}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ---------- Kérdés ----------
  const done = idx;
  return (
    <div className="min-h-dvh">
      {header}
      {settingsSheet}
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10 pt-2">
        <ProgressBar value={done} max={queue!.length} label={t("title")} />
        <section className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-6 text-center shadow-card">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">{prefs.target === "term" ? t("promptTerm") : t("promptDefinition")}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => say()} aria-label={t("play")} title={t("play")} className="flex size-16 items-center justify-center rounded-full bg-primary text-on-primary shadow-card active:scale-95">
              <Volume2 className="size-8" aria-hidden />
            </button>
            <button type="button" onClick={() => say(true)} aria-label={t("playSlow")} title={t("playSlow")} className="flex size-16 items-center justify-center rounded-full bg-surface-2 active:scale-95">
              <Snail className="size-7" aria-hidden />
            </button>
          </div>
          {prefs.target === "term" && prefs.showMeaning ? (
            <div className="flex flex-col items-center gap-2">
              {card.imageId ? <CardImage id={card.imageId} size="md" /> : null}
              <p className="text-muted" lang={material.definitionLang}>
                {card.definition}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted">{t("enterReplays")}</p>
        </section>

        <WrittenInput
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={submit}
          lang={answerLang}
          label={prefs.target === "term" ? t("typeTerm") : t("typeDefinition")}
          showAccents
          disabled={Boolean(feedback)}
          status={feedback ? (feedback.correct ? "correct" : "wrong") : "idle"}
        />

        {feedback ? (
          <section className={cn("rounded-2xl p-5", feedback.correct ? "bg-known-soft" : "bg-danger-soft")} aria-live="polite">
            <p className={cn("mb-2 flex items-center gap-2 font-bold", feedback.correct ? "text-known" : "text-danger")}>
              {feedback.correct ? <Check className="size-5" aria-hidden /> : <X className="size-5" aria-hidden />}
              {feedback.correct ? (feedback.overridden ? t("countedCorrect") : t("correct")) : t("wrong")}
            </p>
            <p className="text-sm text-muted">{t("answerWas")}</p>
            <p className="text-lg font-semibold" lang={answerLang}>
              {answer}
            </p>
            {prefs.target === "definition" ? (
              <p className="mt-1 text-sm text-muted" lang={material.termLang}>
                {card.term}
              </p>
            ) : null}
            {!feedback.correct ? <AiExplain cardId={card.id} answer={results[results.length - 1]?.given ?? null} className="mt-3" /> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={next} autoFocus>
                {t("next")}
              </Button>
              {!feedback.correct ? (
                <Button variant="ghost" onClick={override}>
                  {tl("overrideCorrect")}
                </Button>
              ) : null}
            </div>
          </section>
        ) : (
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setPrefs({ showMeaning: !prefs.showMeaning })} disabled={prefs.target !== "term"}>
              {prefs.showMeaning ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {prefs.showMeaning ? t("hideMeaning") : t("showMeaningShort")}
            </Button>
            <Button onClick={submit} disabled={!input.trim()}>
              {t("check")}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
