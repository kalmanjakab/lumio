import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type AssignmentRow = {
  id: string;
  groupId: string;
  groupName: string;
  materialId: string;
  title: string;
  note: string;
  dueAt: string;
  createdAt: string;
  cardCount: number;
};

export type StudentProgress = {
  userId: string;
  username: string;
  total: number;
  studied: number;
  known: number;
  percent: number;
  bestTest: number | null;
  lastActive: string | null;
};

type Raw = Record<string, unknown>;
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

function mapAssignment(r: Raw): AssignmentRow {
  return {
    id: String(r.id),
    groupId: String(r.group_id),
    groupName: String(r.group_name),
    materialId: String(r.material_id),
    title: String(r.title),
    note: String(r.note ?? ""),
    dueAt: new Date(r.due_at as string).toISOString(),
    createdAt: new Date(r.created_at as string).toISOString(),
    cardCount: Number(r.card_count ?? 0),
  };
}

const BASE = sql`
  select a.id, a.group_id, g.name as group_name, a.material_id, m.title, a.note, a.due_at, a.created_at,
    (select count(*)::int from cards c where c.material_id = a.material_id) as card_count
  from assignments a
  join groups g on g.id = a.group_id
  join materials m on m.id = a.material_id`;

export async function listAssignmentsForGroup(groupId: string): Promise<AssignmentRow[]> {
  const r = await db.execute(sql`${BASE} where a.group_id = ${groupId} order by a.due_at asc`);
  return rows<Raw>(r).map(mapAssignment);
}

/** A tanuló feladatai: csak azokból a csoportokból, amelyekhez érvényes hozzáférése van. */
export async function listAssignmentsForUser(userId: string, opts: { groupId?: string; includePastDays?: number } = {}) {
  const past = opts.includePastDays ?? 7;
  const r = await db.execute(sql`${BASE}
    join user_group_access uga on uga.group_id = a.group_id and uga.user_id = ${userId} and uga.access_version = g.access_version
    where a.due_at > now() - make_interval(days => ${past})
    ${opts.groupId ? sql`and a.group_id = ${opts.groupId}` : sql``}
    order by a.due_at asc
    limit 50`);
  const list = rows<Raw>(r).map(mapAssignment);
  if (!list.length) return [];
  const prog = await progressFor(
    [userId],
    list.map((a) => a.materialId),
  );
  return list.map((a) => {
    const p = prog.get(`${userId}:${a.materialId}`);
    const known = p?.known ?? 0;
    return { ...a, known, percent: a.cardCount ? Math.round((known / a.cardCount) * 100) : 0, bestTest: p?.bestTest ?? null };
  });
}

/**
 * Haladás felhasználónként és készletenként: hány kártya „ismert” (FSRS ismétlés állapotban,
 * vagy a Tanulás módban legalább 2-es szint), és a legjobb teszt.
 */
async function progressFor(userIds: string[], materialIds: string[]) {
  const out = new Map<string, { studied: number; known: number; bestTest: number | null; lastActive: string | null }>();
  if (!userIds.length || !materialIds.length) return out;
  const uArr = sql`array[${sql.join(userIds.map((u) => sql`${u}::uuid`), sql`, `)}]`;
  const mArr = sql`array[${sql.join(materialIds.map((m) => sql`${m}::uuid`), sql`, `)}]`;
  const r = await db.execute(sql`
    with u as (select unnest(${uArr}) as user_id), m as (select unnest(${mArr}) as material_id),
    pairs as (select u.user_id, m.material_id from u cross join m),
    lv as (
      select p.user_id, p.material_id,
        count(c.id) filter (where cr.state is not null and cr.state <> 0 or coalesce(cp.level, 0) > 0)::int as studied,
        count(c.id) filter (where cr.state = 2 or coalesce(cp.level, 0) >= 2)::int as known,
        greatest(max(cr.last_review), max(cp.last_studied_at)) as last_active
      from pairs p
      join cards c on c.material_id = p.material_id
      left join card_reviews cr on cr.user_id = p.user_id and cr.card_id = c.id
      left join card_progress cp on cp.user_id = p.user_id and cp.card_id = c.id
      group by p.user_id, p.material_id
    ),
    tr as (
      select user_id, material_id, max(percent)::int as best
      from test_results where user_id = any(${uArr}) and material_id = any(${mArr})
      group by user_id, material_id
    )
    select lv.user_id, lv.material_id, lv.studied, lv.known, lv.last_active, tr.best
    from lv left join tr on tr.user_id = lv.user_id and tr.material_id = lv.material_id`);
  for (const x of rows<Raw>(r)) {
    out.set(`${x.user_id}:${x.material_id}`, {
      studied: Number(x.studied ?? 0),
      known: Number(x.known ?? 0),
      bestTest: x.best == null ? null : Number(x.best),
      lastActive: x.last_active ? new Date(x.last_active as string).toISOString() : null,
    });
  }
  return out;
}

/** A csoport tanulói (érvényes hozzáféréssel). */
export async function groupMembers(groupId: string): Promise<{ id: string; username: string }[]> {
  const r = await db.execute(sql`
    select u.id, u.username from user_group_access uga
    join users u on u.id = uga.user_id
    join groups g on g.id = uga.group_id and g.access_version = uga.access_version
    where uga.group_id = ${groupId}
    order by lower(u.username)`);
  return rows<Raw>(r).map((x) => ({ id: String(x.id), username: String(x.username) }));
}

/** Tanári áttekintés: minden tanuló haladása egy feladaton. */
export async function assignmentOverview(a: { groupId: string; materialId: string; cardCount: number }): Promise<StudentProgress[]> {
  const members = await groupMembers(a.groupId);
  const prog = await progressFor(
    members.map((m) => m.id),
    [a.materialId],
  );
  return members
    .map((m) => {
      const p = prog.get(`${m.id}:${a.materialId}`);
      const known = p?.known ?? 0;
      return {
        userId: m.id,
        username: m.username,
        total: a.cardCount,
        studied: p?.studied ?? 0,
        known,
        percent: a.cardCount ? Math.round((known / a.cardCount) * 100) : 0,
        bestTest: p?.bestTest ?? null,
        lastActive: p?.lastActive ?? null,
      };
    })
    .sort((x, y) => y.percent - x.percent || x.username.localeCompare(y.username));
}

/** Az értesítésekhez: egy felhasználó haladása több feladat készletén. */
export async function userKnownCounts(userId: string, materialIds: string[]) {
  return progressFor([userId], materialIds);
}
