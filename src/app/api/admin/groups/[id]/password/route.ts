import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";
import { groupPasswordSchema } from "@/lib/server/admin-schemas";

// Új csoportjelszó: az accessVersion nő, így minden korábbi feloldás érvényét veszti.
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  const { password } = await parseJson(req, z.object({ password: groupPasswordSchema }));
  const res = await db
    .update(schema.groups)
    .set({ passwordHash: await hashPassword(password), accessVersion: sql`${schema.groups.accessVersion} + 1`, updatedAt: new Date() })
    .where(eq(schema.groups.id, id))
    .returning({ id: schema.groups.id });
  if (!res.length) throw new ApiError(404, "not_found");
  await db.delete(schema.userGroupAccess).where(eq(schema.userGroupAccess.groupId, id));
  return json({ ok: true });
});
