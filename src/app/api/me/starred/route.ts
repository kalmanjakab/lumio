import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertMaterialAccess } from "@/lib/server/data";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { materialId, cardId, starred } = await parseJson(req, z.object({ materialId: z.uuid(), cardId: z.uuid(), starred: z.boolean() }));
  if (!(await assertMaterialAccess(materialId, [cardId]))) throw new ApiError(403, "forbidden");
  if (starred) {
    await db.insert(schema.starredCards).values({ userId: user.id, cardId, materialId }).onConflictDoNothing();
  } else {
    await db.delete(schema.starredCards).where(and(eq(schema.starredCards.userId, user.id), eq(schema.starredCards.cardId, cardId)));
  }
  return json({ ok: true });
});
