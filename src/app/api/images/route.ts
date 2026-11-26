import sharp, { type OutputInfo } from "sharp";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, json, route } from "@/lib/server/http";
import { getViewer, isAdmin } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";
import { sniffImage } from "@/lib/server/image-sniff";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_IMAGES_PER_SET = 1200;

/**
 * Kártyakép feltöltése egy készlethez. Az admin a közös készletekhez, a felhasználó a saját készleteihez tölthet fel.
 * A képet újrakódoljuk (legfeljebb 800 px, WebP, metaadatok nélkül), így kicsi és nem hordoz rejtett adatot.
 */
export const POST = route(async (req) => {
  const len = Number(req.headers.get("content-length") || "0");
  if (len > MAX_BYTES + 64 * 1024) throw new ApiError(413, "too_large");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "invalid_form");
  }
  const materialId = String(form.get("materialId") || "");
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) throw new ApiError(400, "validation");
  const [m] = await db
    .select({ ownerUserId: schema.materials.ownerUserId })
    .from(schema.materials)
    .where(eq(schema.materials.id, materialId));
  if (!m) throw new ApiError(404, "not_found");
  let who: string;
  if (m.ownerUserId) {
    const v = await getViewer();
    if (v.kind !== "user" || v.user.id !== m.ownerUserId) throw new ApiError(404, "not_found");
    who = `u:${v.user.id}`;
  } else {
    if (!(await isAdmin())) throw new ApiError(401, "unauthorized");
    who = "admin";
  }
  const rl = await consume(`img:${who}`, 400, 3600);
  if (!rl.allowed) throw new ApiError(429, "too_many_requests", { retryAfter: rl.retryAfterSec });
  const [{ n }] = await db.select({ n: count() }).from(schema.cardImages).where(eq(schema.cardImages.materialId, materialId));
  if (Number(n) >= MAX_IMAGES_PER_SET) throw new ApiError(400, "too_many_images");

  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiError(400, "no_file");
  if (file.size > MAX_BYTES) throw new ApiError(413, "too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(buf)) throw new ApiError(415, "bad_type");
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(buf, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ApiError(415, "bad_type");
  }
  const [row] = await db
    .insert(schema.cardImages)
    .values({ materialId, image: out.data, width: out.info.width, height: out.info.height })
    .returning({ id: schema.cardImages.id });
  return json({ id: row!.id, width: out.info.width, height: out.info.height });
});
