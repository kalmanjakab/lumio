import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";
import { modeSchema, jsonValue } from "@/lib/server/me-schemas";

export const PUT = route(async (req) => {
  const user = await requireUser();
  const { materialId, mode, state } = await parseJson(req, z.object({ materialId: z.uuid(), mode: modeSchema, state: jsonValue.nullable() }));
  if (!(await assertMaterialAccess(materialId))) throw new ApiError(403, "forbidden");
  if (state === null || state === undefined) {
    await db.delete(schema.studyState).where(and(eq(schema.studyState.userId, user.id), eq(schema.studyState.materialId, materialId), eq(schema.studyState.mode, mode)));
  } else {
    await db
      .insert(schema.studyState)
      .values({ userId: user.id, materialId, mode, state })
      .onConflictDoUpdate({ target: [schema.studyState.userId, schema.studyState.materialId, schema.studyState.mode], set: { state, updatedAt: sql`now()` } });
  }
  return json({ ok: true });
});
