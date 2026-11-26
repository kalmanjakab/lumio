import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { canAccessMaterial, requireUser } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";
import { aiEnabled, explainCard } from "@/lib/server/ai";
import { loadUserSettings } from "@/lib/server/settings";

export const maxDuration = 60;

const bodySchema = z.object({ cardId: z.uuid(), answer: z.string().max(500).nullable().optional() });

/** AI magyarázat egy kártyához (és opcionálisan a beírt válasz megítélése). Csak bejelentkezve, korlátozott számban. */
export const GET = route(async () => json({ enabled: aiEnabled() }));

export const POST = route(async (req) => {
  if (!aiEnabled()) throw new ApiError(503, "ai_disabled");
  const user = await requireUser();
  const body = await parseJson(req, bodySchema);
  const [card] = await db
    .select({
      term: schema.cards.term,
      definition: schema.cards.definition,
      termLang: schema.materials.termLang,
      definitionLang: schema.materials.definitionLang,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
    })
    .from(schema.cards)
    .innerJoin(schema.materials, eq(schema.materials.id, schema.cards.materialId))
    .where(and(eq(schema.cards.id, body.cardId)));
  if (!card || !(await canAccessMaterial({ groupId: card.groupId, ownerUserId: card.ownerUserId }))) throw new ApiError(404, "not_found");

  const hour = await consume(`ai:${user.id}`, 40, 3600);
  const day = await consume(`ai-day:${user.id}`, 150, 86400);
  if (!hour.allowed || !day.allowed) throw new ApiError(429, "rate_limited", { retryAfter: Math.max(hour.retryAfterSec, day.retryAfterSec) });

  const settings = await loadUserSettings(user.id);
  try {
    const out = await explainCard({ ...card, answer: body.answer?.trim() || null, locale: settings.locale });
    if (!out) throw new ApiError(422, "ai_no_answer");
    return json(out);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new ApiError(429, "rate_limited", { retryAfter: 60 });
    if (err instanceof Anthropic.APIError) {
      console.error("[ai] api error", err.status);
      throw new ApiError(502, "ai_failed");
    }
    throw err;
  }
});
