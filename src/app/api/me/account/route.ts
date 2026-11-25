import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { destroyUserSession, requireUser } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";
import { verifyPassword } from "@/lib/server/password";

// Fiók törlése: minden adat ténylegesen törlődik (a táblák ON DELETE CASCADE-del kötődnek a felhasználóhoz).
export const DELETE = route(async (req) => {
  const user = await requireUser();
  const rl = await consume(`delacc:${user.id}`, 5, 900);
  if (!rl.allowed) throw new ApiError(429, "too_many", { retryAfter: rl.retryAfterSec });
  const { password } = await parseJson(req, z.object({ password: z.string().min(1).max(200) }));
  const [row] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await verifyPassword(row.passwordHash, password))) throw new ApiError(400, "wrong_password");
  await destroyUserSession();
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  return json({ ok: true });
});
