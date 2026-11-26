"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Volume2 } from "lucide-react";
import type { CardDTO } from "@/lib/study-types";
import { useSettings } from "../providers";
import { speak } from "@/lib/client/tts";
import { cn } from "../ui";
import { CardImage } from "../card-image";

export function CardPreview({ cards, termLang, definitionLang }: { cards: CardDTO[]; termLang: string; definitionLang: string }) {
  const t = useTranslations("set");
  const tc = useTranslations("common");
  const { settings } = useSettings();
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    if (i >= cards.length) setI(0);
  }, [cards.length, i]);
  if (cards.length === 0) return null;
  const card = cards[Math.min(i, cards.length - 1)]!;
  const frontIsTerm = settings.defaultFront === "term";
  const front = frontIsTerm ? card.term : card.definition;
  const back = frontIsTerm ? card.definition : card.term;
  const go = (d: number) => {
    setFlipped(false);
    setI((x) => (x + d + cards.length) % cards.length);
  };
  const say = (e: React.MouseEvent) => {
    e.stopPropagation();
    const showingTerm = frontIsTerm !== flipped;
    speak(showingTerm ? card.term : card.definition, showingTerm ? termLang : definitionLang, { rate: settings.ttsRate, volume: settings.volume });
  };
  return (
    <section aria-label={t("preview")} className="mb-8">
      <div
        className="flip-scene"
        onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0]!.clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          aria-label={`${flipped ? back : front}. ${t("flipHint")}`}
          className={cn("flip-inner block h-56 w-full sm:h-72", flipped && "is-flipped")}
        >
          {[front, back].map((text, side) => (
            <span
              key={side}
              className={cn("flip-face flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface p-6 shadow-card", side === 1 && "flip-back")}
              aria-hidden
            >
              {(side === 1) === frontIsTerm ? <CardImage id={card.imageId} /> : null}
              <span className="max-h-full overflow-auto whitespace-pre-wrap text-center text-2xl font-medium sm:text-3xl">{text}</span>
            </span>
          ))}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={say} aria-label={tc("speak")} title={tc("speak")} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
          <Volume2 className="size-5" aria-hidden />
        </button>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => go(-1)} aria-label={t("previousCard")} title={t("previousCard")} className="flex size-11 items-center justify-center rounded-full bg-surface shadow-card hover:bg-surface-2">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <span className="min-w-16 text-center font-semibold tabular-nums" aria-live="polite">
            {tc("of", { current: Math.min(i, cards.length - 1) + 1, total: cards.length })}
          </span>
          <button type="button" onClick={() => go(1)} aria-label={t("nextCard")} title={t("nextCard")} className="flex size-11 items-center justify-center rounded-full bg-surface shadow-card hover:bg-surface-2">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
        <span className="size-11" aria-hidden />
      </div>
    </section>
  );
}
