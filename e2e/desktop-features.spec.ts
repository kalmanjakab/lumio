import { request as pwRequest } from "@playwright/test";
import pg from "pg";
import { test, expect, ADMIN_PASSWORD, ADMIN_SLUG, SEED, apiPost, randomIp, registerViaUi, seed, uniqueName } from "./helpers";

const BASE = "http://localhost:3100";
const TEST_DB = process.env.E2E_DATABASE_URL || "postgres://flashly:flashly@localhost:5432/flashly_test";
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

  test("AI: alapból ki, admin felhasználónként kapcsolja, értesítés, felugró ablak, napi 20-as korlát", async ({ page }) => {
    const s = seed();
    const db = new pg.Pool({ connectionString: TEST_DB, max: 1 });
    try {
      const username = uniqueName("ai");
      await registerViaUi(page, username);
      const { rows } = await db.query("select id from users where username = $1", [username]);
      const uid = rows[0].id as string;

      // Alapból nincs AI: a gombok nem látszanak, az API 403-at ad.
      expect(await (await page.request.get("/api/ai/explain")).json()).toEqual({ enabled: false });
      expect((await apiPost(page.request, BASE, "/api/ai/explain", { cardId: s.publicCardIds[0] })).status()).toBe(403);
      expect((await apiPost(page.request, BASE, "/api/ai/tips", { materialId: s.publicSetId })).status()).toBe(403);
      await page.goto(`/sets/${s.publicSetId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "AI tanulási tippek" })).toHaveCount(0);

      // Admin bekapcsolja a felületen.
      const adminCtx = await page.context().browser()!.newContext({ extraHTTPHeaders: { "x-real-ip": randomIp() } });
      const adminPage = await adminCtx.newPage();
      expect((await apiPost(adminCtx.request, BASE, "/api/admin/login", { password: ADMIN_PASSWORD })).status()).toBe(200);
      await adminPage.goto(`/${ADMIN_SLUG}/users`);
      await expect(adminPage.getByTestId(`ai-usage-${username}`)).toContainText("0 az elmúlt 7 napban");
      await adminPage.getByRole("switch", { name: `AI: ${username}` }).check();
      await expect(adminPage.getByText(`AI bekapcsolva: ${username}`)).toBeVisible();

      // Következő belépéskor felugró ablak + értesítés.
      await page.goto("/");
      const dialog = page.getByRole("dialog", { name: "Bekapcsoltuk neked az AI funkciókat" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Szuper, kipróbálom" }).click();
      await expect(dialog).toBeHidden();
      const notif = await db.query("select kind from notifications where user_id = $1 and kind = 'aiEnabled'", [uid]);
      expect(notif.rowCount).toBe(1);
      await page.reload();
      await expect(page.getByRole("dialog", { name: "Bekapcsoltuk neked az AI funkciókat" })).toHaveCount(0);

      // A gombok megjelennek.
      expect(await (await page.request.get("/api/ai/explain")).json()).toEqual({ enabled: true });
      await page.goto(`/sets/${s.publicSetId}`);
      await expect(page.getByRole("button", { name: "AI tanulási tippek" })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Memóriatrükk:/ }).first()).toBeVisible();

      // Egy hívás (a hamis kulcs miatt a Groq nem válaszol), de a keretből levonódik és az admin látja.
      const r = await apiPost(page.request, BASE, "/api/ai/mnemonic", { cardId: s.publicCardIds[0] });
      expect([502, 503]).toContain(r.status());
      const st = await (await page.request.get("/api/ai/status")).json();
      expect(st).toMatchObject({ enabled: true, limit: 20, remaining: 19 });
      await adminPage.reload();
      await expect(adminPage.getByTestId(`ai-usage-${username}`)).toContainText("1 az elmúlt 7 napban · 1/20");

      // Napi 20 kérés után 429.
      await db.query("insert into ai_usage (user_id, feature) select $1, 'explain' from generate_series(1, 19)", [uid]);
      const over = await apiPost(page.request, BASE, "/api/ai/explain", { cardId: s.publicCardIds[0] });
      expect(over.status()).toBe(429);
      expect((await over.json()).error).toBe("ai_daily_limit");

      // Kikapcsolás után újra 403.
      await adminPage.getByRole("switch", { name: `AI: ${username}` }).uncheck();
      await expect(adminPage.getByText(`AI kikapcsolva: ${username}`)).toBeVisible();
      expect((await apiPost(page.request, BASE, "/api/ai/explain", { cardId: s.publicCardIds[0] })).status()).toBe(403);
      await adminCtx.close();
    } finally {
      await db.end();
    }
  });

  test("AI: más felhasználó nem kapcsolhatja magának, vendég nem éri el", async () => {
    const u = await newUser();
    expect((await apiPost(u.ctx, BASE, "/api/admin/users/00000000-0000-0000-0000-000000000000", { aiEnabled: true }, "PATCH")).status()).toBe(401);
    await apiPost(u.ctx, BASE, "/api/me/settings", { aiEnabled: true, aiWelcome: true }, "PATCH");
    expect(await (await u.ctx.get("/api/ai/explain")).json()).toEqual({ enabled: false });
    const guest = await pwRequest.newContext({ baseURL: BASE });
    expect((await apiPost(guest, BASE, "/api/ai/explain", { cardId: seed().publicCardIds[0] })).status()).toBe(401);
  });
});
