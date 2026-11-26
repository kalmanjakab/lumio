import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { canAccessMaterial } from "@/lib/server/auth";
import { studyTipsForSet } from "@/lib/server/ai";
import { mapAiError, requireAiUser, reserveOrThrow } from "@/lib/server/ai-access";
import { loadUserSettings } from "@/lib/server/settings";

export const maxDuration = 60;

/** Személyre szabott AI tanulási tippek egy készlethez, a felhasználó legnehezebb kártyái alapján. */
export const POST = route(async (req) => {
  const user = await requireAiUser();
  const { materialId } = await parseJson(req, z.object({ materialId: z.uuid() }));
  const [m] = await db
    .select({
      title: schema.materials.title,
      termLang: schema.materials.termLang,
      definitionLang: schema.materials.definitionLang,
      groupId: schema.materials.groupId,
      ownerUserId: schema.materials.ownerUserId,
    })
    .from(schema.materials)
    .where(eq(schema.materials.id, materialId));
  if (!m || !(await canAccessMaterial(m))) throw new ApiError(404, "not_found");

  // Kártyánként: hányszor felejtette el (FSRS) vagy rontotta el (tanulás mód), és ismeri-e már.
  const r = await db.execute<{ term: string; definition: string; lapses: number; studied: boolean; known: boolean }>(sql`
    select c.term, c.definition,
      (coalesce(cr.lapses, 0) + coalesce(cp.wrong_count, 0))::int as lapses,
      (cr.state is not null and cr.state <> 0 or coalesce(cp.level, 0) > 0) as studied,
      (cr.state = 2 or coalesce(cp.level, 0) >= 2) as known
    from cards c
    left join card_reviews cr on cr.user_id = ${user.id} and cr.card_id = c.id
    left join card_progress cp on cp.user_id = ${user.id} and cp.card_id = c.id
    where c.material_id = ${materialId}
    order by c.position`);
  const rows = r.rows;
  if (!rows.length) throw new ApiError(422, "empty_set");
  const forgotten = rows.filter((x) => Number(x.lapses) > 0).sort((a, b) => Number(b.lapses) - Number(a.lapses));
  // Ha még nincs elrontott kártya, a még nem ismertekből adunk néhányat.
  const hard = (forgotten.length ? forgotten : rows.filter((x) => !x.known)).slice(0, 6);

  const remaining = await reserveOrThrow(user.id, "tips");
  const settings = await loadUserSettings(user.id);
  try {
    const out = await studyTipsForSet({
      title: m.title,
      termLang: m.termLang,
      definitionLang: m.definitionLang,
      cardCount: rows.length,
      studiedCount: rows.filter((x) => x.studied).length,
      knownCount: rows.filter((x) => x.known).length,
      hard: hard.map((x) => ({ term: x.term, definition: x.definition, lapses: Number(x.lapses) })),
      locale: settings.locale,
    });
    return json({ ...out, remaining });
  } catch (err) {
    mapAiError(err);
  }
});
