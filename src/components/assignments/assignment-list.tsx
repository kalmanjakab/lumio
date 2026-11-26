import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ClipboardList } from "lucide-react";
import { listAssignmentsForUser } from "@/lib/server/assignments";
import { SectionTitle } from "../ui";

/** A tanuló feladatai (szerveren renderelve). Ha nincs feladat, semmit nem mutat. */
export async function AssignmentList({ userId, groupId, timeZone }: { userId: string; groupId?: string; timeZone: string }) {
  const list = await listAssignmentsForUser(userId, { groupId, includePastDays: 3 });
  if (!list.length) return null;
  const t = await getTranslations("assignments");
  const format = await getFormatter();
  const now = Date.now();
  return (
    <section aria-labelledby="assignments" className="mb-10">
      <SectionTitle id="assignments">{t("title")}</SectionTitle>
      <ul className="flex flex-col gap-2">
        {list.map((a) => {
          const due = new Date(a.dueAt);
          const overdue = due.getTime() < now;
          const done = a.percent >= 100;
          return (
            <li key={a.id}>
              <Link href={`/sets/${a.materialId}`} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card hover:bg-surface-2">
                <ClipboardList className={done ? "size-6 shrink-0 text-known" : "size-6 shrink-0 text-primary"} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.title}</p>
                  <p className={overdue && !done ? "text-sm text-danger" : "text-sm text-muted"}>
                    {groupId ? "" : `${a.groupName} · `}
                    {done ? t("done") : overdue ? t("overdue") : t("due", { date: format.dateTime(due, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone }) })}
                    {a.bestTest !== null ? ` · ${t("bestTest", { percent: a.bestTest })}` : ""}
                  </p>
                  {a.note ? <p className="truncate text-sm text-muted">{a.note}</p> : null}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.percent} aria-label={t("progress")}>
                      <div className={done ? "h-full bg-known" : "h-full bg-primary"} style={{ width: `${Math.min(100, a.percent)}%` }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums">{a.percent}%</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
