import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { materialUpdateSchema } from "@/lib/server/admin-schemas";

type Ctx = { params: Promise<{ id: string }> };

async function materialId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
}

/** A készlet teljes mentése: adatok + kártyalista. A meglévő kártyák azonosítója megmarad (a haladás nem vész el). */
export const PUT = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const id = await materialId(ctx);
  const input = await parseJson(req, materialUpdateSchema);

  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: schema.materials.id }).from(schema.materials).where(eq(schema.materials.id, id)).for("update");
    if (!existing.length) throw new ApiError(404, "not_found");
    if (input.groupId) {
      const g = await tx.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.id, input.groupId));
      if (!g.length) throw new ApiError(400, "group_not_found");
    }
    await tx
      .update(schema.materials)
      .set({
        title: input.title,
        description: input.description,
        groupId: input.groupId,
        termLang: input.termLang,
        definitionLang: input.definitionLang,
        gradeThresholds: input.gradeThresholds,
        updatedAt: new Date(),
      })
      .where(eq(schema.materials.id, id));

    const ownIds = new Set(
      (await tx.select({ id: schema.cards.id }).from(schema.cards).where(eq(schema.cards.materialId, id))).map((r) => r.id),
    );
    const now = new Date();
    const rows = input.cards.map((c, i) => ({
      id: c.id && ownIds.has(c.id) ? c.id : randomUUID(),
      materialId: id,
      term: c.term,
      definition: c.definition,
      position: i,
      updatedAt: now,
    }));
    const keep = rows.map((r) => r.id);
    if (keep.length) {
      await tx.delete(schema.cards).where(and(eq(schema.cards.materialId, id), notInArray(schema.cards.id, keep)));
    } else {
      await tx.delete(schema.cards).where(eq(schema.cards.materialId, id));
    }
    for (let i = 0; i < rows.length; i += 400) {
      await tx
        .insert(schema.cards)
        .values(rows.slice(i, i + 400))
        .onConflictDoUpdate({
          target: schema.cards.id,
          set: {
            term: sql`excluded.term`,
            definition: sql`excluded.definition`,
            position: sql`excluded.position`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
  });
  const cards = await db
    .select({ id: schema.cards.id, term: schema.cards.term, definition: schema.cards.definition })
    .from(schema.cards)
    .where(eq(schema.cards.materialId, id))
    .orderBy(schema.cards.position);
  return json({ ok: true, cards });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const id = await materialId(ctx);
  const res = await db.delete(schema.materials).where(eq(schema.materials.id, id)).returning({ id: schema.materials.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
