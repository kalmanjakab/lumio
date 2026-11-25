"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info, X } from "lucide-react";
import { Button, PasswordField, Segmented, TextField } from "@/components/ui";
import { Logo } from "@/components/logo";
import { api, ApiClientError } from "@/lib/client/api";
import { importGuestDataAfterLogin } from "@/lib/client/study-store";
import { USERNAME_RE } from "@/lib/validation";

export function LoginForm({ initialMode, next }: { initialMode: "login" | "register"; next: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ username?: string; password?: string; again?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setFieldErr({});
    if (mode === "register") {
      const fe: typeof fieldErr = {};
      if (!USERNAME_RE.test(username.trim())) fe.username = t("usernameInvalid");
      if (password.length < 8) fe.password = t("passwordTooShort");
      if (password !== again) fe.again = t("passwordMismatch");
      if (Object.keys(fe).length) return setFieldErr(fe);
    }
    setBusy(true);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", body: { username: username.trim(), password } });
      await importGuestDataAfterLogin();
      window.location.href = next;
    } catch (e) {
      setBusy(false);
      if (!(e instanceof ApiClientError)) return setErr(tc("error"));
      switch (e.code) {
        case "invalid_credentials":
          return setErr(t("invalidCredentials"));
        case "username_taken":
          return setFieldErr({ username: t("usernameTaken") });
        case "username_invalid":
          return setFieldErr({ username: t("usernameInvalid") });
        case "password_too_short":
          return setFieldErr({ password: t("passwordTooShort") });
        case "too_many":
          return setErr(tc("tooMany", { minutes: Math.max(1, Math.ceil(Number(e.data.retryAfter ?? 60) / 60)) }));
        case "network":
          return setErr(tc("networkError"));
        default:
          return setErr(tc("error"));
      }
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-safe">
      <div className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Flashly">
          <Logo />
        </Link>
        <Link
          href={next}
          aria-label={tc("close")}
          title={tc("close")}
          className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <X className="size-6" aria-hidden />
        </Link>
      </div>
      <div className="mt-6 flex flex-col gap-6">
        <h1 className="text-3xl font-extrabold">{mode === "login" ? t("loginTitle") : t("registerTitle")}</h1>
        <Segmented
          label={t("loginTitle")}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErr(null);
            setFieldErr({});
          }}
          options={[
            { value: "login", label: t("loginTitle") },
            { value: "register", label: t("registerTitle") },
          ]}
        />
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <TextField
            label={t("username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={mode === "register" ? 20 : 40}
            hint={mode === "register" ? t("usernameHint") : undefined}
            error={fieldErr.username}
            required
          />
          {mode === "register" ? (
            <p className="flex gap-2 rounded-xl bg-learning-soft px-3 py-2.5 text-sm font-medium text-learning">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("realNameWarning")}
            </p>
          ) : null}
          <PasswordField
            label={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            hint={mode === "register" ? t("passwordHint") : undefined}
            error={fieldErr.password}
            required
          />
          {mode === "register" ? (
            <PasswordField
              label={t("passwordAgain")}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
              error={fieldErr.again}
              required
            />
          ) : null}
          {err ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 font-medium text-danger">
              {err}
            </p>
          ) : null}
          <Button type="submit" size="lg" loading={busy} block>
            {mode === "login" ? t("loginButton") : t("registerButton")}
          </Button>
        </form>
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p>{t("guestProgressNote")}</p>
          <p>{t("noEmailNote")}</p>
        </div>
        <Link href={next} className="text-center font-semibold text-primary hover:underline">
          {t("continueAsGuest")}
        </Link>
      </div>
    </main>
  );
}
