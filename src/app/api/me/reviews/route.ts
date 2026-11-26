import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";
import { isValidSrs } from "@/lib/srs";
import { srsToRow } from "@/lib/server/review";

const review = z.object({ cardId: z.uuid(), card: z.unknown().refine(isValidSrs, "invalid_card") });

/** Ismétlési állapotok mentése (a kliens számolja az FSRS-t). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseJson(req, z.object({ materialId: z.uuid(), reviews: z.array(review).min(1).max(200) }));
  const reviews = body.reviews.map((r) => ({ cardId: r.cardId, card: r.card as Parameters<typeof srsToRow>[0] }));
  if (!(await assertMaterialAccess(body.materialId, reviews.map((r) => r.cardId)))) throw new ApiError(403, "forbidden");
  const rows = reviews.map((r) => ({ userId: user.id, cardId: r.cardId, materialId: body.materialId, ...srsToRow(r.card) }));
  await db
    .insert(schema.cardReviews)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.cardReviews.userId, schema.cardReviews.cardId],
      set: {
        due: sql`excluded.due`,
        stability: sql`excluded.stability`,
        difficulty: sql`excluded.difficulty`,
        elapsedDays: sql`excluded.elapsed_days`,
        scheduledDays: sql`excluded.scheduled_days`,
        learningSteps: sql`excluded.learning_steps`,
        reps: sql`excluded.reps`,
        lapses: sql`excluded.lapses`,
        state: sql`excluded.state`,
        lastReview: sql`excluded.last_review`,
      },
    });
  return json({ ok: true });
});
