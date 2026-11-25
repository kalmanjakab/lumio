import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type RateResult = { allowed: boolean; count: number; retryAfterSec: number };

/** Növeli a számlálót és megmondja, belefér-e még a korlátba. */
export async function consume(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const res = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = res.rows[0];
  if (Math.random() < 0.02) {
    void db.execute(sql`delete from rate_limits where window_start < now() - interval '2 days'`).catch(() => {});
  }
  const count = Number(row.count);
  const started = new Date(row.window_start).getTime();
  const retryAfterSec = Math.max(1, Math.ceil((started + windowSec * 1000 - Date.now()) / 1000));
  return { allowed: count <= limit, count, retryAfterSec };
}

/** Megnézi a számlálót növelés nélkül. */
export async function peek(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const res = await db.execute<{ count: number; window_start: Date }>(sql`
    select count, window_start from rate_limits
    where key = ${key} and window_start >= now() - make_interval(secs => ${windowSec})
  `);
  const row = res.rows[0];
  if (!row) return { allowed: true, count: 0, retryAfterSec: 0 };
  const count = Number(row.count);
  const started = new Date(row.window_start).getTime();
  return {
    allowed: count < limit,
    count,
    retryAfterSec: Math.max(1, Math.ceil((started + windowSec * 1000 - Date.now()) / 1000)),
  };
}

export async function resetLimit(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}
