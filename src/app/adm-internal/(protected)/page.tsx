import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { ChevronRight, Lock, Globe } from "lucide-react";
import { db, schema } from "@/lib/db";
import { adminBase } from "@/lib/server/env";
import { NewGroupForm, NewSetForm } from "@/components/admin/admin-forms";

export default async function AdminHome() {
  const base = adminBase();
  const groups = await db
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
      sets: sql<number>`(select count(*)::int from ${schema.materials} m where m.group_id = "groups"."id")`,
      members: sql<number>`(select count(*)::int from ${schema.userGroupAccess} a where a.group_id = "groups"."id" and a.access_version = "groups"."access_version")`,
    })
    .from(schema.groups)
    .orderBy(asc(schema.groups.sortOrder), asc(schema.groups.name));
  const materials = await db
    .select({
      id: schema.materials.id,
      title: schema.materials.title,
      groupId: schema.materials.groupId,
      cardCount: count(schema.cards.id),
    })
    .from(schema.materials)
    .leftJoin(schema.cards, eq(schema.cards.materialId, schema.materials.id))
    .groupBy(schema.materials.id)
    .orderBy(asc(schema.materials.title));
  const publicSets = materials.filter((m) => m.groupId === null);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-4 text-2xl font-extrabold">Csoportok</h1>
        <div className="mb-4 rounded-2xl bg-surface p-5 shadow-card">
          <h2 className="mb-3 font-bold">Új csoport</h2>
          <NewGroupForm />
        </div>
        {groups.length === 0 ? <p className="text-muted">Még nincs csoport.</p> : null}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`${base}/groups/${g.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card hover:bg-surface-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Lock className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.name}</span>
                  <span className="text-sm text-muted">
                    {g.sets} készlet · {g.members} felhasználó
                  </span>
                </span>
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-extrabold">Készletek</h2>
        <div className="mb-4 rounded-2xl bg-surface p-5 shadow-card">
          <NewSetForm groups={groups.map((g) => ({ id: g.id, name: g.name }))} base={base} />
        </div>
        <SetList title="Nyilvános" icon={<Globe className="size-4" aria-hidden />} items={publicSets} base={base} />
        {groups.map((g) => (
          <SetList
            key={g.id}
            title={g.name}
            icon={<Lock className="size-4" aria-hidden />}
            items={materials.filter((m) => m.groupId === g.id)}
            base={base}
          />
        ))}
      </section>
    </div>
  );
}

function SetList({ title, icon, items, base }: { title: string; icon: React.ReactNode; items: { id: string; title: string; cardCount: number }[]; base: string }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
        {icon} {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nincs készlet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
          {items.map((m) => (
            <li key={m.id}>
              <Link href={`${base}/sets/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="truncate font-semibold">{m.title}</span>
                <span className="shrink-0 text-sm text-muted">{m.cardCount} kártya</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
