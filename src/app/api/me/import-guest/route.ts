import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";
import { gradeFor } from "@/lib/grading-scale";

const progressEntry = z.object({ level: z.number().int().min(0).max(3), streak: z.number().int().min(0).max(20), wrong: z.number().int().min(0).max(100000), at: z.number() });
const item = z.object({
  materialId: z.uuid(),
  modeSettings: z.record(z.string(), z.unknown()).default({}),
  studyState: z.record(z.string(), z.unknown()).default({}),
  progress: z.record(z.string(), progressEntry).default({}),
  starred: z.array(z.string()).max(2000).default([]),
  tests: z
    .array(
      z.object({
        correct: z.number().int().min(0),
        total: z.number().int().min(1),
        percent: z.number().int().min(0).max(100),
        grade: z.number().int().min(1).max(5),
        durationMs: z.number().int().min(0),
        details: z.object({ questions: z.array(z.unknown()).max(2000) }),
        createdAt: z.string().optional(),
      }),
    )
    .max(20)
    .default([]),
  matchBestMs: z.number().int().min(300).max(3600_000).nullable().default(null),
});
const MODES = new Set(["set", "flashcards", "learn", "test", "match"]);

// Vendégként gyűjtött haladás átvétele belépés után. Csak olyan anyagot és kártyát veszünk át, amihez a fiók hozzáfér.
export const POST = route(async (req) => {
  const user = await requireUser();
  const { items } = await parseJson(req, z.object({ items: z.array(item).max(20) }));
  let imported = 0;
  for (const it of items) {
    if (!(await assertMaterialAccess(it.materialId))) continue;
    const cardIds = new Set(
      (await db.select({ id: schema.cards.id }).from(schema.cards).where(eq(schema.cards.materialId, it.materialId))).map((r) => r.id),
    );
    // Haladás: a jobb (magasabb) szint marad.
    const prog = Object.entries(it.progress).filter(([id]) => cardIds.has(id));
    if (prog.length) {
      await db
        .insert(schema.cardProgress)
        .values(prog.map(([cardId, p]) => ({ userId: user.id, cardId, materialId: it.materialId, level: p.level, streak: p.streak, wrongCount: p.wrong })))
        .onConflictDoUpdate({
          target: [schema.cardProgress.userId, schema.cardProgress.cardId],
          set: {
            level: sql`greatest(${schema.cardProgress.level}, excluded.level)`,
            streak: sql`greatest(${schema.cardProgress.streak}, excluded.streak)`,
            wrongCount: sql`${schema.cardProgress.wrongCount} + excluded.wrong_count`,
          },
        });
    }
    const stars = it.starred.filter((id) => cardIds.has(id));
    if (stars.length) {
      await db.insert(schema.starredCards).values(stars.map((cardId) => ({ userId: user.id, cardId, materialId: it.materialId }))).onConflictDoNothing();
    }
    for (const [mode, settings] of Object.entries(it.modeSettings)) {
      if (!MODES.has(mode) || !settings || typeof settings !== "object" || JSON.stringify(settings).length > 5000) continue;
      await db.insert(schema.modeSettings).values({ userId: user.id, materialId: it.materialId, mode, settings }).onConflictDoNothing();
    }
    for (const [mode, state] of Object.entries(it.studyState)) {
      if (!MODES.has(mode) || !state || JSON.stringify(state).length > 200_000) continue;
      await db.insert(schema.studyState).values({ userId: user.id, materialId: it.materialId, mode, state }).onConflictDoNothing();
    }
    for (const t of it.tests) {
      if (t.correct > t.total) continue;
      const percent = Math.round((t.correct / t.total) * 100);
      await db.insert(schema.testResults).values({
        userId: user.id,
        materialId: it.materialId,
        correct: t.correct,
        total: t.total,
        percent,
        grade: Math.min(5, Math.max(1, t.grade || gradeFor(percent))),
        durationMs: t.durationMs,
        details: t.details,
        createdAt: t.createdAt && !Number.isNaN(Date.parse(t.createdAt)) ? new Date(t.createdAt) : new Date(),
      });
    }
    if (it.matchBestMs) {
      await db
        .insert(schema.matchBestTimes)
        .values({ userId: user.id, materialId: it.materialId, bestMs: it.matchBestMs })
        .onConflictDoUpdate({ target: [schema.matchBestTimes.userId, schema.matchBestTimes.materialId], set: { bestMs: sql`least(${schema.matchBestTimes.bestMs}, excluded.best_ms)` } });
    }
    imported++;
  }
  return json({ ok: true, imported });
});
