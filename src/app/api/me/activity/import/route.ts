import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Vendégként gyűjtött napi aktivitás és sorozat átvétele belépéskor. A nagyobb érték marad. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseJson(
    req,
    z.object({
      days: z.array(z.object({ day, items: z.number().int().min(0).max(100000), reviews: z.number().int().min(0).max(100000), goalMet: z.boolean() })).max(400),
      streak: z.object({ current: z.number().int().min(0).max(100000), longest: z.number().int().min(0).max(100000), lastDay: day.nullable(), freezes: z.number().int().min(0).max(2) }),
    }),
  );
  for (const d of body.days) {
    await db
      .insert(schema.dailyActivity)
      .values({ userId: user.id, day: d.day, items: d.items, reviews: d.reviews, goalMet: d.goalMet })
      .onConflictDoUpdate({
        target: [schema.dailyActivity.userId, schema.dailyActivity.day],
        set: {
          items: sql`greatest(${schema.dailyActivity.items}, excluded.items)`,
          reviews: sql`greatest(${schema.dailyActivity.reviews}, excluded.reviews)`,
          goalMet: sql`${schema.dailyActivity.goalMet} or excluded.goal_met`,
        },
      });
  }
  const [cur] = await db.select().from(schema.streaks).where(eq(schema.streaks.userId, user.id));
  const s = body.streak;
  const guestNewer = s.lastDay && (!cur?.lastDay || s.lastDay > cur.lastDay || (s.lastDay === cur.lastDay && s.current > cur.current));
  if (guestNewer) {
    const next = { current: s.current, longest: Math.max(s.longest, cur?.longest ?? 0), lastDay: s.lastDay, freezes: s.freezes };
    await db
      .insert(schema.streaks)
      .values({ userId: user.id, ...next })
      .onConflictDoUpdate({ target: schema.streaks.userId, set: { ...next, updatedAt: sql`now()` } });
  }
  return json({ ok: true });
});
