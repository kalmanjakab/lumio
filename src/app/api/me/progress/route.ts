import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";

const update = z.object({ cardId: z.uuid(), level: z.number().int().min(0).max(3), streak: z.number().int().min(0).max(20), wrongDelta: z.number().int().min(0).max(50) });

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseJson(req, z.object({ materialId: z.uuid(), updates: z.array(update).max(500).optional(), reset: z.literal(true).optional() }));
  if (body.reset) {
    if (!(await assertMaterialAccess(body.materialId))) throw new ApiError(403, "forbidden");
    await db.delete(schema.cardProgress).where(and(eq(schema.cardProgress.userId, user.id), eq(schema.cardProgress.materialId, body.materialId)));
    return json({ ok: true });
  }
  const updates = body.updates ?? [];
  if (!updates.length) return json({ ok: true });
  if (!(await assertMaterialAccess(body.materialId, updates.map((u) => u.cardId)))) throw new ApiError(403, "forbidden");
  await db
    .insert(schema.cardProgress)
    .values(updates.map((u) => ({ userId: user.id, cardId: u.cardId, materialId: body.materialId, level: u.level, streak: u.streak, wrongCount: u.wrongDelta })))
    .onConflictDoUpdate({
      target: [schema.cardProgress.userId, schema.cardProgress.cardId],
      set: {
        level: sql`excluded.level`,
        streak: sql`excluded.streak`,
        wrongCount: sql`${schema.cardProgress.wrongCount} + excluded.wrong_count`,
        lastStudiedAt: sql`now()`,
      },
    });
  return json({ ok: true });
});
