import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { materialUpdateSchema, MAX_CARDS_PER_SET } from "@/lib/server/admin-schemas";
import { saveMaterial } from "@/lib/server/material-save";

type Ctx = { params: Promise<{ id: string }> };

// A saját készletnél nincs csoport és saját osztályzat-küszöb, a kártyák száma pedig legfeljebb 1000.
const ownUpdateSchema = materialUpdateSchema.extend({
  groupId: z.null().optional().transform(() => null),
  gradeThresholds: z.null().optional().transform(() => null),
  cards: materialUpdateSchema.shape.cards.max(Math.min(1000, MAX_CARDS_PER_SET)),
});

async function materialId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
}

export const PUT = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const id = await materialId(ctx);
  const input = await parseJson(req, ownUpdateSchema);
  const cards = await saveMaterial(id, input, { kind: "owner", userId: user.id });
  return json({ ok: true, cards });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const id = await materialId(ctx);
  const res = await db
    .delete(schema.materials)
    .where(and(eq(schema.materials.id, id), eq(schema.materials.ownerUserId, user.id)))
    .returning({ id: schema.materials.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
