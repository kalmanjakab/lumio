import { z } from "zod";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { ApiError, json, parseJson, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { consume } from "@/lib/server/ratelimit";

const MAX_BYTES = 2 * 1024 * 1024;

function sniff(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

// A profilkép csak a tulajdonosának látszik: csak a saját sessionnel kérhető le, és soha nem kerül gyorsítótárba.
export async function GET() {
  try {
    const user = await requireUser();
    const [row] = await db.select({ image: schema.userAvatars.image }).from(schema.userAvatars).where(eq(schema.userAvatars.userId, user.id));
    if (!row) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return new NextResponse(new Uint8Array(row.image), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
    });
  } catch {
    return new NextResponse(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
}

// Feltöltés: max. 2 MB, csak JPEG/PNG/WebP (a fájl tartalma alapján), 256x256-ra újrakódolva, metaadatok (EXIF) nélkül.
export const POST = route(async (req) => {
  const user = await requireUser();
  const rl = await consume(`avatar:${user.id}`, 20, 3600);
  if (!rl.allowed) throw new ApiError(429, "too_many", { retryAfter: rl.retryAfterSec });
  const len = Number(req.headers.get("content-length") || "0");
  if (len > MAX_BYTES + 64 * 1024) throw new ApiError(413, "too_large");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "invalid_form");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiError(400, "no_file");
  if (file.size > MAX_BYTES) throw new ApiError(413, "too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniff(buf)) throw new ApiError(415, "bad_type");
  let out: Buffer;
  try {
    out = await sharp(buf, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ApiError(415, "bad_type");
  }
  await db
    .insert(schema.userAvatars)
    .values({ userId: user.id, image: out })
    .onConflictDoUpdate({ target: schema.userAvatars.userId, set: { image: out, updatedAt: sql`now()` } });
  await db
    .update(schema.users)
    .set({ hasAvatarImage: true, avatarPreset: null, avatarVersion: sql`${schema.users.avatarVersion} + 1` })
    .where(eq(schema.users.id, user.id));
  return json({ ok: true });
});

// Előre elkészített avatar választása, vagy a kép eltávolítása (preset: null).
export const PUT = route(async (req) => {
  const user = await requireUser();
  const { preset } = await parseJson(req, z.object({ preset: z.string().regex(/^a([1-9]|1[0-2])$/).nullable() }));
  await db.delete(schema.userAvatars).where(eq(schema.userAvatars.userId, user.id));
  await db
    .update(schema.users)
    .set({ avatarPreset: preset, hasAvatarImage: false, avatarVersion: sql`${schema.users.avatarVersion} + 1` })
    .where(eq(schema.users.id, user.id));
  return json({ ok: true });
});
