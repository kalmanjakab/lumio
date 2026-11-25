"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Lightbulb, Volume2, X } from "lucide-react";
import { accentsFor } from "@/lib/accents";
import { cn } from "../ui";

export function PromptCard({ label, text, onSpeak, compact, lang }: { label?: string; text: string; onSpeak?: () => void; compact?: boolean; lang?: string }) {
  const tc = useTranslations("common");
  return (
    <div className={cn("rounded-3xl bg-surface p-5 shadow-card", compact ? "min-h-28" : "min-h-40")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-muted">{label}</span>
        {onSpeak ? (
          <button type="button" onClick={onSpeak} aria-label={tc("speak")} title={tc("speak")} className="-m-2 flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
            <Volume2 className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-xl font-medium leading-snug sm:text-2xl" lang={lang}>
        {text}
      </p>
    </div>
  );
}

export type OptionState = "idle" | "correct" | "wrong" | "dim";

export function McOptions({
  options,
  states,
  onPick,
  disabled,
  label,
}: {
  options: string[];
  states?: OptionState[];
  onPick: (i: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {options.map((o, i) => {
        const st = states?.[i] ?? "idle";
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onPick(i)}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-2xl border-2 bg-surface p-4 text-left font-medium shadow-card transition-colors",
              st === "idle" && "border-transparent hover:border-primary",
              st === "correct" && "border-known bg-known-soft",
              st === "wrong" && "border-danger bg-danger-soft",
              st === "dim" && "border-transparent opacity-60",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                st === "correct" ? "bg-known text-bg" : st === "wrong" ? "bg-danger text-bg" : "bg-surface-2 text-muted",
              )}
              aria-hidden
            >
              {st === "correct" ? <Check className="size-4" /> : st === "wrong" ? <X className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

export type WrittenInputHandle = { focus: () => void };

export const WrittenInput = forwardRef<
  WrittenInputHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    lang: string;
    label: string;
    showAccents: boolean;
    hintAnswer?: string | null;
    disabled?: boolean;
    status?: "idle" | "correct" | "wrong";
  }
>(function WrittenInput({ value, onChange, onSubmit, lang, label, showAccents, hintAnswer, disabled, status = "idle" }, ref) {
  const t = useTranslations("learn");
  const inputRef = useRef<HTMLInputElement>(null);
  const [hintLen, setHintLen] = useState(0);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  const accents = showAccents ? accentsFor(lang) : [];
  const insert = (ch: string) => {
    const el = inputRef.current;
    if (!el) return onChange(value + ch);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-2"
    >
      {accents.length && !disabled ? (
        <div className="flex flex-wrap gap-1.5" aria-label={t("accentBar")}>
          {accents.map((ch) => (
            <button
              key={ch}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(ch)}
              className="h-9 min-w-9 rounded-lg bg-surface px-2 font-semibold shadow-card hover:bg-surface-2"
            >
              {ch}
            </button>
          ))}
        </div>
      ) : null}
      <label className="sr-only" htmlFor="written-answer">
        {label}
      </label>
      <input
        ref={inputRef}
        id="written-answer"
        lang={lang}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={t("answerPlaceholder")}
        className={cn(
          "h-14 w-full rounded-2xl border-2 bg-surface px-4 text-lg focus:outline-none",
          status === "correct" ? "border-known" : status === "wrong" ? "border-danger" : "border-border focus:border-primary",
        )}
      />
      {hintAnswer && !disabled ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const n = Math.min(hintAnswer.length, hintLen + 1);
              setHintLen(n);
              onChange(hintAnswer.slice(0, n));
              inputRef.current?.focus();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Lightbulb className="size-4" aria-hidden /> {t("hint")}
          </button>
        </div>
      ) : null}
    </form>
  );
});
