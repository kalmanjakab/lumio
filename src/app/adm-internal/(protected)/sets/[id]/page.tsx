import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { adminBase } from "@/lib/server/env";
import { getGlobalThresholds } from "@/lib/server/app-settings";
import { SetEditor } from "@/components/admin/set-editor";

export default async function AdminSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const base = adminBase();
  const [m] = await db.select().from(schema.materials).where(eq(schema.materials.id, id));
  if (!m || m.ownerUserId) notFound();
  const [cards, groups, globalThresholds] = await Promise.all([
    db
      .select({ id: schema.cards.id, term: schema.cards.term, definition: schema.cards.definition, imageId: schema.cards.imageId })
      .from(schema.cards)
      .where(eq(schema.cards.materialId, id))
      .orderBy(asc(schema.cards.position)),
    db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).orderBy(asc(schema.groups.name)),
    getGlobalThresholds(),
  ]);
  return (
    <div>
      <Link href={m.groupId ? `${base}/groups/${m.groupId}` : base} className="text-sm font-semibold text-primary hover:underline">
        ← Vissza
      </Link>
      <div className="mt-2">
        <SetEditor
          variant={{ kind: "admin", base, groups, globalThresholds }}
          material={{
            id: m.id,
            title: m.title,
            description: m.description,
            groupId: m.groupId,
            termLang: m.termLang,
            definitionLang: m.definitionLang,
            gradeThresholds: m.gradeThresholds ?? null,
            cards,
          }}
        />
      </div>
    </div>
  );
}
