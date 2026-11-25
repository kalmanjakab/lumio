import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { adminBase } from "@/lib/server/env";
import { GroupActions, NewSetForm } from "@/components/admin/admin-forms";

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
