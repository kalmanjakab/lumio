import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const POST = route(async (req) => {
  await requireAdmin();
  const { title, groupId } = await parseJson(req, z.object({ title: z.string().trim().min(1).max(120), groupId: z.uuid().nullable() }));
  if (groupId) {
    const g = await db.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.id, groupId));
    if (!g.length) throw new ApiError(400, "group_not_found");
  }
  const [row] = await db.insert(schema.materials).values({ title, groupId, type: "flashcards" }).returning({ id: schema.materials.id });
  return json({ id: row!.id });
});
