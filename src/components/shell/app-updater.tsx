"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { BUILD_ID, hasHardBlocker, isEditingSomething, isStudyPath, mayReload, onBlockersChanged } from "@/lib/client/app-update";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RELOAD_GUARD_KEY = "flashly_update_reload";

/**
 * Regisztrálja a service workert, rendszeresen keresi az új verziót, és ha az új verzió
 * átvette az irányítást, a megfelelő pillanatban (adatvesztés nélkül) újratölti az appot.
 */
export function AppUpdater() {
  const pathname = usePathname();
  const pending = useRef(false);
  const tryReloadRef = useRef<(reason: "navigation" | "hidden" | "idle") => void>(() => {});
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    let reloading = false;
    let registration: ServiceWorkerRegistration | null = null;

    const reload = () => {
      if (reloading) return;
      // Végtelen újratöltés elleni védelem: ugyanarra a verzióra percenként legfeljebb egyszer.
      try {
        const prev = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || "null") as { from: string; at: number } | null;
        if (prev && prev.from === BUILD_ID && Date.now() - prev.at < 60_000) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ from: BUILD_ID, at: Date.now() }));
      } catch {
        /* privát mód: nincs sessionStorage */
      }
      reloading = true;
      window.location.reload();
    };

    const tryReload = (reason: "navigation" | "hidden" | "idle") => {
      if (!pending.current) return;
      const ok = mayReload(reason, {
        hardBlocked: hasHardBlocker(),
        editing: isEditingSomething(),
        studying: isStudyPath(window.location.pathname),
      });
      if (ok) reload();
    };
    tryReloadRef.current = tryReload;

    const markPending = () => {
      pending.current = true;
      tryReload(document.visibilityState === "hidden" ? "hidden" : "idle");
    };

    // Ha a szerveren már újabb build fut, frissítést kérünk a service workertől.
    const checkServerVersion = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (!buildId || buildId === BUILD_ID) return;
        if (registration) await registration.update().catch(() => {});
        // Service worker nélkül (vagy ha az nem tud frissülni) maga az oldal tölt újra.
        if (!registration) markPending();
      } catch {
        /* nincs net: majd legközelebb */
      }
    };

    const check = () => {
      if (document.visibilityState !== "visible") return;
      registration?.update().catch(() => {});
      void checkServerVersion();
    };

    let controlled = false;
    const onControllerChange = () => {
      // Az első telepítéskor (amikor még nem volt service worker) nem kell újratölteni.
      if (!controlled) {
        controlled = true;
        return;
      }
      markPending();
    };

    if ("serviceWorker" in navigator) {
      controlled = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
          // Ha a régi lap alatt már ott vár egy új verzió, azonnal aktiváljuk.
          reg.waiting?.postMessage("flashly:skip-waiting");
        })
        .catch(() => {
          /* ha nem sikerül, az app service worker nélkül is működik */
        });
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") tryReload("hidden");
      else check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const offBlockers = onBlockersChanged(() => tryReload("idle"));
    const firstCheck = window.setTimeout(check, 5000);

    return () => {
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
      window.clearTimeout(firstCheck);
      offBlockers();
    };
  }, []);

  // Oldalváltáskor (pl. a tanulásból vissza a készlethez) jöhet a várakozó frissítés.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    tryReloadRef.current("navigation");
  }, [pathname]);

  return null;
}
