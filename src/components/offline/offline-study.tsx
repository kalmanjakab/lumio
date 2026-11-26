"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, RotateCcw, Shuffle, Volume2, WifiOff, X } from "lucide-react";
import { addOfflineActivity, listOffline, type OfflineSet } from "@/lib/client/offline";
import { speak, ttsSupported } from "@/lib/client/tts";

export type OfflineTexts = {
  title: string;
  text: string;
  retry: string;
  savedTitle: string;
  none: string;
  cards: string; // „{count} kártya”
  study: string;
  back: string;
  know: string;
  dontKnow: string;
  flip: string;
  done: string; // „{known} / {total}”
  again: string;
  againMissed: string;
  savedNote: string;
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Offline oldal: a mentett készletek egyszerű kártyázása, internet nélkül. Nem használ szerveres adatot. */
export function OfflineStudy({ t }: { t: OfflineTexts }) {
  const [sets, setSets] = useState<OfflineSet[] | null>(null);
  const [active, setActive] = useState<OfflineSet | null>(null);
  useEffect(() => setSets(listOffline()), []);

  if (active) return <Session set={active} t={t} onBack={() => setActive(null)} />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <WifiOff className="size-8 text-muted" aria-hidden />
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <p className="text-muted">{t.text}</p>
        {/* Teljes újratöltés kell (nem kliensoldali navigáció), hogy a hálózatról jöjjön az oldal. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">
          {t.retry}
        </a>
      </div>
      {sets === null ? null : (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-muted">{t.savedTitle}</h2>
          {sets.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-muted shadow-card">{t.none}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sets.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setActive(s)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-left shadow-card hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.title}</span>
                      <span className="text-sm text-muted">{fill(t.cards, { count: s.cards.length })}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-primary">{t.study}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 px-1 text-xs text-muted">{t.savedNote}</p>
        </section>
      )}
    </main>
  );
}

function Session({ set, t, onBack }: { set: OfflineSet; t: OfflineTexts; onBack: () => void }) {
  const [order, setOrder] = useState(() => shuffle(set.cards));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState<string[]>([]);
  const [known, setKnown] = useState(0);
  const tts = useMemo(() => ttsSupported(), []);
  const card = order[i];

  const decide = (ok: boolean) => {
    if (!card) return;
    addOfflineActivity(1);
    if (ok) setKnown((k) => k + 1);
    else setMissed((m) => [...m, card.id]);
    setFlipped(false);
    setI((x) => x + 1);
  };
  const restart = (cards = set.cards) => {
    setOrder(shuffle(cards));
    setI(0);
    setKnown(0);
    setMissed([]);
    setFlipped(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") decide(true);
      else if (e.key === "ArrowLeft") decide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label={t.back} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
          <ArrowLeft className="size-6" aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-bold">{set.title}</h1>
        <span className="text-sm tabular-nums text-muted">{Math.min(i + 1, order.length)} / {order.length}</span>
      </div>
      {card ? (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={t.flip}
            className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl bg-surface p-8 text-center shadow-card"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">{flipped ? set.definitionLang : set.termLang}</span>
            <span className="whitespace-pre-wrap text-2xl font-bold" lang={flipped ? set.definitionLang : set.termLang}>
              {flipped ? card.definition : card.term}
            </span>
          </button>
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => decide(false)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-danger-soft font-semibold text-danger">
              <X className="size-5" aria-hidden /> {t.dontKnow}
            </button>
            {tts ? (
              <button type="button" onClick={() => speak(flipped ? card.definition : card.term, flipped ? set.definitionLang : set.termLang)} aria-label="TTS" className="flex size-12 items-center justify-center rounded-full bg-surface-2">
                <Volume2 className="size-5" aria-hidden />
              </button>
            ) : null}
            <button type="button" onClick={() => decide(true)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-known-soft font-semibold text-known">
              <Check className="size-5" aria-hidden /> {t.know}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface p-8 text-center shadow-card">
          <p className="text-2xl font-extrabold">{fill(t.done, { known, total: order.length })}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {missed.length ? (
              <button type="button" onClick={() => restart(set.cards.filter((c) => missed.includes(c.id)))} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-on-primary">
                <RotateCcw className="size-4" aria-hidden /> {fill(t.againMissed, { count: missed.length })}
              </button>
            ) : null}
            <button type="button" onClick={() => restart()} className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 font-semibold">
              <Shuffle className="size-4" aria-hidden /> {t.again}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
