import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runNotifyCron } from "@/lib/server/cron-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Óránként hívja a Vercel Cron (vercel.json). Csak a CRON_SECRET-tel aláírt hívást fogadja el. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const report = await runNotifyCron();
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron:notify]", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
