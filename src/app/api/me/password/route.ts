import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { getViewer, requireUser } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";
import { hashPassword, verifyPassword } from "@/lib/server/password";

export const POST = route(async (req) => {
  const user = await requireUser();
  const rl = await consume(`pwchange:${user.id}`, 10, 900);
  if (!rl.allowed) throw new ApiError(429, "too_many", { retryAfter: rl.retryAfterSec });
  const { currentPassword, newPassword } = await parseJson(req, z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(8).max(200) }));
  const [row] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) throw new ApiError(400, "wrong_password");
  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false }).where(eq(schema.users.id, user.id));
  // A többi eszközön kijelentkeztetjük, ezen az eszközön marad a belépés.
  const v = await getViewer();
  if (v.kind === "user") {
    await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.idHash, v.sessionHash)));
  }
  return json({ ok: true });
});
