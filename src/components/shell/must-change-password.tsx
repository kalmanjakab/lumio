"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, PasswordField } from "../ui";
import { Logo } from "../logo";
import { api, ApiClientError } from "@/lib/client/api";

export function MustChangePassword() {
  const t = useTranslations("auth");
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Logo />
      <div>
        <h1 className="text-2xl font-extrabold">{t("mustChangeTitle")}</h1>
        <p className="mt-2 text-muted">{t("mustChangeText")}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (next.length < 8) return setErr(t("passwordTooShort"));
          if (next !== again) return setErr(t("passwordMismatch"));
          setBusy(true);
          try {
            await api("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
            window.location.reload();
          } catch (e) {
            setBusy(false);
            if (e instanceof ApiClientError && e.code === "wrong_password") setErr(ts("wrongCurrentPassword"));
            else setErr(tc("error"));
          }
        }}
      >
        <PasswordField label={ts("currentPassword")} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <PasswordField label={ts("newPassword")} hint={t("passwordHint")} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        <PasswordField label={ts("newPasswordAgain")} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
        {err ? (
          <p role="alert" className="font-medium text-danger">
            {err}
          </p>
        ) : null}
        <Button type="submit" loading={busy} block>
          {tc("save")}
        </Button>
      </form>
    </main>
  );
}
