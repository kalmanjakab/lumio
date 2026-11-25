import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";

const question = z.object({
  cardId: z.uuid(),
  type: z.enum(["tf", "mc", "written"]),
  prompt: z.string().max(2000),
  shown: z.string().max(2000).optional(),
  options: z.array(z.string().max(2000)).max(6).optional(),
  correctAnswer: z.string().max(2000),
  userAnswer: z.string().max(2000).nullable(),
  correct: z.boolean(),
});

const testResultSchema = z.object({
  materialId: z.uuid(),
  correct: z.number().int().min(0).max(2000),
  total: z.number().int().min(1).max(2000),
  percent: z.number().int().min(0).max(100),
  grade: z.number().int().min(1).max(5),
  durationMs: z.number().int().min(0).max(24 * 3600_000),
  details: z.object({ questions: z.array(question).max(2000) }),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const r = await parseJson(req, testResultSchema);
  if (r.correct > r.total) throw new ApiError(400, "validation");
  if (!(await assertMaterialAccess(r.materialId))) throw new ApiError(403, "forbidden");
  const [row] = await db
    .insert(schema.testResults)
    .values({ userId: user.id, materialId: r.materialId, correct: r.correct, total: r.total, percent: r.percent, grade: r.grade, durationMs: r.durationMs, details: r.details })
    .returning({ id: schema.testResults.id });
  await db
    .insert(schema.studyState)
    .values({ userId: user.id, materialId: r.materialId, mode: "test", state: { lastResultId: row!.id } })
    .onConflictDoUpdate({ target: [schema.studyState.userId, schema.studyState.materialId, schema.studyState.mode], set: { state: { lastResultId: row!.id }, updatedAt: sql`now()` } });
  return json({ id: row!.id });
});
