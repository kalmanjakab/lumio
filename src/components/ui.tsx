"use client";

import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "bg-surface text-fg shadow-card hover:bg-surface-2",
  ghost: "bg-transparent text-fg hover:bg-surface-2",
  danger: "bg-danger text-bg hover:opacity-90",
  soft: "bg-primary-soft text-primary hover:brightness-95",
  outline: "border-2 border-border bg-transparent text-fg hover:bg-surface-2",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-6 text-base",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; block?: boolean }
>(function Button({ variant = "primary", size = "md", loading, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[background,color,box-shadow,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: "ghost" | "surface" | "soft"; size?: "sm" | "md" | "lg" }
>(function IconButton({ label, variant = "ghost", size = "md", className, children, ...rest }, ref) {
  const s = size === "sm" ? "size-9" : size === "lg" ? "size-14" : "size-11";
  const v =
    variant === "surface"
      ? "bg-surface shadow-card hover:bg-surface-2"
      : variant === "soft"
        ? "bg-surface-2 hover:bg-surface-3"
        : "hover:bg-surface-2";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-fg transition-colors disabled:opacity-40", s, v, className)}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={sid} className="block font-medium text-fg">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-primary" : "border border-border bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-5 -translate-y-1/2 rounded-full shadow transition-all",
            checked ? "left-[1.6rem] bg-on-primary" : "left-1 bg-muted",
          )}
        />
      </button>
    </div>
  );
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: ReactNode; hideLabel?: boolean }
>(function TextField({ label, hint, error, hideLabel, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? `${fid}-hint` : null, error ? `${fid}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fid} className={cn("text-sm font-semibold text-fg", hideLabel && "sr-only")}>
        {label}
      </label>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-12 w-full rounded-xl border-2 bg-surface px-4 text-base text-fg placeholder:text-muted/70 focus:border-primary focus:outline-none",
          error ? "border-danger" : "border-border",
        )}
        {...rest}
      />
      {hint ? (
        <p id={`${fid}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fid}-err`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export function PasswordField(props: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: ReactNode }) {
  const t = useTranslations("auth");
  const [show, setShow] = useState(false);
  const { label, hint, error, id, ...rest } = props;
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-sm font-semibold text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          id={fid}
          type={show ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? `${fid}-hint` : undefined}
          className={cn(
            "h-12 w-full rounded-xl border-2 bg-surface px-4 pr-12 text-base text-fg focus:border-primary focus:outline-none",
            error ? "border-danger" : "border-border",
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t("hidePassword") : t("showPassword")}
          title={show ? t("hidePassword") : t("showPassword")}
          className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2"
        >
          {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
      {hint ? (
        <p id={`${fid}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 flex-1 rounded-full px-3 text-sm font-semibold transition-colors",
            value === o.value ? "bg-surface text-primary shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DualProgress({ learning, known, total, className }: { learning: number; known: number; total: number; className?: string }) {
  const lp = total ? (learning / total) * 100 : 0;
  const kp = total ? (known / total) * 100 : 0;
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} aria-hidden>
      <div className="h-full bg-learning transition-[width] duration-300" style={{ width: `${lp}%` }} />
      <div className="h-full bg-known transition-[width] duration-300" style={{ width: `${kp}%` }} />
    </div>
  );
}

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label?: string; className?: string }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${p}%` }} />
    </div>
  );
}

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "li" }) {
  return <As className={cn("rounded-2xl bg-surface shadow-card", className)}>{children}</As>;
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id={id} className="text-lg font-bold text-fg sm:text-xl">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-6 animate-spin text-muted", className)} aria-hidden />;
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center text-muted">
      {icon}
      <div className="max-w-sm text-sm">{children}</div>
    </div>
  );
}
