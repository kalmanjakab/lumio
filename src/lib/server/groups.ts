import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { readGuestGrantsForMigration, writeGuestGrants } from "./auth";

/** Vendégként megnyitott csoportok átvétele a fiókba belépéskor/regisztrációkor. */
export async function migrateGuestGrants(userId: string) {
  const grants = await readGuestGrantsForMigration();
  const ids = Object.keys(grants);
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: schema.groups.id, accessVersion: schema.groups.accessVersion })
    .from(schema.groups)
    .where(inArray(schema.groups.id, ids));
  const valid = rows.filter((r) => grants[r.id] === r.accessVersion);
  if (valid.length) {
    await db
      .insert(schema.userGroupAccess)
      .values(valid.map((r) => ({ userId, groupId: r.id, accessVersion: r.accessVersion })))
      .onConflictDoUpdate({
        target: [schema.userGroupAccess.userId, schema.userGroupAccess.groupId],
        set: { accessVersion: sql`excluded.access_version`, unlockedAt: sql`now()` },
      });
  }
  await writeGuestGrants({});
}
