import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { materialId, ms } = await parseJson(req, z.object({ materialId: z.uuid(), ms: z.number().int().min(300).max(3600_000) }));
  if (!(await assertMaterialAccess(materialId))) throw new ApiError(403, "forbidden");
  const [row] = await db
    .insert(schema.matchBestTimes)
    .values({ userId: user.id, materialId, bestMs: ms })
    .onConflictDoUpdate({
      target: [schema.matchBestTimes.userId, schema.matchBestTimes.materialId],
      set: { bestMs: sql`least(${schema.matchBestTimes.bestMs}, excluded.best_ms)`, updatedAt: sql`now()` },
    })
    .returning({ bestMs: schema.matchBestTimes.bestMs });
  await db
    .insert(schema.studyState)
    .values({ userId: user.id, materialId, mode: "match", state: { lastMs: ms } })
    .onConflictDoUpdate({ target: [schema.studyState.userId, schema.studyState.materialId, schema.studyState.mode], set: { state: { lastMs: ms }, updatedAt: sql`now()` } });
  return json({ bestMs: row!.bestMs });
});
