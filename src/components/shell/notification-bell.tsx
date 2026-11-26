"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { api } from "@/lib/client/api";

/** Harang ikon az olvasatlan értesítések számával. Pár percenként és előtérbe kerüléskor frissül. */
export function NotificationBell() {
  const t = useTranslations("notif");
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ unread: number }>("/api/me/notifications?count=1")
        .then((r) => alive && setUnread(r.unread))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 180_000);
    const onVis = () => load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("flashly:notifications-read", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("flashly:notifications-read", onVis);
    };
  }, [pathname]);
  const label = unread ? `${t("open")} (${t("unread", { count: unread })})` : t("open");
  return (
    <Link href="/notifications" aria-label={label} title={label} className="relative flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
      <Bell className="size-6" aria-hidden />
      {unread ? (
        <span className="absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[0.7rem] font-bold leading-5 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
