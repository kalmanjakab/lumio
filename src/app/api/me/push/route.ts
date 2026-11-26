import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";
import { createNotification, vapidConfig } from "@/lib/server/notify";

const MAX_DEVICES = 10;

/** A push nyilvános kulcsa és a felhasználó feliratkozott eszközeinek száma. */
export const GET = route(async () => {
  const user = await requireUser();
  const cfg = vapidConfig();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, user.id));
  return json({ enabled: Boolean(cfg), publicKey: cfg?.publicKey ?? null, devices: Number(n) });
});

const b64url = z.string().regex(/^[A-Za-z0-9_=-]+$/);
const subscribeSchema = z.object({
  action: z.literal("subscribe"),
  subscription: z.object({
    endpoint: z
      .url()
      .max(1000)
      .refine((u) => u.startsWith("https://"), "https"),
    keys: z.object({ p256dh: b64url.min(40).max(200), auth: b64url.min(10).max(100) }),
  }),
  label: z.string().max(80).optional(),
});
const bodySchema = z.discriminatedUnion("action", [
  subscribeSchema,
  z.object({ action: z.literal("unsubscribe"), endpoint: z.url().max(1000) }),
  z.object({ action: z.literal("test") }),
]);

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseJson(req, bodySchema);
  const rl = await consume(`push:${user.id}`, 30, 3600);
  if (!rl.allowed) throw new ApiError(429, "rate_limited", { retryAfter: rl.retryAfterSec });

  if (body.action === "subscribe") {
    if (!vapidConfig()) throw new ApiError(503, "push_disabled");
    const { endpoint, keys } = body.subscription;
    // Ha ez az eszköz korábban más fiókhoz tartozott, átkerül ehhez (az endpoint egyedi).
    await db
      .insert(schema.pushSubscriptions)
      .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, label: body.label ?? "" })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, label: body.label ?? "", failCount: 0 },
      });
    // Eszközszám korlát: a legrégebbieket elengedjük.
    await db.execute(sql`
      delete from push_subscriptions where user_id = ${user.id} and id not in (
        select id from push_subscriptions where user_id = ${user.id} order by created_at desc limit ${MAX_DEVICES}
      )`);
    return json({ ok: true });
  }

  if (body.action === "unsubscribe") {
    await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.userId, user.id), eq(schema.pushSubscriptions.endpoint, body.endpoint)));
    return json({ ok: true });
  }

  // Próbaértesítés: percenként egy.
  const t = await consume(`push-test:${user.id}`, 1, 60);
  if (!t.allowed) throw new ApiError(429, "rate_limited", { retryAfter: t.retryAfterSec });
  await createNotification(user.id, "test", `test:${Date.now()}`, {}, "/notifications");
  return json({ ok: true });
});
