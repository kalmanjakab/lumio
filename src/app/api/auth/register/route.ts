import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, clientIp, json, parseJson, route } from "@/lib/server/http";
import { consume } from "@/lib/server/ratelimit";
import { hashPassword } from "@/lib/server/password";
import { createUserSession } from "@/lib/server/auth";
import { migrateGuestGrants } from "@/lib/server/groups";
import { DEFAULT_USER_SETTINGS, LOCALES, USERNAME_RE } from "@/lib/validation";
import { z } from "zod";

const body = z.object({ username: z.string().max(60), password: z.string().max(200) });

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const rl = await consume(`register:ip:${ip}`, 5, 3600);
  if (!rl.allowed) throw new ApiError(429, "too_many", { retryAfter: rl.retryAfterSec });

  const { username: rawName, password } = await parseJson(req, body);
  const username = rawName.trim();
  if (!USERNAME_RE.test(username)) throw new ApiError(400, "username_invalid");
  if (password.length < 8) throw new ApiError(400, "password_too_short");

  const lower = username.toLowerCase();
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.usernameLower, lower)).limit(1);
  if (existing.length) throw new ApiError(409, "username_taken");

  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    const [row] = await db
      .insert(schema.users)
      .values({ username, usernameLower: lower, passwordHash, lastLoginAt: new Date() })
      .returning({ id: schema.users.id });
    userId = row!.id;
  } catch {
    throw new ApiError(409, "username_taken");
  }

  const jar = await cookies();
  const theme = jar.get("flashly_theme")?.value;
  const locale = jar.get("NEXT_LOCALE")?.value;
  await db.insert(schema.userSettings).values({
    userId,
    settings: {
      ...DEFAULT_USER_SETTINGS,
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : DEFAULT_USER_SETTINGS.theme,
      locale: (LOCALES as readonly string[]).includes(locale ?? "") ? locale : DEFAULT_USER_SETTINGS.locale,
    },
  });

  await migrateGuestGrants(userId);
  await createUserSession(userId);
  return json({ ok: true });
});
