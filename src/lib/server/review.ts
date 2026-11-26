import "server-only";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { SrsCard } from "@/lib/srs";
import { materialVisibilityFilter } from "./auth";

export function rowToSrs(r: typeof schema.cardReviews.$inferSelect): SrsCard {
  return {
    due: r.due.getTime(),
    s: r.stability,
    d: r.difficulty,
    ed: r.elapsedDays,
    sd: r.scheduledDays,
    ls: r.learningSteps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    lr: r.lastReview ? r.lastReview.getTime() : null,
  };
}

export function srsToRow(c: SrsCard) {
  return {
    due: new Date(c.due),
    stability: c.s,
    difficulty: c.d,
    elapsedDays: c.ed,
    scheduledDays: c.sd,
    learningSteps: c.ls,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.lr ? new Date(c.lr) : null,
  };
}

export type DueItem = {
  id: string;
  term: string;
  definition: string;
  imageId: string | null;
  materialId: string;
  materialTitle: string;
  termLang: string;
  definitionLang: string;
  srs: SrsCard;
};

/** Az összes esedékes kártya (minden készletből, amihez a felhasználó még hozzáfér), a legrégebben esedékes elöl. */
export async function getDueForUser(userId: string, limit = 200): Promise<DueItem[]> {
  const visible = await materialVisibilityFilter();
  const rows = await db
    .select({
      review: schema.cardReviews,
      id: schema.cards.id,
      term: schema.cards.term,
      definition: schema.cards.definition,
      imageId: schema.cards.imageId,
      materialId: schema.materials.id,
      materialTitle: schema.materials.title,
      termLang: schema.materials.termLang,
      definitionLang: schema.materials.definitionLang,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
    })
    .from(schema.cardReviews)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.cardReviews.cardId))
    .innerJoin(schema.materials, eq(schema.materials.id, schema.cardReviews.materialId))
    .where(and(eq(schema.cardReviews.userId, userId), ne(schema.cardReviews.state, 0), lte(schema.cardReviews.due, new Date())))
    .orderBy(asc(schema.cardReviews.due))
    .limit(limit * 2);
  return rows
    .filter(visible)
    .slice(0, limit)
    .map(({ review, groupId: _g, ownerUserId: _o, ...r }) => ({ ...r, srs: rowToSrs(review) }));
}

/** Esedékes kártyák száma (értesítésekhez és a főoldalhoz). A csoport-hozzáférést itt nem nézzük újra, csak durva szám. */
export async function countDueRaw(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.cardReviews)
    .where(and(eq(schema.cardReviews.userId, userId), ne(schema.cardReviews.state, 0), lte(schema.cardReviews.due, new Date())));
  return Number(r?.n ?? 0);
}

export async function countDueForUser(userId: string): Promise<number> {
  return (await getDueForUser(userId, 1000)).length;
}

export type SetStat = { materialId: string; title: string; total: number; newCount: number; learning: number; known: number; mastered: number; due: number };

/** Készletenkénti szintek mindarra, amit a felhasználó már tanult (statisztika oldal). */
export async function getSetStatsForUser(userId: string): Promise<SetStat[]> {
  const { cardLevel } = await import("@/lib/srs");
  const visible = await materialVisibilityFilter();
  const [reviews, progress] = await Promise.all([
    db.select().from(schema.cardReviews).where(eq(schema.cardReviews.userId, userId)),
    db.select().from(schema.cardProgress).where(eq(schema.cardProgress.userId, userId)),
  ]);
  const ids = [...new Set([...reviews.map((r) => r.materialId), ...progress.map((p) => p.materialId)])];
  if (!ids.length) return [];
  const mats = await db
    .select({
      id: schema.materials.id,
      title: schema.materials.title,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
      total: sql<number>`(select count(*)::int from ${schema.cards} c where c.material_id = "materials"."id")`,
    })
    .from(schema.materials)
    .where(inArray(schema.materials.id, ids));
  const srsBy = new Map(reviews.map((r) => [r.cardId, rowToSrs(r)]));
  const progBy = new Map(progress.map((p) => [p.cardId, { level: p.level, streak: p.streak, wrong: p.wrongCount, at: p.lastStudiedAt.getTime() }]));
  const cardsBy = new Map<string, Set<string>>();
  for (const r of reviews) (cardsBy.get(r.materialId) ?? cardsBy.set(r.materialId, new Set()).get(r.materialId)!).add(r.cardId);
  for (const p of progress) (cardsBy.get(p.materialId) ?? cardsBy.set(p.materialId, new Set()).get(p.materialId)!).add(p.cardId);
  const now = Date.now();
  return mats
    .filter(visible)
    .map((m) => {
      const counts = [0, 0, 0, 0];
      let due = 0;
      for (const id of cardsBy.get(m.id) ?? []) {
        counts[cardLevel(srsBy.get(id), progBy.get(id))]!++;
        const s = srsBy.get(id);
        if (s && s.state !== 0 && s.due <= now) due++;
      }
      const studied = counts[1]! + counts[2]! + counts[3]!;
      return { materialId: m.id, title: m.title, total: m.total, newCount: Math.max(0, m.total - studied), learning: counts[1]!, known: counts[2]!, mastered: counts[3]!, due };
    })
    .sort((a, b) => b.mastered + b.known - (a.mastered + a.known));
}
