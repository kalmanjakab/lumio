import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";
import { MAX_OWN_SETS } from "@/lib/server/material-save";

/** Új saját (privát) készlet létrehozása. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { title } = await parseJson(req, z.object({ title: z.string().trim().min(1).max(120) }));
  const rl = await consume(`own-set:${user.id}`, 30, 3600);
  if (!rl.allowed) throw new ApiError(429, "too_many_requests", { retryAfter: rl.retryAfterSec });
  const [{ n }] = await db.select({ n: count() }).from(schema.materials).where(eq(schema.materials.ownerUserId, user.id));
  if (Number(n) >= MAX_OWN_SETS) throw new ApiError(400, "too_many_sets");
  const [row] = await db
    .insert(schema.materials)
    .values({ title, ownerUserId: user.id, type: "flashcards", termLang: "en-GB", definitionLang: "hu-HU" })
    .returning({ id: schema.materials.id });
  return json({ id: row!.id });
});
