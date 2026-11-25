import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { groupNameSchema } from "@/lib/server/admin-schemas";

type Ctx = { params: Promise<{ id: string }> };

async function groupId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
}

export const PATCH = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const id = await groupId(ctx);
  const { name, sortOrder } = await parseJson(req, z.object({ name: groupNameSchema.optional(), sortOrder: z.number().int().min(-1000).max(1000).optional() }));
  const res = await db
    .update(schema.groups)
    .set({ ...(name !== undefined ? { name } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}), updatedAt: new Date() })
    .where(eq(schema.groups.id, id))
    .returning({ id: schema.groups.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const id = await groupId(ctx);
  const res = await db.delete(schema.groups).where(eq(schema.groups.id, id)).returning({ id: schema.groups.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
