"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Download, ImageUp, LogIn, LogOut, ShieldCheck, Trash2, Volume2, Share } from "lucide-react";
import { useInstall, useSettings } from "../providers";
import { Avatar } from "../avatar";
import { Sheet, ConfirmDialog } from "../sheet";
import { Button, PasswordField, Segmented, Switch, cn } from "../ui";
import { useToast } from "../toast";
import { clearOffline } from "@/lib/client/offline";
import { api, ApiClientError } from "@/lib/client/api";
import { playSound } from "@/lib/client/sound";
import { speak } from "@/lib/client/tts";
import { LOCALES, type Locale } from "@/lib/validation";
import { NotificationSettings } from "./notification-settings";

const LANG_NAMES: Record<Locale, string> = { hu: "Magyar", en: "English", fr: "Français", de: "Deutsch" };
const PRESETS = Array.from({ length: 12 }, (_, i) => `a${i + 1}`);

type Group = { id: string; name: string; unlocked: boolean };

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="mb-8">
      <h2 id={id} className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-muted">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-2xl bg-surface px-4 shadow-card">{children}</div>
    </section>
  );
}

function Row({ children, onClick, danger, icon }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 py-3.5 text-left font-medium", danger ? "text-danger" : "text-fg")}>
      {icon}
      <span className="flex-1">{children}</span>
      {!danger ? <ChevronRight className="size-4 text-muted" aria-hidden /> : null}
    </button>
  );
}

export function SettingsView({ groups }: { groups: Group[] }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tg = useTranslations("groups");
  const ti = useTranslations("install");
  const router = useRouter();
  const toast = useToast();
  const { viewer, settings, update } = useSettings();
  const install = useInstall();
  const [sheet, setSheet] = useState<null | "avatar" | "password" | "delete" | "install">(null);
  const [removeGroup, setRemoveGroup] = useState<Group | null>(null);

  const unlocked = groups.filter((g) => g.unlocked);
  const locked = groups.filter((g) => !g.unlocked);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>

      <Section title={t("account")} id="s-account">
        {viewer.kind === "user" ? (
          <>
            <div className="flex items-center gap-4 py-4">
              <Avatar url={viewer.avatarUrl} name={viewer.username} size={64} />
              <div className="min-w-0">
                <p className="text-sm text-muted">{t("username")}</p>
                <p className="truncate text-lg font-bold">{viewer.username}</p>
              </div>
            </div>
            <Row icon={<ImageUp className="size-5 text-muted" aria-hidden />} onClick={() => setSheet("avatar")}>
              {t("changePicture")}
            </Row>
            <Row icon={<ShieldCheck className="size-5 text-muted" aria-hidden />} onClick={() => setSheet("password")}>
              {t("changePassword")}
            </Row>
            <Row
              icon={<LogOut className="size-5 text-muted" aria-hidden />}
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    clearOffline();
                window.location.href = "/";
              }}
            >
              {t("logout")}
            </Row>
            <Row danger icon={<Trash2 className="size-5" aria-hidden />} onClick={() => setSheet("delete")}>
              {t("deleteAccount")}
            </Row>
          </>
        ) : (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-muted">{t("guestAccount")}</p>
            <Link href="/login" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-on-primary">
              <LogIn className="size-4" aria-hidden /> {t("loginOrRegister")}
            </Link>
          </div>
        )}
      </Section>

      <Section title={t("myGroups")} id="s-groups">
        {unlocked.length === 0 ? <p className="py-3.5 text-muted">{t("noGroups")}</p> : null}
        {unlocked.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 py-3">
            <Link href={`/groups/${g.id}`} className="min-w-0 truncate font-semibold hover:text-primary">
              {g.name}
            </Link>
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoveGroup(g)}>
              {tg("remove")}
            </Button>
          </div>
        ))}
        {locked.length ? <AddGroupForm groups={locked} onDone={() => router.refresh()} /> : null}
      </Section>

      <Section title={t("appearance")} id="s-appearance">
        <div className="py-3.5">
          <Segmented
            label={t("appearance")}
            value={settings.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: "light", label: t("themeLight") },
              { value: "dark", label: t("themeDark") },
              { value: "system", label: t("themeSystem") },
            ]}
          />
        </div>
      </Section>

      <Section title={t("sound")} id="s-sound">
        <Switch label={t("soundEffects")} checked={settings.soundEffects} onChange={(v) => update({ soundEffects: v })} />
        <div className="py-3.5">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="volume" className="font-medium">
              {t("volume")}
            </label>
            <span className="text-sm font-semibold tabular-nums text-muted">{settings.volume}</span>
          </div>
          <input
            id="volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            className="w-full accent-[var(--primary)]"
            aria-describedby="volume-desc"
          />
          <p id="volume-desc" className="mt-1 text-sm text-muted">
            {t("volumeDesc")}
          </p>
        </div>
        <div className="py-3.5">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="tts-rate" className="font-medium">
              {t("ttsRate")}
            </label>
            <span className="text-sm font-semibold tabular-nums text-muted">{settings.ttsRate.toFixed(2)}×</span>
          </div>
          <input
            id="tts-rate"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={settings.ttsRate}
            onChange={(e) => update({ ttsRate: Number(e.target.value) })}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>{t("slow")}</span>
            <span>{t("fast")}</span>
          </div>
        </div>
        <div className="py-3">
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              playSound("correct", settings.volume);
              setTimeout(() => speak("Flashly", "en-GB", { rate: settings.ttsRate, volume: settings.volume }), 400);
            }}
          >
            <Volume2 className="size-4" aria-hidden /> {t("testSound")}
          </Button>
        </div>
      </Section>

      <Section title={t("language")} id="s-language">
        <div role="radiogroup" aria-label={t("language")} className="flex flex-col py-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={settings.locale === l}
              onClick={() => update({ locale: l })}
              className="flex items-center justify-between py-3 text-left font-medium"
              lang={l}
            >
              {LANG_NAMES[l]}
              <span className={cn("flex size-5 items-center justify-center rounded-full border-2", settings.locale === l ? "border-primary" : "border-border")} aria-hidden>
                {settings.locale === l ? <span className="size-2.5 rounded-full bg-primary" /> : null}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("studyDefaults")} id="s-study">
        <div className="py-3.5">
          <p className="mb-2 font-medium">{t("defaultFront")}</p>
          <Segmented
            label={t("defaultFront")}
            value={settings.defaultFront}
            onChange={(v) => update({ defaultFront: v })}
            options={[
              { value: "term", label: tc("term") },
              { value: "definition", label: tc("definition") },
            ]}
          />
        </div>
        <Switch label={t("defaultTts")} checked={settings.defaultTts} onChange={(v) => update({ defaultTts: v })} />
        <div className="py-3.5">
          <p className="mb-2 font-medium">{t("dailyGoal")}</p>
          <Segmented
            label={t("dailyGoal")}
            value={String(settings.dailyGoal)}
            onChange={(v) => update({ dailyGoal: Number(v) })}
            options={["10", "20", "30", "50", "100"].map((v) => ({ value: v, label: v }))}
          />
          <p className="mt-2 text-sm text-muted">{t("dailyGoalHint")}</p>
        </div>
        <div className="py-3.5">
          <p className="mb-2 font-medium">{t("newPerSession")}</p>
          <Segmented
            label={t("newPerSession")}
            value={String(settings.newPerSession)}
            onChange={(v) => update({ newPerSession: Number(v) })}
            options={["5", "10", "20", "30"].map((v) => ({ value: v, label: v }))}
          />
          <p className="mt-2 text-sm text-muted">{t("newPerSessionHint")}</p>
        </div>
      </Section>

      <NotificationSettings />

      <Section title={t("app")} id="s-app">
        {install.isStandalone ? (
          <p className="py-3.5 text-muted">{ti("installed")}</p>
        ) : (
          <Row
            icon={<Download className="size-5 text-muted" aria-hidden />}
            onClick={async () => {
              if (install.canPrompt) await install.promptInstall();
              else setSheet("install");
            }}
          >
            {t("install")}
          </Row>
        )}
        <Link href="/settings/privacy" className="flex items-center gap-3 py-3.5 font-medium">
          <ShieldCheck className="size-5 text-muted" aria-hidden />
          <span className="flex-1">{t("privacy")}</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      </Section>

      <AppVersion label={t("version")} />

      {viewer.kind === "user" ? (
        <>
          <AvatarSheet open={sheet === "avatar"} onClose={() => setSheet(null)} />
          <PasswordSheet open={sheet === "password"} onClose={() => setSheet(null)} />
          <DeleteAccountSheet open={sheet === "delete"} onClose={() => setSheet(null)} />
        </>
      ) : null}
      <Sheet open={sheet === "install"} onClose={() => setSheet(null)} title={install.isIos ? ti("iosTitle") : ti("title")}>
        <p className="flex gap-2">
          {install.isIos ? <Share className="mt-0.5 size-5 shrink-0" aria-hidden /> : null}
          {install.isIos ? ti("iosText") : ti("notAvailable")}
        </p>
      </Sheet>
      <ConfirmDialog
        open={Boolean(removeGroup)}
        title={tg("remove")}
        text={removeGroup ? tg("removeConfirm", { name: removeGroup.name }) : ""}
        confirmLabel={tg("remove")}
        cancelLabel={tc("cancel")}
        danger
        onCancel={() => setRemoveGroup(null)}
        onConfirm={async () => {
          const g = removeGroup;
          setRemoveGroup(null);
          if (!g) return;
          await api(`/api/groups/${g.id}/lock`, { method: "POST", body: {} }).catch(() => {});
          toast(t("groupRemoved"), "success");
          router.refresh();
        }}
      />
    </div>
  );
}

function AddGroupForm({ groups, onDone }: { groups: Group[]; onDone: () => void }) {
  const t = useTranslations("settings");
  const tg = useTranslations("groups");
  const tc = useTranslations("common");
  const toast = useToast();
  const [groupId, setGroupId] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!groupId) return;
        setErr(null);
        setBusy(true);
        try {
          await api(`/api/groups/${groupId}/unlock`, { method: "POST", body: { password } });
          toast(t("groupAdded"), "success");
          setPassword("");
          setGroupId("");
          onDone();
        } catch (e) {
          if (e instanceof ApiClientError && e.code === "wrong_password") setErr(tg("wrongPassword"));
          else if (e instanceof ApiClientError && e.code === "too_many") setErr(tc("tooMany", { minutes: Math.ceil(Number(e.data.retryAfter ?? 60) / 60) }));
          else setErr(tc("error"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-semibold">{t("addGroup")}</p>
      <p className="-mt-2 text-sm text-muted">{t("addGroupHint")}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-group" className="text-sm font-semibold">
          {t("selectGroup")}
        </label>
        <select id="add-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-12 rounded-xl border-2 border-border bg-surface px-3" required>
          <option value="">{t("selectGroupPlaceholder")}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <PasswordField label={tg("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required error={err ?? undefined} />
      <Button type="submit" loading={busy} disabled={!groupId || !password}>
        {t("add")}
      </Button>
    </form>
  );
}

function AvatarSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("settings");
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const done = () => {
    toast(t("pictureSaved"), "success");
    window.location.reload();
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("profilePicture")}>
      <div className="flex flex-col gap-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={t("uploadPicture")}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) return toast(t("pictureTooLarge"), "error");
            if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast(t("pictureBadType"), "error");
            const fd = new FormData();
            fd.append("file", f);
            setBusy(true);
            try {
              await api("/api/me/avatar", { method: "POST", form: fd });
              done();
            } catch (err) {
              setBusy(false);
              toast(err instanceof ApiClientError && err.code === "too_large" ? t("pictureTooLarge") : t("pictureBadType"), "error");
            }
          }}
        />
        <Button onClick={() => fileRef.current?.click()} loading={busy}>
          <ImageUp className="size-4" aria-hidden /> {t("uploadPicture")}
        </Button>
        <p className="text-sm text-muted">{t("uploadHint")}</p>
        <p className="font-semibold">{t("chooseAvatar")}</p>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={async () => {
                try {
                  await api("/api/me/avatar", { method: "PUT", body: { preset: p } });
                  done();
                } catch {
                  toast("Hiba", "error");
                }
              }}
              className="rounded-full ring-primary transition-transform hover:scale-105 focus-visible:ring-2"
              aria-label={`${t("chooseAvatar")} ${p.slice(1)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/avatars/${p}.svg`} alt="" width={64} height={64} className="size-full rounded-full" />
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          className="text-danger"
          onClick={async () => {
            await api("/api/me/avatar", { method: "PUT", body: { preset: null } }).catch(() => {});
            done();
          }}
        >
          {t("removePicture")}
        </Button>
      </div>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={t("changePassword")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (next.length < 8) return setErr(ta("passwordTooShort"));
          if (next !== again) return setErr(ta("passwordMismatch"));
          setBusy(true);
          try {
            await api("/api/me/password", { method: "POST", body: { currentPassword: cur, newPassword: next } });
            toast(t("passwordChanged"), "success");
            setCur("");
            setNext("");
            setAgain("");
            onClose();
          } catch (e) {
            if (e instanceof ApiClientError && e.code === "wrong_password") setErr(t("wrongCurrentPassword"));
            else if (e instanceof ApiClientError && e.code === "too_many") setErr(tc("tooMany", { minutes: Math.ceil(Number(e.data.retryAfter ?? 60) / 60) }));
            else setErr(tc("error"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordField label={t("currentPassword")} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
        <PasswordField label={t("newPassword")} hint={ta("passwordHint")} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        <PasswordField label={t("newPasswordAgain")} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
        {err ? (
          <p role="alert" className="font-medium text-danger">
            {err}
          </p>
        ) : null}
        <Button type="submit" loading={busy}>
          {tc("save")}
        </Button>
      </form>
    </Sheet>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={t("deleteAccount")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            await api("/api/me/account", { method: "DELETE", body: { password: pw } });
            window.location.href = "/";
          } catch (e) {
            setBusy(false);
            if (e instanceof ApiClientError && e.code === "wrong_password") setErr(t("wrongCurrentPassword"));
            else setErr(tc("error"));
          }
        }}
      >
        <p className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{t("deleteAccountText")}</p>
        <PasswordField label={t("deleteAccountConfirm")} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required error={err ?? undefined} />
        <Button type="submit" variant="danger" loading={busy} disabled={!pw}>
          {t("deleteAccountButton")}
        </Button>
      </form>
    </Sheet>
  );
}

/** Az éppen futó build verziója (a buildbe égetve, így mindig a ténylegesen futó kódot mutatja). */
function AppVersion({ label }: { label: string }) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const commit = process.env.NEXT_PUBLIC_COMMIT || "";
  const built = process.env.NEXT_PUBLIC_BUILD_TIME || "";
  const stamp = built ? `${built.slice(0, 10)} ${built.slice(11, 16)} UTC` : "";
  const details = [commit, stamp].filter(Boolean).join(" · ");
  return (
    <p data-testid="app-version" data-build={process.env.NEXT_PUBLIC_BUILD_ID} className="mt-10 border-t border-border pb-2 pt-4 text-center text-xs tabular-nums text-muted">
      {label}: {version}
      {details ? <span className="block opacity-80">{details}</span> : null}
    </p>
  );
}
