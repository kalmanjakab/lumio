import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { AI_DAILY_LIMIT, aiConfigured, aiQuota } from "@/lib/server/ai";

/** Az AI állapota a bejelentkezett felhasználónak: be van-e kapcsolva, és mennyi kérés maradt ma. */
export const GET = route(async () => {
  const user = await requireUser();
  const enabled = aiConfigured() && user.aiEnabled;
  if (!enabled) return json({ enabled: false, limit: AI_DAILY_LIMIT, remaining: 0, resetInSec: 0 });
  const q = await aiQuota(user.id);
  return json({ enabled: true, limit: AI_DAILY_LIMIT, remaining: q.remaining, resetInSec: q.resetInSec });
});

/** Az üdvözlő ablak bezárása (többé nem jelenik meg). */
export const POST = route(async (req) => {
  const user = await requireUser();
  await parseJson(req, z.object({ action: z.literal("dismissWelcome") }));
  await db.update(schema.users).set({ aiWelcome: false }).where(eq(schema.users.id, user.id));
  return json({ ok: true });
});
