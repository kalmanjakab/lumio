import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin, deleteSessionsOfUser } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";

type Ctx = { params: Promise<{ id: string }> };

async function userId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
}

// Ideiglenes jelszó: a felhasználó következő belépéskor köteles újat megadni; minden sessionje megszűnik.
export const PATCH = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const id = await userId(ctx);
  const { tempPassword } = await parseJson(req, z.object({ tempPassword: z.string().min(8).max(200) }));
  const res = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id });
  if (!res.length) throw new ApiError(404, "not_found");
  await deleteSessionsOfUser(id);
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const id = await userId(ctx);
  const res = await db.delete(schema.users).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
