import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

// „Mindenki kizárása a csoportból”: a jelszó marad, de minden feloldás érvénytelen lesz.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  const res = await db
    .update(schema.groups)
    .set({ accessVersion: sql`${schema.groups.accessVersion} + 1`, updatedAt: new Date() })
    .where(eq(schema.groups.id, id))
    .returning({ id: schema.groups.id });
  if (!res.length) throw new ApiError(404, "not_found");
  await db.delete(schema.userGroupAccess).where(eq(schema.userGroupAccess.groupId, id));
  return json({ ok: true });
});
