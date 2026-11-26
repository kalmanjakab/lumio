"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bell, Settings } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button, EmptyState, Spinner, cn } from "../ui";

type Item = { id: string; kind: string; params: Record<string, string | number>; url: string; createdAt: string; read: boolean };

const KINDS = new Set(["dailyReminder", "streakRisk", "nudge", "weekly", "assignmentNew", "assignmentDue", "milestone", "freezeUsed", "test"]);

export function NotificationList() {
  const t = useTranslations("notif");
  const ts = useTranslations("settings");
  const format = useFormatter();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    api<{ items: Item[] }>("/api/me/notifications")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  const markAll = async () => {
    await api("/api/me/notifications", { body: { all: true } }).catch(() => {});
    setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null);
    window.dispatchEvent(new Event("flashly:notifications-read"));
  };
  const markOne = (id: string) => {
    void api("/api/me/notifications", { body: { ids: [id] } })
      .then(() => window.dispatchEvent(new Event("flashly:notifications-read")))
      .catch(() => {});
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <div className="flex gap-2">
          {items?.some((x) => !x.read) ? (
            <Button variant="soft" size="sm" onClick={markAll}>
              {t("markAllRead")}
            </Button>
          ) : null}
          <Link href="/settings#notifications" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg">
            <Settings className="size-4" aria-hidden /> {ts("notifications")}
          </Link>
        </div>
      </div>
      {items === null ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell className="size-8" aria-hidden />}>{t("empty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
          {items
            .filter((x) => KINDS.has(x.kind))
            .map((x) => (
              <li key={x.id}>
                <Link href={x.url.startsWith("/") ? x.url : "/"} onClick={() => !x.read && markOne(x.id)} className={cn("flex gap-3 px-4 py-3 hover:bg-surface-2", !x.read && "bg-primary-soft/40")}>
                  <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", x.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t(`${x.kind}Title` as "testTitle", x.params)}</span>
                    <span className="block text-sm text-fg">{t(`${x.kind}Body` as "testBody", x.params)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{format.relativeTime(new Date(x.createdAt), new Date())}</span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
