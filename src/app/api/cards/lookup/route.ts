import { z } from "zod";
import { json, parseJson, route } from "@/lib/server/http";
import { lookupCards } from "@/lib/server/data";

export const POST = route(async (req) => {
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.string().max(40)).max(500) }));
  return json({ cards: await lookupCards(ids) });
});
