import { z } from "zod";
import { json, parseJson, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { thresholdsSchema } from "@/lib/server/admin-schemas";
import { setGlobalThresholds } from "@/lib/server/app-settings";

export const PUT = route(async (req) => {
  await requireAdmin();
  const { gradeThresholds } = await parseJson(req, z.object({ gradeThresholds: thresholdsSchema }));
  await setGlobalThresholds(gradeThresholds);
  return json({ ok: true });
});
