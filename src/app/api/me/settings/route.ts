import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { loadUserSettings } from "@/lib/server/settings";
import { userSettingsSchema } from "@/lib/validation";

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const patch = await parseJson(req, userSettingsSchema.partial());
  const merged = { ...(await loadUserSettings(user.id)), ...patch };
  await db
    .insert(schema.userSettings)
    .values({ userId: user.id, settings: merged })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: { settings: merged, updatedAt: sql`now()` } });
  return json({ ok: true });
});
