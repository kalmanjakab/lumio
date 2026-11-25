"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "./ui";

/** Alulról felcsúszó beállítás-lap (mobilon), asztali gépen középre igazított párbeszédablak. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const t = useTranslations("common");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const first = focusables()[0];
    (first ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab") {
        const els = focusables();
        if (els.length === 0) return;
        const f = els[0]!;
        const l = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === f) {
          e.preventDefault();
          l.focus();
        } else if (!e.shiftKey && document.activeElement === l) {
          e.preventDefault();
          f.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-3xl bg-bg shadow-pop sm:animate-pop-in sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            title={t("close")}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? <div className="border-t border-border px-5 py-4 pb-safe">{footer}</div> : <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}

/** Lekerekített csoport a beállítás-lapon belül (Quizlet-szerű kártyás menü). */
export function SheetGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-1">
      {title ? <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">{title}</h3> : null}
      <div className="divide-y divide-border rounded-2xl bg-surface px-4 shadow-card">{children}</div>
    </section>
  );
}

export function SheetRowButton({
  label,
  value,
  onClick,
  danger,
}: {
  label: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center justify-between gap-3 py-3.5 text-left font-medium", danger ? "text-danger" : "text-fg")}
    >
      <span>{label}</span>
      {value ? <span className="text-sm font-semibold text-primary">{value}</span> : null}
    </button>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: ReactNode;
  text: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p className="text-fg">{text}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="h-11 rounded-full px-5 font-semibold hover:bg-surface-2">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn("h-11 rounded-full px-5 font-semibold", danger ? "bg-danger text-bg" : "bg-primary text-on-primary")}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
