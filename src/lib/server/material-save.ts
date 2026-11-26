import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError } from "./http";
import type { z } from "zod";
import type { materialUpdateSchema } from "./admin-schemas";

type Input = z.infer<typeof materialUpdateSchema>;
type Scope = { kind: "admin" } | { kind: "owner"; userId: string };

/**
 * Egy készlet teljes mentése (adatok + kártyalista). Az adminnál és a saját készleteknél is ez fut.
 * A meglévő kártyák azonosítója megmarad, így a haladás nem vész el.
 * A kártyák képe csak a készlethez feltöltött kép lehet; a már nem használt képeket törli.
 */
export async function saveMaterial(id: string, input: Input, scope: Scope) {
  await db.transaction(async (tx) => {
    const ownerWhere = scope.kind === "admin" ? isNull(schema.materials.ownerUserId) : eq(schema.materials.ownerUserId, scope.userId);
    const existing = await tx
      .select({ id: schema.materials.id })
      .from(schema.materials)
      .where(and(eq(schema.materials.id, id), ownerWhere))
      .for("update");
    if (!existing.length) throw new ApiError(404, "not_found");
    let groupId: string | null = null;
    if (scope.kind === "admin" && input.groupId) {
      const g = await tx.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.id, input.groupId));
      if (!g.length) throw new ApiError(400, "group_not_found");
      groupId = input.groupId;
    }
    await tx
      .update(schema.materials)
      .set({
        title: input.title,
        description: input.description,
        groupId,
        termLang: input.termLang,
        definitionLang: input.definitionLang,
        gradeThresholds: scope.kind === "admin" ? input.gradeThresholds : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.materials.id, id));

    const ownIds = new Set((await tx.select({ id: schema.cards.id }).from(schema.cards).where(eq(schema.cards.materialId, id))).map((r) => r.id));
    const wantedImages = [...new Set(input.cards.map((c) => c.imageId).filter((x): x is string => Boolean(x)))];
    const validImages = new Set(
      wantedImages.length
        ? (
            await tx
              .select({ id: schema.cardImages.id })
              .from(schema.cardImages)
              .where(and(eq(schema.cardImages.materialId, id), inArray(schema.cardImages.id, wantedImages)))
          ).map((r) => r.id)
        : [],
    );
    const now = new Date();
    const rows = input.cards.map((c, i) => ({
      id: c.id && ownIds.has(c.id) ? c.id : randomUUID(),
      materialId: id,
      term: c.term,
      definition: c.definition,
      imageId: c.imageId && validImages.has(c.imageId) ? c.imageId : null,
      position: i,
      updatedAt: now,
    }));
    const keep = rows.map((r) => r.id);
    if (keep.length) await tx.delete(schema.cards).where(and(eq(schema.cards.materialId, id), notInArray(schema.cards.id, keep)));
    else await tx.delete(schema.cards).where(eq(schema.cards.materialId, id));
    for (let i = 0; i < rows.length; i += 400) {
      await tx
        .insert(schema.cards)
        .values(rows.slice(i, i + 400))
        .onConflictDoUpdate({
          target: schema.cards.id,
          set: {
            term: sql`excluded.term`,
            definition: sql`excluded.definition`,
            imageId: sql`excluded.image_id`,
            position: sql`excluded.position`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    // Árva képek takarítása (feltöltötték, de végül egyik kártyán sincs). Az elmúlt órában
    // feltöltötteket meghagyjuk, mert egy másik, még nem mentett szerkesztőlap használhatja őket.
    await tx.execute(sql`
      delete from card_images i
      where i.material_id = ${id}
        and i.created_at < now() - interval '1 hour'
        and not exists (select 1 from cards c where c.image_id = i.id)
    `);
  });
  return db
    .select({ id: schema.cards.id, term: schema.cards.term, definition: schema.cards.definition, imageId: schema.cards.imageId })
    .from(schema.cards)
    .where(eq(schema.cards.materialId, id))
    .orderBy(schema.cards.position);
}

export const MAX_OWN_SETS = 200;

/** Egy készlet másolása a felhasználó saját könyvtárába (kártyákkal és képekkel). */
export async function copyMaterialToUser(sourceId: string, userId: string, title: string) {
  return db.transaction(async (tx) => {
    const [src] = await tx.select().from(schema.materials).where(eq(schema.materials.id, sourceId));
    if (!src) throw new ApiError(404, "not_found");
    const [row] = await tx
      .insert(schema.materials)
      .values({
        title,
        description: src.description,
        termLang: src.termLang,
        definitionLang: src.definitionLang,
        ownerUserId: userId,
        sourceMaterialId: src.id,
        type: "flashcards",
      })
      .returning({ id: schema.materials.id });
    const newId = row!.id;
    // A képek új azonosítót kapnak, hogy a másolat független legyen az eredetitől. Egyetlen utasítás,
    // így az idegen kulcsok ellenőrzése az utasítás végén, a képek beszúrása után történik.
    await tx.execute(sql`
      with m as (
        select i.id as old_id, gen_random_uuid() as new_id from card_images i
        where i.material_id = ${sourceId} and exists (select 1 from cards c where c.material_id = ${sourceId} and c.image_id = i.id)
      ),
      ins as (
        insert into card_images (id, material_id, image, width, height)
        select m.new_id, ${newId}, i.image, i.width, i.height from m join card_images i on i.id = m.old_id
      )
      insert into cards (material_id, term, definition, image_id, position)
      select ${newId}, c.term, c.definition, m.new_id, c.position
      from cards c left join m on m.old_id = c.image_id
      where c.material_id = ${sourceId}
    `);
    return newId;
  });
}
