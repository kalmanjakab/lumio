import { ApiError, clientIp, json, parseJson, route } from "@/lib/server/http";
import { consume, peek } from "@/lib/server/ratelimit";
import { verifyPassword } from "@/lib/server/password";
import { createAdminSession } from "@/lib/server/auth";
import { z } from "zod";

const WINDOW = 15 * 60;

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const [ipRl, globalRl] = await Promise.all([peek(`admin:ip:${ip}`, 5, WINDOW), peek("admin:global", 30, 3600)]);
  if (!ipRl.allowed || !globalRl.allowed) {
    throw new ApiError(429, "too_many", { retryAfter: Math.max(ipRl.retryAfterSec, globalRl.retryAfterSec) });
  }
  const { password } = await parseJson(req, z.object({ password: z.string().min(1).max(200) }));
  const stored = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!stored) throw new ApiError(503, "admin_not_configured");
  const ok = await verifyPassword(stored, password);
  if (!ok) {
    await Promise.all([consume(`admin:ip:${ip}`, 5, WINDOW), consume("admin:global", 30, 3600)]);
    throw new ApiError(401, "invalid_credentials");
  }
  await createAdminSession();
  return json({ ok: true });
});
