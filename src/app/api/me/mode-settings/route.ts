import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";
import { modeSchema } from "@/lib/server/me-schemas";

export const PUT = route(async (req) => {
  const user = await requireUser();
  const { materialId, mode, settings } = await parseJson(
    req,
    z.object({ materialId: z.uuid(), mode: modeSchema, settings: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length < 5000) }),
  );
  if (!(await assertMaterialAccess(materialId))) throw new ApiError(403, "forbidden");
  await db
    .insert(schema.modeSettings)
    .values({ userId: user.id, materialId, mode, settings })
    .onConflictDoUpdate({ target: [schema.modeSettings.userId, schema.modeSettings.materialId, schema.modeSettings.mode], set: { settings, updatedAt: sql`now()` } });
  return json({ ok: true });
});
