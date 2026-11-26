import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError } from "./http";
import { canAccessMaterial, requireUser, type SessionUser } from "./auth";
import { AiError, aiConfigured, reserveAiCall } from "./ai";

/** Bejelentkezett felhasználó, akinek az admin bekapcsolta az AI-t, és a szerveren van AI kulcs. */
export async function requireAiUser(): Promise<SessionUser> {
  if (!aiConfigured()) throw new ApiError(503, "ai_disabled");
  const user = await requireUser();
  if (!user.aiEnabled) throw new ApiError(403, "ai_not_allowed");
  return user;
}

/** Egy kártya adatai, ha a felhasználó hozzáfér a készletéhez. */
export async function loadCardForAi(cardId: string) {
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
    .where(and(eq(schema.cards.id, cardId)));
  if (!card || !(await canAccessMaterial({ groupId: card.groupId, ownerUserId: card.ownerUserId }))) throw new ApiError(404, "not_found");
  return card;
}

/** Lefoglal egy kérést a napi keretből; ha elfogyott, 429-cel áll meg. */
export async function reserveOrThrow(userId: string, feature: string) {
  const r = await reserveAiCall(userId, feature);
  if (!r) throw new ApiError(429, "ai_daily_limit");
  return r.remaining;
}

/** Az AI hibáit egységes API-hibává alakítja. */
export function mapAiError(err: unknown): never {
  if (err instanceof ApiError) throw err;
  if (err instanceof AiError) {
    if (err.kind === "rate_limited") throw new ApiError(503, "ai_busy", { retryAfter: 60 });
    if (err.kind === "no_answer") throw new ApiError(422, "ai_no_answer");
    throw new ApiError(502, "ai_failed");
  }
  throw err;
}
