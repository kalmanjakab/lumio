import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { GradeThresholds } from "@/lib/db/schema";
import { DEFAULT_THRESHOLDS, isValidThresholds } from "@/lib/grading-scale";

export async function getGlobalThresholds(): Promise<GradeThresholds> {
  const rows = await db.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, "gradeThresholds"));
  const v = rows[0]?.value as GradeThresholds | undefined;
  return v && isValidThresholds(v) ? v : DEFAULT_THRESHOLDS;
}

export async function setGlobalThresholds(t: GradeThresholds) {
  await db
    .insert(schema.appSettings)
    .values({ key: "gradeThresholds", value: t })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: t } });
}
