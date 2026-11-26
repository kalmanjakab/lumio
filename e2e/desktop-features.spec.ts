import { request as pwRequest } from "@playwright/test";
import { test, expect, ADMIN_PASSWORD, SEED, apiPost, randomIp, registerViaUi, seed, uniqueName } from "./helpers";

const BASE = "http://localhost:3100";
const CRON = "e2e-cron-titok-csak-tesztre-0123456789";

async function newUser(username = uniqueName("ft")) {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-real-ip": randomIp() } });
  const r = await apiPost(ctx, BASE, "/api/auth/register", { username, password: "jelszo12345" });
  expect(r.status()).toBe(200);
  return { ctx, username };
}

test.describe("Új funkciók", () => {
  test("saját készlet: létrehozás, mások nem látják, másolás működik", async ({ page }) => {
    await registerViaUi(page, uniqueName("own"));
    const created = await apiPost(page.request, BASE, "/api/me/sets", { title: "Saját szavak" });
    expect(created.status()).toBe(200);
    const { id } = (await created.json()) as { id: string };
    const save = await apiPost(
      page.request,
      BASE,
      `/api/me/sets/${id}`,
      {
        title: "Saját szavak",
        description: "",
        termLang: "en",
        definitionLang: "hu",
        groupId: null,
        gradeThresholds: null,
        cards: [
          { term: "sun", definition: "nap" },
          { term: "moon", definition: "hold" },
        ],
      },
      "PUT",
    );
    expect(save.status(), await save.text()).toBe(200);
    await page.goto(`/sets/${id}`);
    await expect(page.getByRole("heading", { name: "Saját szavak" })).toBeVisible();

    // Egy másik felhasználónak nem létezik.
    const other = await newUser();
    expect((await other.ctx.get(`/sets/${id}`)).status()).toBe(404);
    // A nyilvános készletet le tudja másolni magának.
    const copy = await apiPost(other.ctx, BASE, "/api/me/sets/copy", { materialId: seed().publicSetId });
    expect(copy.status(), await copy.text()).toBe(200);
  });

  test("ismétlés és diktálás oldal betölt, a statisztika mutatja a napi célt", async ({ page }) => {
    await registerViaUi(page, uniqueName("rev"));
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/review`);
    await expect(page.getByRole("button").first()).toBeVisible();
    await page.goto(`/sets/${s.publicSetId}/dictation`);
    await expect(page.getByRole("button", { name: "Lejátszás" })).toBeVisible();
    await page.getByLabel("Írd le, amit hallasz").fill("valami rossz");
    await page.getByRole("button", { name: "Ellenőrzés" }).click();
    await expect(page.getByText("A helyes válasz:")).toBeVisible();

    // Aktivitás rögzítése és a statisztika oldal.
    const act = await apiPost(page.request, BASE, "/api/me/activity", { items: 25, reviews: 0 });
    expect(act.status(), await act.text()).toBe(200);
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Statisztika" })).toBeVisible();
    await expect(page.getByText("Jelenlegi sorozat")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText("Ma már teljesítetted. Szép munka!")).toBeVisible();
  });

  test("offline mentés: a mentett készlet az offline oldalon gyakorolható", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}`);
    await page.getByRole("button", { name: "Offline mentés" }).click();
    await expect(page.getByRole("button", { name: "Offline mentés törlése" })).toBeVisible();
    // Megvárjuk, hogy a service worker átvegye az irányítást, aztán tényleg lekapcsoljuk a netet.
    await page.reload();
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.ready) && navigator.serviceWorker.controller), null, { timeout: 20_000 });
    await page.waitForTimeout(1000);
    await page.context().setOffline(true);
    await page.goto(`/sets/${s.publicSetId}/learn`).catch(() => {});
    await expect(page.getByText("Offline mentett készletek")).toBeVisible();
    await page.getByRole("button", { name: /Gyakorlás/ }).first().click();
    await page.getByRole("button", { name: "Tudom" }).click();
    await expect(page.getByText(/2 \/ \d+/)).toBeVisible();
    await page.context().setOffline(false);
  });

  test("tanári feladat: kiosztás, a tag látja és értesítést kap", async () => {
    const s = seed();
    const student = await newUser();
    expect((await apiPost(student.ctx, BASE, `/api/groups/${s.groupId}/unlock`, { password: SEED.groupPassword })).status()).toBe(200);
    const admin = await pwRequest.newContext({ baseURL: BASE });
    expect((await apiPost(admin, BASE, "/api/admin/login", { password: ADMIN_PASSWORD })).status()).toBe(200);
    const due = new Date(Date.now() + 3 * 86400_000).toISOString();
    const r = await apiPost(admin, BASE, `/api/admin/groups/${s.groupId}/assignments`, { materialId: s.protectedSetId, dueAt: due, note: "e2e" });
    expect(r.status(), await r.text()).toBe(200);
    // Más csoport készlete nem osztható ki.
    expect((await apiPost(admin, BASE, `/api/admin/groups/${s.groupId}/assignments`, { materialId: s.otherSetId, dueAt: due })).status()).toBe(400);

    const home = await (await student.ctx.get("/")).text();
    expect(home).toContain("Feladataid");
    await expect
      .poll(async () => ((await (await student.ctx.get("/api/me/notifications")).json()) as { items: { kind: string }[] }).items.map((i) => i.kind))
      .toContain("assignmentNew");
  });

  test("értesítések: cron csak titokkal, push kulcs nélkül kikapcsolva, a service worker érvényes", async ({ page, request }) => {
    expect((await request.get("/api/cron/notify")).status()).toBe(401);
    expect((await request.get("/api/cron/notify", { headers: { Authorization: "Bearer rossz" } })).status()).toBe(401);
    const ok = await request.get("/api/cron/notify", { headers: { Authorization: `Bearer ${CRON}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toHaveProperty("users");

    await registerViaUi(page, uniqueName("ntf"));
    const push = await page.request.get("/api/me/push");
    expect(await push.json()).toMatchObject({ enabled: false, publicKey: null });
    expect((await apiPost(page.request, BASE, "/api/me/push", { action: "test" })).status()).toBe(200);
    await page.goto("/notifications");
    await expect(page.getByText("Próbaértesítés")).toBeVisible();

    const sw = await (await request.get("/sw.js")).text();
    const parses = await page.evaluate((code) => {
      try {
        new Function(code);
        return true;
      } catch {
        return false;
      }
    }, sw);
    expect(parses).toBe(true);
  });

  test("AI magyarázat kulcs nélkül ki van kapcsolva", async () => {
    const u = await newUser();
    expect(await (await u.ctx.get("/api/ai/explain")).json()).toEqual({ enabled: false });
    expect((await apiPost(u.ctx, BASE, "/api/ai/explain", { cardId: seed().publicCardIds[0] })).status()).toBe(503);
  });
});
