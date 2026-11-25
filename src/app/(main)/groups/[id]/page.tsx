import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { canAccessGroup } from "@/lib/server/auth";
import { listAccessibleMaterials } from "@/lib/server/data";
import { UnlockForm, RemoveGroupButton } from "@/components/groups/unlock-form";
import { MaterialRow } from "@/components/material-row";
import { EmptyState } from "@/components/ui";

async function loadGroup(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [g] = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, id)).orderBy(asc(schema.groups.name));
  return g ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const g = await loadGroup((await params).id);
  return { title: g?.name ?? "Flashly" };
}

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ next?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("groups");
  const tc = await getTranslations("common");
  const group = await loadGroup(id);
  if (!group) notFound();
  const next = typeof sp.next === "string" && /^\/sets\/[0-9a-f-]{36}(\/[a-z]+)?$/.test(sp.next) ? sp.next : undefined;

  if (!(await canAccessGroup(group.id))) {
    return (
      <div className="py-6">
        <UnlockForm groupId={group.id} groupName={group.name} next={next} />
      </div>
    );
  }
  const materials = (await listAccessibleMaterials()).filter((m) => m.groupId === group.id);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{tc("materials", { count: materials.length })}</p>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{group.name}</h1>
        </div>
        <RemoveGroupButton groupId={group.id} groupName={group.name} redirectTo="/groups" />
      </div>
      {materials.length === 0 ? (
        <EmptyState>{t("noMaterials")}</EmptyState>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {materials.map((m) => (
            <li key={m.id}>
              <MaterialRow href={`/sets/${m.id}`} title={m.title} meta={tc("cards", { count: m.cardCount })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
