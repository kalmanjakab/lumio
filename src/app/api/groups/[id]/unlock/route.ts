import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, clientIp, json, parseJson, route } from "@/lib/server/http";
import { consume } from "@/lib/server/ratelimit";
import { verifyPassword, dummyHash } from "@/lib/server/password";
import { getViewer, writeGuestGrants } from "@/lib/server/auth";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const ip = clientIp(req);
  const [perGroup, perIp] = await Promise.all([consume(`unlock:${ip}:${id}`, 10, 900), consume(`unlock:ip:${ip}`, 40, 900)]);
  if (!perGroup.allowed || !perIp.allowed) throw new ApiError(429, "too_many", { retryAfter: Math.max(perGroup.retryAfterSec, perIp.retryAfterSec) });

  const { password } = await parseJson(req, z.object({ password: z.string().min(1).max(200) }));
  const valid = z.uuid().safeParse(id).success;
  const rows = valid
    ? await db.select({ id: schema.groups.id, passwordHash: schema.groups.passwordHash, accessVersion: schema.groups.accessVersion }).from(schema.groups).where(eq(schema.groups.id, id))
    : [];
  const group = rows[0];
  const ok = await verifyPassword(group?.passwordHash ?? (await dummyHash()), password);
  if (!group || !ok) throw new ApiError(401, "wrong_password");

  const v = await getViewer();
  if (v.kind === "user") {
    await db
      .insert(schema.userGroupAccess)
      .values({ userId: v.user.id, groupId: group.id, accessVersion: group.accessVersion })
      .onConflictDoUpdate({
        target: [schema.userGroupAccess.userId, schema.userGroupAccess.groupId],
        set: { accessVersion: group.accessVersion, unlockedAt: sql`now()` },
      });
  } else {
    await writeGuestGrants({ ...v.grants, [group.id]: group.accessVersion });
  }
  return json({ ok: true });
});
