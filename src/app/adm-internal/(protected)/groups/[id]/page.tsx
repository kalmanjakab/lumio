import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { adminBase } from "@/lib/server/env";
import { GroupActions, NewSetForm } from "@/components/admin/admin-forms";
import { DeleteAssignmentButton, NewAssignmentForm } from "@/components/admin/assignments-admin";
import { assignmentOverview, groupMembers, listAssignmentsForGroup } from "@/lib/server/assignments";

const fmt = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });
const fmtDay = new Intl.DateTimeFormat("hu-HU", { month: "short", day: "numeric", timeZone: "Europe/Budapest" });

export default async function AdminGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const base = adminBase();
  const [group] = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, id));
  if (!group) notFound();
  const sets = await db
    .select({ id: schema.materials.id, title: schema.materials.title, cardCount: count(schema.cards.id) })
    .from(schema.materials)
    .leftJoin(schema.cards, eq(schema.cards.materialId, schema.materials.id))
    .where(eq(schema.materials.groupId, id))
    .groupBy(schema.materials.id)
    .orderBy(asc(schema.materials.title));
  const allGroups = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).orderBy(asc(schema.groups.name));
  const publicSets = await db
    .select({ id: schema.materials.id, title: schema.materials.title })
    .from(schema.materials)
    .where(and(isNull(schema.materials.groupId), isNull(schema.materials.ownerUserId)))
    .orderBy(asc(schema.materials.title));
  const [assignments, members] = await Promise.all([listAssignmentsForGroup(id), groupMembers(id)]);
  const overviews = await Promise.all(assignments.map((a) => assignmentOverview(a)));
  const now = Date.now();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={base} className="text-sm font-semibold text-primary hover:underline">
          ← Vissza
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold">{group.name}</h1>
      </div>
      <GroupActions id={group.id} name={group.name} base={base} />
      <section>
        <h2 className="mb-1 text-xl font-bold">Feladatok</h2>
        <p className="mb-3 text-sm text-muted">
          Tagok (akiknek érvényes hozzáférésük van): {members.length}. A haladás az „ismert” kártyák aránya (ismétlésben megtanult, vagy a Tanulás módban legalább ismert szint).
        </p>
        <div className="mb-4 rounded-2xl bg-surface p-5 shadow-card">
          <NewAssignmentForm
            groupId={group.id}
            sets={[...sets.map((s) => ({ id: s.id, title: s.title, scope: "group" as const })), ...publicSets.map((s) => ({ id: s.id, title: s.title, scope: "public" as const }))]}
          />
        </div>
        {assignments.length === 0 ? (
          <p className="text-muted">Még nincs feladat.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {assignments.map((a, i) => {
              const rows = overviews[i]!;
              const done = rows.filter((r) => r.percent >= 100).length;
              const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : 0;
              const overdue = new Date(a.dueAt).getTime() < now;
              return (
                <li key={a.id} className="rounded-2xl bg-surface shadow-card">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{a.title}</p>
                        <p className={overdue ? "text-sm text-danger" : "text-sm text-muted"}>
                          Határidő: {fmt.format(new Date(a.dueAt))} · {a.cardCount} kártya · kész: {done}/{rows.length} · átlag: {avg}%
                        </p>
                        {a.note ? <p className="text-sm text-muted">{a.note}</p> : null}
                      </div>
                      <DeleteAssignmentButton groupId={group.id} id={a.id} title={a.title} />
                    </summary>
                    {rows.length === 0 ? (
                      <p className="px-4 pb-4 text-sm text-muted">Még senki nem nyitotta meg ezt a csoportot.</p>
                    ) : (
                      <div className="overflow-x-auto px-4 pb-4">
                        <table className="w-full min-w-[480px] text-left text-sm">
                          <thead className="text-muted">
                            <tr>
                              <th className="py-2 font-semibold">Tanuló</th>
                              <th className="py-2 font-semibold">Haladás</th>
                              <th className="py-2 font-semibold">Tanult</th>
                              <th className="py-2 font-semibold">Legjobb teszt</th>
                              <th className="py-2 font-semibold">Utoljára</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {rows.map((r) => (
                              <tr key={r.userId}>
                                <td className="py-2 font-medium">{r.username}</td>
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2">
                                      <div className={r.percent >= 100 ? "h-full bg-known" : "h-full bg-primary"} style={{ width: `${Math.min(100, r.percent)}%` }} />
                                    </div>
                                    <span className="tabular-nums">{r.percent}%</span>
                                  </div>
                                </td>
                                <td className="py-2 tabular-nums">
                                  {r.studied}/{r.total}
                                </td>
                                <td className="py-2 tabular-nums">{r.bestTest === null ? "–" : `${r.bestTest}%`}</td>
                                <td className="py-2 text-muted">{r.lastActive ? fmtDay.format(new Date(r.lastActive)) : "–"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Készletek ebben a csoportban</h2>
        <div className="mb-4 rounded-2xl bg-surface p-5 shadow-card">
          <NewSetForm groups={allGroups} base={base} defaultGroupId={group.id} />
        </div>
        {sets.length === 0 ? (
          <p className="text-muted">Még nincs készlet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
            {sets.map((m) => (
              <li key={m.id}>
                <Link href={`${base}/sets/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="truncate font-semibold">{m.title}</span>
                  <span className="text-sm text-muted">{m.cardCount} kártya</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
