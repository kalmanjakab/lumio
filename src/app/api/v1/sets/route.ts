// Külső (AI) agentek ezen a végponton hozhatnak létre kártyakészletet.
// Hitelesítés: Authorization: Bearer <IMPORT_API_KEY>. Leírás: docs/IMPORT-API.md
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { clientIp } from "@/lib/server/http";
import { consume, peek } from "@/lib/server/ratelimit";
import {
  IMPORT_MAX_BODY_BYTES,
  IMPORT_MAX_CARDS,
  bearerToken,
  importContentHash,
  importRequestSchema,
  validIdempotencyKey,
} from "@/lib/import-api";

export const dynamic = "force-dynamic";

const DUPLICATE_WINDOW_HOURS = 24;
const AUTH_FAIL_LIMIT = 10; // hibás kulcs / IP / 15 perc
const AUTH_FAIL_WINDOW = 15 * 60;
const IMPORT_LIMIT = 60; // sikeres hívás / óra (összesen)
const IMPORT_WINDOW = 60 * 60;

type ErrorBody = { ok: false; error: string; message: string; [k: string]: unknown };

function reply(status: number, body: Record<string, unknown>, headers?: Record<string, string>) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
  return res;
}

function fail(status: number, error: string, message: string, extra?: Record<string, unknown>, headers?: Record<string, string>) {
  const body: ErrorBody = { ok: false, error, message, ...extra };
  return reply(status, body, headers);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** A beállított kulcs(ok). Vesszővel elválasztva több is lehet (kulcscseréhez). Min. 32 karakter. */
function configuredKeys(): Buffer[] {
  return (process.env.IMPORT_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 32)
    .map(sha256);
}

/** Állandó idejű összehasonlítás a hash-eken, hogy az időzítésből ne lehessen a kulcsra következtetni. */
function keyMatches(token: string, keys: Buffer[]): boolean {
  const t = sha256(token);
  let ok = false;
  for (const k of keys) ok = timingSafeEqual(t, k) || ok;
  return ok;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

class Conflict extends Error {
  constructor(
    public status: number,
    public code: string,
    public msg: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function POST(req: NextRequest) {
  try {
    const keys = configuredKeys();
    if (!keys.length) return fail(503, "api_disabled", "The import API is not configured on this server.");

    const ip = clientIp(req);
    const failKey = `api-auth-fail:${ip}`;
    const failState = await peek(failKey, AUTH_FAIL_LIMIT, AUTH_FAIL_WINDOW);
    if (!failState.allowed) {
      return fail(429, "too_many_requests", "Too many failed authentication attempts. Try again later.", { retryAfter: failState.retryAfterSec }, { "Retry-After": String(failState.retryAfterSec) });
    }

    const token = bearerToken(req.headers.get("authorization"));
    if (!token || !keyMatches(token, keys)) {
      await consume(failKey, AUTH_FAIL_LIMIT, AUTH_FAIL_WINDOW);
      return fail(401, "unauthorized", "Missing or invalid API key. Send it as: Authorization: Bearer <key>.", undefined, {
        "WWW-Authenticate": 'Bearer realm="flashly-import"',
      });
    }

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json")) return fail(415, "unsupported_media_type", "Content-Type must be application/json.");

    const declared = Number(req.headers.get("content-length") || "0");
    if (declared > IMPORT_MAX_BODY_BYTES) return fail(413, "payload_too_large", `The request body must be at most ${IMPORT_MAX_BODY_BYTES} bytes.`);
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > IMPORT_MAX_BODY_BYTES) {
      return fail(413, "payload_too_large", `The request body must be at most ${IMPORT_MAX_BODY_BYTES} bytes.`);
    }

    const idemHeader = req.headers.get("idempotency-key");
    if (idemHeader !== null && !validIdempotencyKey(idemHeader)) {
      return fail(400, "invalid_idempotency_key", "Idempotency-Key must be 8–200 visible ASCII characters.");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, "invalid_json", "The request body is not valid JSON.");
    }
    const parsed = importRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "validation_failed", `The JSON does not match the expected format (max ${IMPORT_MAX_CARDS} cards).`, {
        issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })),
      });
    }
    const input = parsed.data;

    const rate = await consume("api-import", IMPORT_LIMIT, IMPORT_WINDOW);
    if (!rate.allowed) {
      return fail(429, "too_many_requests", "Import rate limit reached. Try again later.", { retryAfter: rate.retryAfterSec }, { "Retry-After": String(rate.retryAfterSec) });
    }

    const contentHash = importContentHash(input);
    const idemHash = idemHeader ? createHash("sha256").update(`idem:${idemHeader}`).digest("hex") : null;

    let result: { setId: string; cardCount: number; duplicate: boolean };
    try {
      result = await db.transaction(async (tx) => {
        // Az azonos tartalmú, egyszerre érkező kéréseket sorba állítjuk.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${contentHash}, 0))`);

        if (idemHash) {
          const [prev] = await tx.select().from(schema.apiImports).where(eq(schema.apiImports.idempotencyKeyHash, idemHash));
          if (prev) {
            if (prev.contentHash !== contentHash) {
              throw new Conflict(422, "idempotency_conflict", "This Idempotency-Key was already used with a different request body.");
            }
            if (!prev.materialId) {
              throw new Conflict(409, "idempotency_key_reused", "This Idempotency-Key was used for a set that has since been deleted. Use a new key.");
            }
            return { setId: prev.materialId, cardCount: prev.cardCount, duplicate: true };
          }
        }

        const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 3600_000);
        const [dup] = await tx
          .select({ materialId: schema.apiImports.materialId })
          .from(schema.apiImports)
          .where(and(eq(schema.apiImports.contentHash, contentHash), gt(schema.apiImports.createdAt, since), isNotNull(schema.apiImports.materialId)))
          .limit(1);
        if (dup?.materialId) {
          throw new Conflict(409, "duplicate", `An identical set was already imported in the last ${DUPLICATE_WINDOW_HOURS} hours.`, { setId: dup.materialId });
        }

        if (input.groupId) {
          const g = await tx.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.id, input.groupId));
          if (!g.length) throw new Conflict(400, "group_not_found", "No group exists with the given groupId.");
        }

        const [material] = await tx
          .insert(schema.materials)
          .values({
            title: input.title,
            description: input.description,
            groupId: input.groupId,
            type: "flashcards",
            termLang: input.termLang,
            definitionLang: input.definitionLang,
          })
          .returning({ id: schema.materials.id });
        const setId = material!.id;

        const rows = input.cards.map((c, i) => ({ materialId: setId, term: c.term, definition: c.definition, position: i }));
        for (let i = 0; i < rows.length; i += 400) {
          await tx.insert(schema.cards).values(rows.slice(i, i + 400));
        }

        await tx.insert(schema.apiImports).values({ idempotencyKeyHash: idemHash, contentHash, materialId: setId, cardCount: rows.length });
        return { setId, cardCount: rows.length, duplicate: false };
      });
    } catch (err) {
      if (err instanceof Conflict) return fail(err.status, err.code, err.msg, err.extra);
      if (isUniqueViolation(err)) return fail(409, "idempotency_conflict", "A request with this Idempotency-Key is already being processed.");
      throw err;
    }

    return reply(result.duplicate ? 200 : 201, {
      ok: true,
      setId: result.setId,
      cardCount: result.cardCount,
      url: `/sets/${result.setId}`,
      duplicate: result.duplicate,
    });
  } catch (err) {
    // A kérés fejléceit (benne a kulccsal) szándékosan nem naplózzuk.
    console.error("[api/v1/sets]", err instanceof Error ? err.message : "unknown error");
    return fail(500, "server_error", "Unexpected server error. The set was not created.");
  }
}

function methodNotAllowed() {
  return fail(405, "method_not_allowed", "Use POST.", undefined, { Allow: "POST" });
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
