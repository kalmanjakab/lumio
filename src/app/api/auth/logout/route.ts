import { json, route } from "@/lib/server/http";
import { destroyUserSession } from "@/lib/server/auth";

export const POST = route(async () => {
  await destroyUserSession();
  return json({ ok: true });
});
