import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getMaterialForViewer } from "@/lib/server/data";
import { consume } from "@/lib/server/ratelimit";
import { copyMaterialToUser, MAX_OWN_SETS } from "@/lib/server/material-save";

/** Másolat egy (látható) készletről a saját könyvtárba, hogy a felhasználó szerkeszthesse. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { materialId, title } = await parseJson(req, z.object({ materialId: z.uuid(), title: z.string().trim().min(1).max(120).optional() }));
  const r = await getMaterialForViewer(materialId);
  if (r.status !== "ok") throw new ApiError(404, "not_found");
  const rl = await consume(`own-set:${user.id}`, 30, 3600);
  if (!rl.allowed) throw new ApiError(429, "too_many_requests", { retryAfter: rl.retryAfterSec });
  const [{ n }] = await db.select({ n: count() }).from(schema.materials).where(eq(schema.materials.ownerUserId, user.id));
  if (Number(n) >= MAX_OWN_SETS) throw new ApiError(400, "too_many_sets");
  const id = await copyMaterialToUser(materialId, user.id, (title ?? r.material.title).slice(0, 120));
  return json({ id });
});
