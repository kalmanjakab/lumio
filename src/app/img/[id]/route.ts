import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canAccessMaterial, isAdmin } from "@/lib/server/auth";

// Kártyakép kiszolgálása. Csak az kapja meg, aki a készletet is láthatja (zárt csoportnál a jelszó kell).
// A kép tartalma az azonosítóhoz kötött (csere = új azonosító), ezért a böngésző sokáig tárolhatja, de csak magának.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
    const [row] = await db
      .select({ image: schema.cardImages.image, groupId: schema.materials.groupId, ownerUserId: schema.materials.ownerUserId })
      .from(schema.cardImages)
      .innerJoin(schema.materials, eq(schema.materials.id, schema.cardImages.materialId))
      .where(eq(schema.cardImages.id, id));
    if (!row) return notFound();
    const allowed = (await canAccessMaterial(row)) || (!row.ownerUserId && (await isAdmin()));
    if (!allowed) return notFound();
    // Csoporthoz kötött képet nem tárolunk hosszan: a hozzáférés visszavonható.
    const cache = row.groupId ? "private, no-store" : "private, max-age=2592000, immutable";
    return new NextResponse(new Uint8Array(row.image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return notFound();
  }
}
