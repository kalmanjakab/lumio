"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button, PasswordField } from "../ui";
import { useToast } from "../toast";
import { ConfirmDialog } from "../sheet";
import { useSettings } from "../providers";
import { api, ApiClientError } from "@/lib/client/api";

export function UnlockForm({ groupId, groupName, next }: { groupId: string; groupName: string; next?: string }) {
  const t = useTranslations("groups");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const { viewer } = useSettings();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-surface p-6 shadow-card">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Lock className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold">{groupName}</h1>
      <p className="mt-1 text-muted">{t("lockedHint")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            await api(`/api/groups/${groupId}/unlock`, { method: "POST", body: { password } });
            toast(t("unlocked"), "success");
            if (next) router.push(next);
            router.refresh();
          } catch (e) {
            setBusy(false);
            if (e instanceof ApiClientError && e.code === "wrong_password") setErr(t("wrongPassword"));
            else if (e instanceof ApiClientError && e.code === "too_many")
              setErr(tc("tooMany", { minutes: Math.max(1, Math.ceil(Number(e.data.retryAfter ?? 60) / 60)) }));
            else setErr(tc("error"));
          }
        }}
      >
        <PasswordField label={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required error={err ?? undefined} />
        <Button type="submit" loading={busy} block>
          {t("unlock")}
        </Button>
        {viewer.kind === "guest" ? <p className="text-sm text-muted">{t("guestDeviceNote")}</p> : null}
      </form>
    </div>
  );
}

export function RemoveGroupButton({ groupId, groupName, redirectTo }: { groupId: string; groupName: string; redirectTo?: string }) {
  const t = useTranslations("groups");
  const tc = useTranslations("common");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm(true)}>
        {t("remove")}
      </Button>
      {confirm ? (
        <ConfirmRemove
          text={t("removeConfirm", { name: groupName })}
          confirmLabel={t("remove")}
          cancelLabel={tc("cancel")}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await api(`/api/groups/${groupId}/lock`, { method: "POST", body: {} }).catch(() => {});
            setConfirm(false);
            if (redirectTo) router.push(redirectTo);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmRemove(props: { text: string; confirmLabel: string; cancelLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmDialog open title={props.confirmLabel} danger {...props} />;
}
