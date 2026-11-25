import { z } from "zod";
import { db, schema } from "@/lib/db";
import { json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";
import { groupNameSchema, groupPasswordSchema } from "@/lib/server/admin-schemas";

export const POST = route(async (req) => {
  await requireAdmin();
  const { name, password } = await parseJson(req, z.object({ name: groupNameSchema, password: groupPasswordSchema }));
  const [row] = await db
    .insert(schema.groups)
    .values({ name, passwordHash: await hashPassword(password) })
    .returning({ id: schema.groups.id });
  return json({ id: row!.id });
});
