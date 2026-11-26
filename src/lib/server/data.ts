import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canAccessMaterial, getAccessibleGroupIds, getViewer, materialVisibilityFilter } from "./auth";
import type { CardDTO, MaterialDTO, StudyData, TestResultRecord, ProgressEntry } from "@/lib/study-types";
import type { GradeThresholds } from "@/lib/db/schema";
import { getGlobalThresholds } from "./app-settings";
import { rowToSrs } from "./review";

export type GroupListItem = { id: string; name: string; unlocked: boolean; materialCount: number | null };

export async function listGroupsForViewer(): Promise<GroupListItem[]> {
  const accessible = await getAccessibleGroupIds();
  const rows = await db
    .select({
      id: schema.groups.id,
      name: schema.groups.name,
      materialCount: sql<number>`(select count(*)::int from ${schema.materials} m where m.group_id = "groups"."id")`,
    })
    .from(schema.groups)
    .orderBy(asc(schema.groups.sortOrder), asc(schema.groups.name));
  // Zárt csoportnál még a készletek számát sem adjuk ki.
  return rows.map((r) => ({ id: r.id, name: r.name, unlocked: accessible.has(r.id), materialCount: accessible.has(r.id) ? r.materialCount : null }));
}

const materialSelect = {
  id: schema.materials.id,
  title: schema.materials.title,
  description: schema.materials.description,
  groupId: schema.materials.groupId,
  groupName: schema.groups.name,
  termLang: schema.materials.termLang,
  definitionLang: schema.materials.definitionLang,
  ownerUserId: schema.materials.ownerUserId,
  cardCount: sql<number>`(select count(*)::int from ${schema.cards} c where c.material_id = "materials"."id")`,
};

type MaterialRowRaw = Omit<MaterialDTO, "isOwn"> & { ownerUserId: string | null };
const toDTO = ({ ownerUserId, ...m }: MaterialRowRaw): MaterialDTO => ({ ...m, isOwn: ownerUserId !== null });

/** SQL-feltétel: a nyilvános készletek, a megnyitott csoportok készletei és a néző saját készletei. */
export async function materialAccessWhere() {
  const [accessible, v] = await Promise.all([getAccessibleGroupIds(), getViewer()]);
  const parts = [and(isNull(schema.materials.groupId), isNull(schema.materials.ownerUserId))];
  if (accessible.size) parts.push(inArray(schema.materials.groupId, [...accessible]));
  if (v.kind === "user") parts.push(eq(schema.materials.ownerUserId, v.user.id));
  return or(...parts)!;
}

/** Minden anyag, amihez a néző hozzáfér: a nyilvánosak, a megnyitott csoportok anyagai és a sajátjai. */
export async function listAccessibleMaterials(): Promise<MaterialDTO[]> {
  const rows = await db
    .select(materialSelect)
    .from(schema.materials)
    .leftJoin(schema.groups, eq(schema.groups.id, schema.materials.groupId))
    .where(await materialAccessWhere())
    .orderBy(asc(schema.materials.sortOrder), asc(schema.materials.title));
  return rows.map(toDTO);
}

export type MaterialResult =
  | { status: "ok"; material: MaterialDTO & { gradeThresholds: GradeThresholds }; cards: CardDTO[] }
  | { status: "locked"; group: { id: string; name: string } }
  | { status: "not_found" };

/** Egy anyag lekérése jogosultság-ellenőrzéssel. Zárt csoportnál a tartalom egy bájtja sem jön ki. */
export async function getMaterialForViewer(id: string): Promise<MaterialResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: "not_found" };
  const rows = await db
    .select({ ...materialSelect, gradeThresholds: schema.materials.gradeThresholds })
    .from(schema.materials)
    .leftJoin(schema.groups, eq(schema.groups.id, schema.materials.groupId))
    .where(eq(schema.materials.id, id))
    .limit(1);
  const raw = rows[0];
  if (!raw) return { status: "not_found" };
  // Más felhasználó saját készletéről azt sem áruljuk el, hogy létezik.
  if (raw.ownerUserId && !(await canAccessMaterial(raw))) return { status: "not_found" };
  if (!(await canAccessMaterial(raw))) {
    return { status: "locked", group: { id: raw.groupId!, name: raw.groupName ?? "" } };
  }
  const cards = await db
    .select(cardSelect)
    .from(schema.cards)
    .where(eq(schema.cards.materialId, id))
    .orderBy(asc(schema.cards.position), asc(schema.cards.createdAt));
  const { gradeThresholds: own, ...m } = raw;
  const gradeThresholds = own ?? (await getGlobalThresholds());
  return { status: "ok", material: { ...toDTO(m), gradeThresholds }, cards };
}

export const cardSelect = { id: schema.cards.id, term: schema.cards.term, definition: schema.cards.definition, imageId: schema.cards.imageId };

/** API-hoz: ellenőrzi, hogy a néző hozzáfér-e az anyaghoz, és (ha kell) hogy a kártyák ehhez az anyaghoz tartoznak. */
export async function assertMaterialAccess(materialId: string, cardIds: string[] = []): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return false;
  const rows = await db
    .select({ groupId: schema.materials.groupId, ownerUserId: schema.materials.ownerUserId })
    .from(schema.materials)
    .where(eq(schema.materials.id, materialId))
    .limit(1);
  if (!rows[0]) return false;
  if (!(await canAccessMaterial(rows[0]))) return false;
  if (cardIds.length) {
    const unique = [...new Set(cardIds)];
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.cards)
      .where(and(eq(schema.cards.materialId, materialId), inArray(schema.cards.id, unique)));
    if (Number(n) !== unique.length) return false;
  }
  return true;
}

export async function loadStudyDataForUser(userId: string, materialId: string): Promise<StudyData> {
  const [settingsRows, stateRows, progressRows, starredRows, testRows, matchRows, reviewRows] = await Promise.all([
    db.select({ mode: schema.modeSettings.mode, settings: schema.modeSettings.settings }).from(schema.modeSettings).where(and(eq(schema.modeSettings.userId, userId), eq(schema.modeSettings.materialId, materialId))),
    db.select({ mode: schema.studyState.mode, state: schema.studyState.state }).from(schema.studyState).where(and(eq(schema.studyState.userId, userId), eq(schema.studyState.materialId, materialId))),
    db
      .select({ cardId: schema.cardProgress.cardId, level: schema.cardProgress.level, streak: schema.cardProgress.streak, wrong: schema.cardProgress.wrongCount, at: schema.cardProgress.lastStudiedAt })
      .from(schema.cardProgress)
      .where(and(eq(schema.cardProgress.userId, userId), eq(schema.cardProgress.materialId, materialId))),
    db.select({ cardId: schema.starredCards.cardId }).from(schema.starredCards).where(and(eq(schema.starredCards.userId, userId), eq(schema.starredCards.materialId, materialId))),
    db
      .select()
      .from(schema.testResults)
      .where(and(eq(schema.testResults.userId, userId), eq(schema.testResults.materialId, materialId)))
      .orderBy(desc(schema.testResults.createdAt))
      .limit(10),
    db.select({ bestMs: schema.matchBestTimes.bestMs }).from(schema.matchBestTimes).where(and(eq(schema.matchBestTimes.userId, userId), eq(schema.matchBestTimes.materialId, materialId))),
    db.select().from(schema.cardReviews).where(and(eq(schema.cardReviews.userId, userId), eq(schema.cardReviews.materialId, materialId))),
  ]);
  const progress: Record<string, ProgressEntry> = {};
  for (const p of progressRows) progress[p.cardId] = { level: p.level, streak: p.streak, wrong: p.wrong, at: p.at.getTime() };
  return {
    modeSettings: Object.fromEntries(settingsRows.map((r) => [r.mode, r.settings])),
    studyState: Object.fromEntries(stateRows.map((r) => [r.mode, r.state])),
    progress,
    starred: starredRows.map((r) => r.cardId),
    tests: testRows.map(toTestRecord),
    matchBestMs: matchRows[0]?.bestMs ?? null,
    srs: Object.fromEntries(reviewRows.map((r) => [r.cardId, rowToSrs(r)])),
  };
}

export function toTestRecord(r: typeof schema.testResults.$inferSelect): TestResultRecord {
  return {
    id: r.id,
    correct: r.correct,
    total: r.total,
    percent: r.percent,
    grade: r.grade,
    durationMs: r.durationMs,
    details: r.details as TestResultRecord["details"],
    createdAt: r.createdAt.toISOString(),
  };
}

export type RecentItem = {
  materialId: string;
  title: string;
  mode: string;
  cardCount: number;
  done: number;
  kind: "sorted" | "learned" | "none";
  updatedAt: number;
};

/** „Folytasd”: a felhasználó legutóbb tanult készletei haladással (csak amihez még hozzáfér). */
export async function getRecentForUser(userId: string, limit = 8): Promise<RecentItem[]> {
  const visible = await materialVisibilityFilter();
  const rows = await db
    .select({
      materialId: schema.studyState.materialId,
      mode: schema.studyState.mode,
      state: schema.studyState.state,
      updatedAt: schema.studyState.updatedAt,
      title: schema.materials.title,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
      cardCount: sql<number>`(select count(*)::int from ${schema.cards} c where c.material_id = "materials"."id")`,
      mastered: sql<number>`(select count(*)::int from ${schema.cardProgress} p where p.user_id = ${userId} and p.material_id = "materials"."id" and p.level >= 3)`,
    })
    .from(schema.studyState)
    .innerJoin(schema.materials, eq(schema.materials.id, schema.studyState.materialId))
    .where(and(eq(schema.studyState.userId, userId), inArray(schema.studyState.mode, ["flashcards", "learn", "test", "match"])))
    .orderBy(desc(schema.studyState.updatedAt))
    .limit(40);
  const seen = new Set<string>();
  const out: RecentItem[] = [];
  for (const r of rows) {
    if (!visible(r)) continue;
    if (seen.has(r.materialId)) continue;
    seen.add(r.materialId);
    out.push(summarizeRecent(r.materialId, r.title, r.mode, r.state, r.cardCount, r.mastered, r.updatedAt.getTime()));
    if (out.length >= limit) break;
  }
  return out;
}

export function summarizeRecent(materialId: string, title: string, mode: string, state: unknown, cardCount: number, mastered: number, updatedAt: number): RecentItem {
  const s = (state ?? {}) as { known?: unknown[]; learning?: unknown[] };
  if (mode === "flashcards") {
    const done = (Array.isArray(s.known) ? s.known.length : 0) + (Array.isArray(s.learning) ? s.learning.length : 0);
    return { materialId, title, mode, cardCount, done: Math.min(done, cardCount), kind: "sorted", updatedAt };
  }
  if (mode === "learn") return { materialId, title, mode, cardCount, done: Math.min(mastered, cardCount), kind: "learned", updatedAt };
  return { materialId, title, mode, cardCount, done: 0, kind: "none", updatedAt };
}

export type SearchResult = { material: MaterialDTO; matchedCard: string | null };

export async function searchMaterials(q: string): Promise<SearchResult[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 1) return [];
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const accessWhere = await materialAccessWhere();
  const titleHits = await db
    .select(materialSelect)
    .from(schema.materials)
    .leftJoin(schema.groups, eq(schema.groups.id, schema.materials.groupId))
    .where(and(accessWhere, ilike(schema.materials.title, pattern)))
    .limit(30);
  const cardHits = await db
    .select({ ...materialSelect, term: schema.cards.term, definition: schema.cards.definition })
    .from(schema.cards)
    .innerJoin(schema.materials, eq(schema.materials.id, schema.cards.materialId))
    .leftJoin(schema.groups, eq(schema.groups.id, schema.materials.groupId))
    .where(and(accessWhere, or(ilike(schema.cards.term, pattern), ilike(schema.cards.definition, pattern))))
    .limit(60);
  const out = new Map<string, SearchResult>();
  for (const m of titleHits) out.set(m.id, { material: toDTO(m), matchedCard: null });
  for (const c of cardHits) {
    if (out.has(c.id)) continue;
    const { term: t, definition: d, ...m } = c;
    out.set(c.id, { material: toDTO(m), matchedCard: `${t} – ${d}` });
  }
  return [...out.values()].slice(0, 40);
}

export type StarredItem = CardDTO & { materialId: string; materialTitle: string; termLang: string; definitionLang: string };

export async function getStarredForUser(userId: string): Promise<StarredItem[]> {
  const visible = await materialVisibilityFilter();
  const rows = await db
    .select({
      id: schema.cards.id,
      term: schema.cards.term,
      definition: schema.cards.definition,
      materialId: schema.materials.id,
      materialTitle: schema.materials.title,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
      imageId: schema.cards.imageId,
      termLang: schema.materials.termLang,
      definitionLang: schema.materials.definitionLang,
    })
    .from(schema.starredCards)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.starredCards.cardId))
    .innerJoin(schema.materials, eq(schema.materials.id, schema.starredCards.materialId))
    .where(eq(schema.starredCards.userId, userId))
    .orderBy(desc(schema.starredCards.createdAt))
    .limit(500);
  return rows.filter(visible).map(({ groupId: _g, ownerUserId: _o, ...rest }) => rest);
}

export type TestListItem = { id: string; materialId: string; materialTitle: string; percent: number; grade: number; createdAt: string };

export async function getTestsForUser(userId: string): Promise<TestListItem[]> {
  const visible = await materialVisibilityFilter();
  const rows = await db
    .select({
      id: schema.testResults.id,
      materialId: schema.testResults.materialId,
      materialTitle: schema.materials.title,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
      percent: schema.testResults.percent,
      grade: schema.testResults.grade,
      createdAt: schema.testResults.createdAt,
    })
    .from(schema.testResults)
    .innerJoin(schema.materials, eq(schema.materials.id, schema.testResults.materialId))
    .where(eq(schema.testResults.userId, userId))
    .orderBy(desc(schema.testResults.createdAt))
    .limit(50);
  return rows
    .filter(visible)
    .map(({ groupId: _g, ownerUserId: _o, createdAt, ...r }) => ({ ...r, createdAt: createdAt.toISOString() }));
}

/** Kártyák lekérése azonosító alapján (vendég könyvtárához), csak amihez a néző hozzáfér. */
export async function lookupCards(ids: string[]): Promise<StarredItem[]> {
  const unique = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!unique.length) return [];
  const visible = await materialVisibilityFilter();
  const rows = await db
    .select({
      id: schema.cards.id,
      term: schema.cards.term,
      definition: schema.cards.definition,
      materialId: schema.materials.id,
      materialTitle: schema.materials.title,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
      imageId: schema.cards.imageId,
      termLang: schema.materials.termLang,
      definitionLang: schema.materials.definitionLang,
    })
    .from(schema.cards)
    .innerJoin(schema.materials, eq(schema.materials.id, schema.cards.materialId))
    .where(inArray(schema.cards.id, unique));
  return rows.filter(visible).map(({ groupId: _g, ownerUserId: _o, ...rest }) => rest);
}

export { getViewer };
