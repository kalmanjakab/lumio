import { z } from "zod";
import { json, parseJson, route } from "@/lib/server/http";
import { mnemonicForCard } from "@/lib/server/ai";
import { loadCardForAi, mapAiError, requireAiUser, reserveOrThrow } from "@/lib/server/ai-access";
import { loadUserSettings } from "@/lib/server/settings";

export const maxDuration = 60;

/** AI memóriatrükk egy kártyához. */
export const POST = route(async (req) => {
  const user = await requireAiUser();
  const { cardId } = await parseJson(req, z.object({ cardId: z.uuid() }));
  const card = await loadCardForAi(cardId);
  const remaining = await reserveOrThrow(user.id, "mnemonic");
  const settings = await loadUserSettings(user.id);
  try {
    const out = await mnemonicForCard({ ...card, locale: settings.locale });
    return json({ ...out, remaining });
  } catch (err) {
    mapAiError(err);
  }
});
