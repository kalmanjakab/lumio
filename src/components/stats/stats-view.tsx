"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Flame, ShieldCheck, Trophy } from "lucide-react";
import type { SetStat } from "@/lib/server/review";
import { readGuestHistory, useActivity } from "@/lib/client/activity";
import { readGuestProgress, readGuestSrsAll } from "@/lib/client/study-store";
import { cardLevel, isDue } from "@/lib/srs";
import { addDays, dayDiff, visibleStreak } from "@/lib/streak";
import { useSettings } from "../providers";
import { EmptyState, Segmented } from "../ui";
import { LevelBar } from "../set/level-bar";
import { Heatmap, type HeatDay } from "./heatmap";

type History = { today: string; days: (HeatDay & { reviews: number })[] };
const GOALS = [10, 20, 30, 50, 100] as const;

export function StatsView({
  serverHistory,
  serverSets,
  materials,
}: {
  serverHistory: History | null;
  serverSets: SetStat[] | null;
  materials: { id: string; title: string; cardCount: number }[] | null;
}) {
  const t = useTranslations("stats");
  const ts = useTranslations("streak");
  const { settings, update } = useSettings();
  const a = useActivity();
  const [history, setHistory] = useState<History | null>(serverHistory);
  const [sets, setSets] = useState<SetStat[] | null>(serverSets);

  useEffect(() => {
    if (serverHistory) return;
    setHistory(readGuestHistory());
    // Vendég: készletenkénti szintek a böngészőben tárolt adatokból.
    const srsAll = readGuestSrsAll();
    const now = Date.now();
    const out: SetStat[] = [];
    for (const m of materials ?? []) {
      const srs = srsAll[m.id] ?? {};
      const prog = readGuestProgress(m.id);
      const ids = new Set([...Object.keys(srs), ...Object.keys(prog)]);
      if (!ids.size) continue;
      const c = [0, 0, 0, 0];
      let due = 0;
      for (const id of ids) {
        c[cardLevel(srs[id], prog[id])]!++;
        if (isDue(srs[id], now)) due++;
      }
      const studied = c[1]! + c[2]! + c[3]!;
      out.push({ materialId: m.id, title: m.title, total: m.cardCount, newCount: Math.max(0, m.cardCount - studied), learning: c[1]!, known: c[2]!, mastered: c[3]!, due });
    }
    setSets(out);
  }, [serverHistory, materials]);

  // A mai nap a friss (kliens oldali) számlálóból, hogy azonnal látszódjon.
  const days = useMemo(() => {
    if (!history) return [];
    const list = history.days.filter((d) => d.day !== a.today);
    if (a.ready && a.today) list.push({ day: a.today, items: a.items, reviews: 0, goalMet: a.goalMet, frozen: false });
    return list;
  }, [history, a]);

  const totals = useMemo(() => {
    const today = a.today || history?.today || "";
    const last7 = days.filter((d) => today && dayDiff(d.day, today) >= 0 && dayDiff(d.day, today) < 7);
    const all = days.reduce((s, d) => s + d.items, 0);
    return { week: last7.reduce((s, d) => s + d.items, 0), activeWeek: last7.filter((d) => d.items > 0).length, all, activeDays: days.filter((d) => d.items > 0).length };
  }, [days, a.today, history]);

  const sum = useMemo(
    () => (sets ?? []).reduce((s, x) => ({ newCount: s.newCount + x.newCount, learning: s.learning + x.learning, known: s.known + x.known, mastered: s.mastered + x.mastered }), { newCount: 0, learning: 0, known: 0, mastered: 0 }),
    [sets],
  );
  const dueTotal = (sets ?? []).reduce((s, x) => s + x.due, 0);
  const v = visibleStreak(a.streak, a.today || addDays("2000-01-01", 0));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>

      <section aria-label={t("summary")}>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile icon={<Flame className="size-6" aria-hidden />} tone="text-accent" value={v.current} label={t("currentStreak")} />
        <Tile icon={<Trophy className="size-6" aria-hidden />} tone="text-primary" value={Math.max(a.streak.longest, v.current)} label={t("longestStreak")} />
        <Tile icon={<ShieldCheck className="size-6" aria-hidden />} tone="text-known" value={a.streak.freezes} label={t("freezes")} />
        </div>
        <p className="mt-2 px-1 text-xs text-muted">{ts("freezesHint")}</p>
      </section>

      <section className="rounded-2xl bg-surface p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t("dailyGoal")}</h2>
          <Segmented
            label={t("dailyGoal")}
            value={String(settings.dailyGoal)}
            onChange={(val) => update({ dailyGoal: Number(val) })}
            options={GOALS.map((g) => ({ value: String(g), label: String(g) }))}
          />
        </div>
        <p className="mb-4 text-sm text-muted">{t("dailyGoalHint")}</p>
        {history ? <Heatmap today={a.today || history.today} days={days} goal={settings.dailyGoal} /> : null}
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label={t("thisWeek")} value={totals.week} />
          <Stat label={t("activeDaysWeek")} value={`${totals.activeWeek} / 7`} />
          <Stat label={t("totalAnswered")} value={totals.all} />
          <Stat label={t("activeDays")} value={totals.activeDays} />
        </dl>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t("allCards")}</h2>
          {dueTotal > 0 ? (
            <Link href="/review" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary">
              <CalendarClock className="size-4" aria-hidden /> {ts("reviewDue", { count: dueTotal })}
            </Link>
          ) : null}
        </div>
        {sets === null ? null : sets.length === 0 ? (
          <EmptyState>{t("noSets")}</EmptyState>
        ) : (
          <>
            <div className="mb-5 rounded-2xl bg-surface p-5 shadow-card">
              <LevelBar counts={sum} />
            </div>
            <ul className="flex flex-col gap-2">
              {sets.map((s) => (
                <li key={s.materialId}>
                  <Link href={`/sets/${s.materialId}`} className="block rounded-2xl bg-surface p-4 shadow-card hover:bg-surface-2">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate font-semibold">{s.title}</span>
                      <span className="shrink-0 text-sm text-muted">
                        {t("knownOf", { known: s.known + s.mastered, total: s.total })}
                        {s.due ? ` · ${t("dueShort", { count: s.due })}` : ""}
                      </span>
                    </div>
                    <LevelBar counts={s} legend={false} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Tile({ icon, value, label, tone }: { icon: React.ReactNode; value: number | string; label: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-3 shadow-card sm:p-4">
      <div className={`mb-1 ${tone}`}>{icon}</div>
      <div className="text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</div>
      <div className="text-xs font-semibold leading-tight text-muted sm:text-sm">{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
