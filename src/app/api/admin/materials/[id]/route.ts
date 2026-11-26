import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { materialUpdateSchema } from "@/lib/server/admin-schemas";
import { saveMaterial } from "@/lib/server/material-save";

type Ctx = { params: Promise<{ id: string }> };

async function materialId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
}

/** A készlet teljes mentése: adatok + kártyalista. Felhasználók saját készleteihez az admin nem nyúl. */
export const PUT = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const id = await materialId(ctx);
  const input = await parseJson(req, materialUpdateSchema);
  const cards = await saveMaterial(id, input, { kind: "admin" });
  return json({ ok: true, cards });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const id = await materialId(ctx);
  const res = await db
    .delete(schema.materials)
    .where(and(eq(schema.materials.id, id), isNull(schema.materials.ownerUserId)))
    .returning({ id: schema.materials.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
