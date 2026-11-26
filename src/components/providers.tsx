"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/validation";
import { readLocal, setCookie, writeLocal } from "@/lib/client/storage";
import { api } from "@/lib/client/api";
import { ToastProvider, useToast } from "./toast";
import { useTranslations } from "next-intl";
import { configureActivity, onActivityEvent, recordActivity, retryPendingActivity, setActivityGoal } from "@/lib/client/activity";
import { takeOfflineActivity } from "@/lib/client/offline";
import type { StreakState } from "@/lib/streak";

export type LayoutActivity = { today: string; items: number; goal: number; goalMet: boolean; streak: StreakState } | null;

/** Napi cél és sorozat: beállítás, időzóna-frissítés, ünneplő üzenet a cél teljesítésekor. */
function ActivityBridge({ activity }: { activity: LayoutActivity }) {
  const { settings, update, viewer, hydrated } = useSettings();
  const toast = useToast();
  const t = useTranslations("streak");
  useEffect(() => {
    if (!hydrated) return;
    configureActivity({ kind: viewer.kind, goal: settings.dailyGoal, server: activity });
    if (viewer.kind === "user") retryPendingActivity();
    // Az offline tanulás mai eredménye most kerül jóváírásra.
    const offlineItems = takeOfflineActivity();
    if (offlineItems > 0) recordActivity(offlineItems);
    // A szerver időzónája kövesse az eszközét (a napváltáshoz és az értesítések időzítéséhez).
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (viewer.kind === "user" && tz && tz !== settings.timezone && tz.length <= 64) update({ timezone: tz });
    } catch {
      /* nincs teendő */
    }
    // Szándékosan csak a betöltéskor és a fiókváltáskor fut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, viewer.kind, activity]);
  useEffect(() => {
    setActivityGoal(settings.dailyGoal);
  }, [settings.dailyGoal]);
  useEffect(
    () =>
      onActivityEvent((e) => {
        if (!e.goalJustMet) return;
        toast(e.earnedFreeze ? t("goalMetFreeze", { days: e.streak }) : t("goalMet", { days: e.streak }), "success");
      }),
    [toast, t],
  );
  return null;
}

export type ClientViewer =
  | { kind: "guest" }
  | { kind: "user"; username: string; avatarUrl: string | null; mustChangePassword: boolean };

type SettingsCtx = {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  viewer: ClientViewer;
  hydrated: boolean;
};

const Ctx = createContext<SettingsCtx | null>(null);

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SettingsProvider hiányzik");
  return c;
}

function applyTheme(theme: UserSettings["theme"]) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
}

export function SettingsProvider({
  initial,
  viewer,
  children,
}: {
  initial: UserSettings;
  viewer: ClientViewer;
  children: ReactNode;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings>(initial);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<UserSettings>>({});

  // Vendégnél a böngészőben tárolt beállításokat töltjük be.
  useEffect(() => {
    if (viewer.kind === "guest") {
      const local = readLocal<Partial<UserSettings>>("settings", {});
      setSettings((s) => ({ ...s, ...local, theme: initial.theme, locale: initial.locale }));
    }
    setHydrated(true);
  }, [viewer.kind, initial.theme, initial.locale]);

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (patch.theme) {
          applyTheme(patch.theme);
          setCookie("flashly_theme", patch.theme);
        }
        if (viewer.kind === "guest") {
          const { theme: _t, locale: _l, ...rest } = next;
          writeLocal("settings", rest);
        }
        return next;
      });
      if (patch.locale) {
        setCookie("NEXT_LOCALE", patch.locale);
      }
      if (viewer.kind === "user") {
        pending.current = { ...pending.current, ...patch };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const immediate = Boolean(patch.locale);
        const flush = () => {
          const body = pending.current;
          pending.current = {};
          api("/api/me/settings", { method: "PATCH", body })
            .then(() => {
              if (body.locale) router.refresh();
            })
            .catch(() => {
              if (body.locale) router.refresh();
            });
        };
        if (immediate) flush();
        else saveTimer.current = setTimeout(flush, 500);
      } else if (patch.locale) {
        router.refresh();
      }
    },
    [viewer.kind, router],
  );

  const value = useMemo(() => ({ settings, update, viewer, hydrated }), [settings, update, viewer, hydrated]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------- Telepítés (PWA) ----------

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type InstallCtx = {
  canPrompt: boolean;
  isIos: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<boolean>;
};
const InstallContext = createContext<InstallCtx>({ canPrompt: false, isIos: false, isStandalone: false, promptInstall: async () => false });

export function useInstall() {
  return useContext(InstallContext);
}

function InstallProvider({ children }: { children: ReactNode }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(ios);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvt(null);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!evt) return false;
    await evt.prompt();
    const choice = await evt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setEvt(null);
    return choice.outcome === "accepted";
  }, [evt]);

  const value = useMemo(() => ({ canPrompt: Boolean(evt), isIos, isStandalone, promptInstall }), [evt, isIos, isStandalone, promptInstall]);
  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function AppProviders({
  initialSettings,
  viewer,
  activity = null,
  children,
}: {
  initialSettings: UserSettings;
  viewer: ClientViewer;
  activity?: LayoutActivity;
  children: ReactNode;
}) {
  return (
    <SettingsProvider initial={initialSettings ?? DEFAULT_USER_SETTINGS} viewer={viewer}>
      <InstallProvider>
        <ToastProvider>
          <ActivityBridge activity={activity} />
          {children}
        </ToastProvider>
      </InstallProvider>
    </SettingsProvider>
  );
}
