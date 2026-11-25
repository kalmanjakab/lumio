import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

const NO_STORE = "private, no-store, max-age=0";

export function json(data: unknown, init?: number | ResponseInit) {
  const resInit: ResponseInit = typeof init === "number" ? { status: init } : init ?? {};
  const res = NextResponse.json(data, resInit);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}

export function error(status: number, code: string, extra?: Record<string, unknown>) {
  return json({ error: code, ...extra }, status);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** CSRF-védelem: módosító kérés csak a saját oldalunkról jöhet. */
export function assertSameOrigin(req: NextRequest | Request) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || !host) throw new ApiError(403, "bad_origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "bad_origin");
  }
  if (originHost !== host) throw new ApiError(403, "bad_origin");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ApiError(403, "bad_origin");
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().startsWith("application/json")) throw new ApiError(415, "unsupported_media_type");
  const len = Number(req.headers.get("content-length") || "0");
  if (len > 2_000_000) throw new ApiError(413, "too_large");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "validation", { issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), code: i.code })) });
  }
  return parsed.data;
}

export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Egységes hibakezelés és origin-ellenőrzés minden API-végponthoz. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      const res = await handler(req, ctx);
      res.headers.set("Cache-Control", NO_STORE);
      return res;
    } catch (err) {
      if (err instanceof ApiError) return error(err.status, err.code, err.extra);
      console.error("[api]", req.method, req.nextUrl?.pathname, err);
      return error(500, "server_error");
    }
  };
}
