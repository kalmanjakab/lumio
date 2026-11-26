import { z } from "zod";
import { json, parseJson, route } from "@/lib/server/http";
import { getViewer } from "@/lib/server/auth";
import { aiConfigured, explainCard } from "@/lib/server/ai";
import { loadCardForAi, mapAiError, requireAiUser, reserveOrThrow } from "@/lib/server/ai-access";
import { loadUserSettings } from "@/lib/server/settings";

export const maxDuration = 60;

const bodySchema = z.object({ cardId: z.uuid(), answer: z.string().max(500).nullable().optional() });

/** Elérhető-e az AI ennek a nézőnek. */
export const GET = route(async () => {
  const v = await getViewer();
  return json({ enabled: aiConfigured() && v.kind === "user" && v.user.aiEnabled });
});

/** AI magyarázat egy kártyához (és opcionálisan a beírt válasz megítélése). */
export const POST = route(async (req) => {
  const user = await requireAiUser();
  const body = await parseJson(req, bodySchema);
  const card = await loadCardForAi(body.cardId);
  const remaining = await reserveOrThrow(user.id, "explain");
  const settings = await loadUserSettings(user.id);
  try {
    const out = await explainCard({ ...card, answer: body.answer?.trim() || null, locale: settings.locale });
    return json({ ...out, remaining });
  } catch (err) {
    mapAiError(err);
  }
});
