import { z } from "zod";
import { json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getActivitySummary, recordActivity } from "@/lib/server/activity";
import { createNotification } from "@/lib/server/notify";

export const GET = route(async () => {
  const user = await requireUser();
  return json(await getActivitySummary(user.id));
});

/** Megválaszolt kártyák jelentése (a napi célhoz és a sorozathoz). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { items, reviews } = await parseJson(req, z.object({ items: z.number().int().min(0).max(500), reviews: z.number().int().min(0).max(500) }));
  const r = await recordActivity(user.id, items, Math.min(reviews, items));
  // Mérföldkövek az értesítések között (az appon belül).
  if (r.goalJustMet && [7, 30, 50, 100, 200, 365].includes(r.streak.current)) {
    await createNotification(user.id, "milestone", `milestone:${r.streak.current}:${r.today}`, { days: r.streak.current }, "/stats", { push: false });
  }
  if (r.frozenDays.length) {
    await createNotification(user.id, "freezeUsed", `freeze:${r.today}`, { count: r.frozenDays.length, days: r.streak.current }, "/stats", { push: false });
  }
  return json(r);
});
