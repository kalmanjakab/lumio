import { json, route } from "@/lib/server/http";
import { destroyAdminSession } from "@/lib/server/auth";

export const POST = route(async () => {
  await destroyAdminSession();
  return json({ ok: true });
});
