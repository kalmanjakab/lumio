import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, clientIp, json, parseJson, route } from "@/lib/server/http";
import { consume, peek, resetLimit } from "@/lib/server/ratelimit";
import { dummyHash, verifyPassword } from "@/lib/server/password";
import { createUserSession } from "@/lib/server/auth";
import { migrateGuestGrants } from "@/lib/server/groups";
import { loadUserSettings } from "@/lib/server/settings";
import { loginSchema } from "@/lib/validation";

const USER_LIMIT = 5;
const WINDOW = 15 * 60;

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const ipRl = await consume(`login:ip:${ip}`, 30, WINDOW);
  if (!ipRl.allowed) throw new ApiError(429, "too_many", { retryAfter: ipRl.retryAfterSec });

  const { username, password } = await parseJson(req, loginSchema);
  const lower = username.trim().toLowerCase();
  const userKey = `login:user:${lower}:${ip}`;
  const nameKey = `login:name:${lower}`;
  const [userRl, nameRl] = await Promise.all([peek(userKey, USER_LIMIT, WINDOW), peek(nameKey, 20, WINDOW)]);
  if (!userRl.allowed || !nameRl.allowed) {
    throw new ApiError(429, "too_many", { retryAfter: Math.max(userRl.retryAfterSec, nameRl.retryAfterSec) });
  }

  const rows = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash, mustChangePassword: schema.users.mustChangePassword })
    .from(schema.users)
    .where(eq(schema.users.usernameLower, lower))
    .limit(1);
  const user = rows[0];
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
  if (!user || !ok) {
    await Promise.all([consume(userKey, USER_LIMIT, WINDOW), consume(nameKey, 20, WINDOW)]);
    // Szándékosan ugyanaz az üzenet: nem áruljuk el, a név vagy a jelszó volt rossz.
    throw new ApiError(401, "invalid_credentials");
  }
  await resetLimit(userKey);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await migrateGuestGrants(user.id);
  await createUserSession(user.id);

  // A fiókban mentett nyelv és téma érvényesítése ezen az eszközön is.
  const settings = await loadUserSettings(user.id);
  const jar = await cookies();
  const secure = process.env.FLASHLY_INSECURE_COOKIES !== "1";
  jar.set("NEXT_LOCALE", settings.locale, { path: "/", sameSite: "lax", secure, maxAge: 365 * 86400 });
  jar.set("flashly_theme", settings.theme, { path: "/", sameSite: "lax", secure, maxAge: 365 * 86400 });

  return json({ ok: true, mustChangePassword: user.mustChangePassword });
});
