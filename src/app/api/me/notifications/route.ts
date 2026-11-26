import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

/** Az appon belüli értesítések: ?count=1 esetén csak az olvasatlanok száma. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  if (req.nextUrl.searchParams.get("count")) return json({ unread: Number(n) });
  const rows = await db
    .select({
      id: schema.notifications.id,
      kind: schema.notifications.kind,
      params: schema.notifications.params,
      url: schema.notifications.url,
      createdAt: schema.notifications.createdAt,
      readAt: schema.notifications.readAt,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);
  return json({ unread: Number(n), items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), read: r.readAt !== null, readAt: undefined })) });
});

/** Olvasottnak jelölés: adott azonosítók, vagy mind. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseJson(req, z.object({ ids: z.array(z.uuid()).max(100).optional(), all: z.literal(true).optional() }));
  const where = body.all
    ? and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))
    : body.ids?.length
      ? and(eq(schema.notifications.userId, user.id), inArray(schema.notifications.id, body.ids))
      : null;
  if (where) await db.update(schema.notifications).set({ readAt: new Date() }).where(where);
  return json({ ok: true });
});
