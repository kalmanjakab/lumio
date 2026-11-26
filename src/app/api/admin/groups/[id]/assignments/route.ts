import { after } from "next/server";
import { z } from "zod";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { groupMembers } from "@/lib/server/assignments";
import { createNotification } from "@/lib/server/notify";
import { loadUserSettings } from "@/lib/server/settings";
import { dayInZone } from "@/lib/streak";

type Ctx = { params: Promise<{ id: string }> };
const MAX_PER_GROUP = 100;

const createSchema = z.object({
  materialId: z.uuid(),
  dueAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(300).default(""),
});

async function groupOr404(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  const [g] = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, id));
  if (!g) throw new ApiError(404, "not_found");
  return g;
}

/** Feladat kiosztása a csoportnak: egy készlet határidővel. A tagok értesítést kapnak. */
export const POST = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const group = await groupOr404(ctx);
  const body = await parseJson(req, createSchema);
  const due = new Date(body.dueAt);
  if (due.getTime() < Date.now() - 60_000 || due.getTime() > Date.now() + 366 * 86400_000) throw new ApiError(400, "validation", { field: "dueAt" });
  // A készlet a csoporté vagy nyilvános legyen (saját, felhasználói készletet nem lehet kiosztani).
  const [m] = await db
    .select({ id: schema.materials.id, title: schema.materials.title })
    .from(schema.materials)
    .where(
      and(
        eq(schema.materials.id, body.materialId),
        isNull(schema.materials.ownerUserId),
        or(eq(schema.materials.groupId, group.id), isNull(schema.materials.groupId)),
      ),
    );
  if (!m) throw new ApiError(400, "validation", { field: "materialId" });
  const [{ n }] = await db.select({ n: count() }).from(schema.assignments).where(eq(schema.assignments.groupId, group.id));
  if (Number(n) >= MAX_PER_GROUP) throw new ApiError(400, "too_many");
  const [a] = await db
    .insert(schema.assignments)
    .values({ groupId: group.id, materialId: m.id, note: body.note, dueAt: due })
    .returning({ id: schema.assignments.id });

  after(async () => {
    try {
      const members = await groupMembers(group.id);
      for (const u of members) {
        const s = await loadUserSettings(u.id);
        const dueDay = dayInZone(due, s.timezone);
        await createNotification(u.id, "assignmentNew", `anew:${a!.id}`, { title: m.title, group: group.name, due: dueDay }, `/sets/${m.id}`, { push: s.notifyAssignments });
      }
    } catch (err) {
      console.error("[assignments] notify failed", err instanceof Error ? err.message : "unknown");
    }
  });
  return json({ ok: true, id: a!.id });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const group = await groupOr404(ctx);
  const aid = req.nextUrl.searchParams.get("aid") ?? "";
  if (!z.uuid().safeParse(aid).success) throw new ApiError(404, "not_found");
  await db.delete(schema.assignments).where(and(eq(schema.assignments.id, aid), eq(schema.assignments.groupId, group.id)));
  return json({ ok: true });
});
