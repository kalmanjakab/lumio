import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { json, route } from "@/lib/server/http";
import { getViewer, writeGuestGrants } from "@/lib/server/auth";

// A felhasználó eltávolítja (lezárja) a csoportot a saját hozzáférései közül.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const v = await getViewer();
  if (v.kind === "user") {
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      await db.delete(schema.userGroupAccess).where(and(eq(schema.userGroupAccess.userId, v.user.id), eq(schema.userGroupAccess.groupId, id)));
    }
  } else {
    const { [id]: _removed, ...rest } = v.grants;
    await writeGuestGrants(rest);
  }
  return json({ ok: true });
});
