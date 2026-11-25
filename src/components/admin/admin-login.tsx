"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, PasswordField } from "../ui";
import { LogoMark } from "../logo";
import { api, ApiClientError } from "@/lib/client/api";

export function AdminLogin({ configured, base }: { configured: boolean; base: string }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5">
      <div className="flex items-center gap-3">
        <LogoMark className="size-10" />
        <h1 className="text-2xl font-extrabold">Admin belépés</h1>
      </div>
      {!configured ? (
        <div className="rounded-2xl bg-learning-soft p-4 text-sm text-learning">
          <p className="font-bold">Az admin jelszó még nincs beállítva.</p>
          <p className="mt-1">
            Generálj hash-t a{" "}
            <Link href={`${base}/hash`} className="font-bold underline">
              jelszó-hash oldalon
            </Link>
            , és add meg a Vercelen <code>ADMIN_PASSWORD_HASH</code> néven.
          </p>
        </div>
      ) : null}
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            await api("/api/admin/login", { method: "POST", body: { password } });
            window.location.reload();
          } catch (e) {
            setBusy(false);
            if (e instanceof ApiClientError && e.code === "too_many") {
              setErr(`Túl sok próbálkozás. Próbáld újra ${Math.ceil(Number(e.data.retryAfter ?? 900) / 60)} perc múlva.`);
            } else if (e instanceof ApiClientError && e.code === "admin_not_configured") {
              setErr("Az admin jelszó nincs beállítva.");
            } else setErr("Hibás jelszó.");
          }
        }}
      >
        <PasswordField label="Admin jelszó" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {err ? (
          <p role="alert" className="font-medium text-danger">
            {err}
          </p>
        ) : null}
        <Button type="submit" loading={busy} disabled={!configured} block>
          Belépés
        </Button>
      </form>
    </main>
  );
}
