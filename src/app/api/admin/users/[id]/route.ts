import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin, deleteSessionsOfUser } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";
import { createNotification } from "@/lib/server/notify";

type Ctx = { params: Promise<{ id: string }> };

async function userId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
}

const patchSchema = z.union([
  z.object({ tempPassword: z.string().min(8).max(200) }),
  z.object({ aiEnabled: z.boolean() }),
]);

export const PATCH = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const id = await userId(ctx);
  const body = await parseJson(req, patchSchema);
  if ("aiEnabled" in body) return setAi(id, body.aiEnabled);
  const { tempPassword } = body;
  // Ideiglenes jelszó: a felhasználó következő belépéskor köteles újat megadni; minden sessionje megszűnik.
  const res = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id });
  if (!res.length) throw new ApiError(404, "not_found");
  await deleteSessionsOfUser(id);
  return json({ ok: true });
});

/** AI funkciók be- és kikapcsolása. Bekapcsoláskor értesítést kap, és a következő belépéskor egy üdvözlő ablakot. */
async function setAi(id: string, enabled: boolean) {
  const [before] = await db.select({ aiEnabled: schema.users.aiEnabled }).from(schema.users).where(eq(schema.users.id, id));
  if (!before) throw new ApiError(404, "not_found");
  if (before.aiEnabled === enabled) return json({ ok: true, aiEnabled: enabled });
  await db.update(schema.users).set({ aiEnabled: enabled, aiWelcome: enabled }).where(eq(schema.users.id, id));
  if (enabled) {
    // Egyedi kulcs, hogy egy későbbi újra-bekapcsoláskor is menjen értesítés.
    await createNotification(id, "aiEnabled", `ai-on:${Date.now()}`, {}, "/").catch((err) => {
      console.error("[admin] ai notification failed", err instanceof Error ? err.message : err);
    });
  }
  return json({ ok: true, aiEnabled: enabled });
}

export const DELETE = route<Ctx>(async (_req, ctx) => {
  await requireAdmin();
  const id = await userId(ctx);
  const res = await db.delete(schema.users).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
  if (!res.length) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
