"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff, Share } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import type { UserSettings } from "@/lib/validation";
import { useInstall, useSettings } from "../providers";
import { useToast } from "../toast";
import { Button, Switch } from "../ui";

type PushState = "loading" | "unsupported" | "serverOff" | "denied" | "off" | "on";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iphone|ipad/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "macOS" : /windows/i.test(ua) ? "Windows" : /linux/i.test(ua) ? "Linux" : "";
  const br = /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ").slice(0, 80);
}

const TOGGLES = ["notifyStreak", "notifyDaily", "notifyNudge", "notifyWeekly", "notifyAssignments"] as const satisfies readonly (keyof UserSettings)[];

/** Értesítések: push feliratkozás ezen az eszközön, fajták ki-be, emlékeztető időpontja. */
export function NotificationSettings() {
  const t = useTranslations("notifSettings");
  const ts = useTranslations("settings");
  const { viewer, settings, update } = useSettings();
  const install = useInstall();
  const toast = useToast();
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    try {
      const info = await api<{ enabled: boolean }>("/api/me/push");
      if (!info.enabled) return setState("serverOff");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    if (viewer.kind === "user") void refresh();
  }, [viewer.kind, refresh]);

  if (viewer.kind !== "user") {
    return (
      <section aria-labelledby="notifications" className="mb-8 scroll-mt-20" id="notifications-wrap">
        <h2 id="notifications" className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-muted">
          {ts("notifications")}
        </h2>
        <div className="rounded-2xl bg-surface p-4 shadow-card">
          <p className="text-muted">{t("guest")}</p>
          <Link href="/login" className="mt-2 inline-block font-semibold text-primary">
            {t("login")}
          </Link>
        </div>
      </section>
    );
  }

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const info = await api<{ enabled: boolean; publicKey: string | null }>("/api/me/push");
      if (!info.enabled || !info.publicKey) return setState("serverOff");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(info.publicKey) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api("/api/me/push", { method: "POST", body: { action: "subscribe", subscription: { endpoint: j.endpoint, keys: j.keys }, label: deviceLabel() } });
      setState("on");
      toast(t("enabled"), "success");
    } catch (err) {
      toast(err instanceof ApiClientError && err.status === 429 ? t("tooMany") : t("enableFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/me/push", { method: "POST", body: { action: "unsubscribe", endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe().catch(() => false);
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await api("/api/me/push", { method: "POST", body: { action: "test" } });
      toast(t("testSent"), "success");
    } catch (err) {
      toast(err instanceof ApiClientError && err.status === 429 ? t("tooMany") : t("enableFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const needsInstall = install.isIos && !install.isStandalone;

  return (
    <section aria-labelledby="notifications" className="mb-8 scroll-mt-20" id="notifications-wrap">
      <h2 id="notifications" className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-muted">
        {ts("notifications")}
      </h2>
      <div className="divide-y divide-border rounded-2xl bg-surface px-4 shadow-card">
        <div className="py-4">
          <div className="flex items-start gap-3">
            {state === "on" ? <Bell className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> : <BellOff className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("pushTitle")}</p>
              <p className="text-sm text-muted">
                {state === "on"
                  ? t("pushOn")
                  : state === "denied"
                    ? t("pushDenied")
                    : state === "serverOff"
                      ? t("pushServerOff")
                      : state === "unsupported"
                        ? needsInstall
                          ? t("iosInstall")
                          : t("pushUnsupported")
                        : needsInstall
                          ? t("iosInstall")
                          : t("pushOff")}
              </p>
              {needsInstall && state !== "on" ? (
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <Share className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("iosSteps")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "off" ? (
              <Button size="sm" onClick={enable} loading={busy}>
                {t("enable")}
              </Button>
            ) : null}
            {state === "on" ? (
              <>
                <Button size="sm" variant="secondary" onClick={test} loading={busy}>
                  {t("test")}
                </Button>
                <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>
                  {t("disable")}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {TOGGLES.map((k) => (
          <Switch key={k} label={t(k)} description={t(`${k}Hint`)} checked={settings[k]} onChange={(v) => update({ [k]: v } as Partial<UserSettings>)} />
        ))}

        <div className="flex items-center justify-between gap-4 py-3.5">
          <label htmlFor="reminder-hour" className="font-medium">
            {t("reminderHour")}
          </label>
          <select
            id="reminder-hour"
            value={settings.reminderHour}
            disabled={!settings.notifyDaily}
            onChange={(e) => update({ reminderHour: Number(e.target.value) })}
            className="h-10 rounded-xl border border-border bg-surface-2 px-3 font-medium disabled:opacity-50"
          >
            {Array.from({ length: 15 }, (_, i) => i + 7).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <p className="py-3 text-sm text-muted">{t("quietHours")}</p>
      </div>
    </section>
  );
}
