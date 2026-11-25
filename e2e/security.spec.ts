import { expect, test, request as pwRequest } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_SLUG, SEED, apiPost, randomIp, seed, uniqueName } from "./helpers";

const BASE = "http://localhost:3100";
// Egyedi szavak a védett készletből (az „apple” szó pl. az apple-mobile-web-app metacímkében is szerepel).
const SECRETS = ["Titkos Unit 3", "abundant", "bőséges", "journey", "utazás", "időjárás", "óvatos, gondos", "kölcsönkér", "feladni, abbahagyni", "careful"];

async function newUser(username = uniqueName("sec")) {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-real-ip": randomIp() } });
  const r = await apiPost(ctx, BASE, "/api/auth/register", { username, password: "jelszo12345" });
  expect(r.status()).toBe(200);
  return { ctx, username };
}

async function adminCtx() {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const r = await apiPost(ctx, BASE, "/api/admin/login", { password: ADMIN_PASSWORD });
  expect(r.status()).toBe(200);
  return ctx;
}

test.describe("Védett csoport tartalma jogosultság nélkül", () => {
  test("a készlet oldala és a módok átirányítanak, a forrásban nincs tartalom", async ({ request }) => {
    const s = seed();
    for (const path of ["", "/flashcards", "/learn", "/test", "/match"]) {
      const res = await request.get(`/sets/${s.protectedSetId}${path}`, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers()["location"]).toContain(`/groups/${s.groupId}`);
      const body = await res.text();
      for (const secret of SECRETS) expect(body, path).not.toContain(secret);
    }
    // Az átirányítás célja (a csoport zárt oldala) sem tartalmaz semmit a készletből.
    const group = await request.get(`/groups/${s.groupId}`);
    const html = await group.text();
    expect(html).toContain("Angol");
    for (const secret of SECRETS) expect(html).not.toContain(secret);
  });

  test("a védett kártyák API-n át sem kérhetők le", async ({ request }) => {
    const s = seed();
    const r = await apiPost(request, BASE, "/api/cards/lookup", { ids: s.protectedCardIds });
    expect(r.status()).toBe(200);
    expect((await r.json()).cards).toEqual([]);
    const pub = await apiPost(request, BASE, "/api/cards/lookup", { ids: s.publicCardIds.slice(0, 2) });
    expect((await pub.json()).cards).toHaveLength(2);
  });

  test("a keresés nem talál védett tartalmat", async ({ request }) => {
    const res = await request.get(`/search?q=${encodeURIComponent("abundant")}`);
    const html = await res.text();
    expect(html).not.toContain("Titkos Unit 3");
    expect(html).not.toContain("bőséges");
  });

  test("hamisított vendég-süti nem ad hozzáférést", async () => {
    const s = seed();
    const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Cookie: `flashly_guest=eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ g: { [s.groupId]: 1 } })).toString("base64url")}.invalidsig` } });
    const res = await ctx.get(`/sets/${s.protectedSetId}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });

  test("fiókos felhasználó: jelszó nélkül 403, jelszóval hozzáfér, jelszócsere után újra elzárva", async () => {
    const s = seed();
    const { ctx } = await newUser();
    const forbidden = await apiPost(ctx, BASE, "/api/me/progress", { materialId: s.protectedSetId, updates: [{ cardId: s.protectedCardIds[0], level: 3, streak: 2, wrongDelta: 0 }] });
    expect(forbidden.status()).toBe(403);
    const star = await apiPost(ctx, BASE, "/api/me/starred", { materialId: s.protectedSetId, cardId: s.protectedCardIds[0], starred: true });
    expect(star.status()).toBe(403);

    const wrong = await apiPost(ctx, BASE, `/api/groups/${s.groupId}/unlock`, { password: "rossz" });
    expect(wrong.status()).toBe(401);
    const ok = await apiPost(ctx, BASE, `/api/groups/${s.groupId}/unlock`, { password: SEED.groupPassword });
    expect(ok.status()).toBe(200);
    const page = await ctx.get(`/sets/${s.protectedSetId}`);
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain("abundant");
    expect(page.headers()["cache-control"]).toMatch(/no-store/);
    const allowed = await apiPost(ctx, BASE, "/api/me/progress", { materialId: s.protectedSetId, updates: [{ cardId: s.protectedCardIds[0], level: 3, streak: 2, wrongDelta: 0 }] });
    expect(allowed.status()).toBe(200);
    // Más készlet kártyáját nem lehet ennek a készletnek a nevében menteni.
    const mixed = await apiPost(ctx, BASE, "/api/me/progress", { materialId: s.protectedSetId, updates: [{ cardId: s.publicCardIds[0], level: 1, streak: 0, wrongDelta: 0 }] });
    expect(mixed.status()).toBe(403);

    // Az admin új jelszót állít be: a korábbi feloldás érvényét veszti.
    const admin = await adminCtx();
    expect((await apiPost(admin, BASE, `/api/admin/groups/${s.groupId}/password`, { password: "ujjelszo1" })).status()).toBe(200);
    const after = await ctx.get(`/sets/${s.protectedSetId}`, { maxRedirects: 0 });
    expect(after.status()).toBe(307);
    // Visszaállítjuk az eredeti jelszót a többi teszthez.
    expect((await apiPost(admin, BASE, `/api/admin/groups/${s.groupId}/password`, { password: SEED.groupPassword })).status()).toBe(200);
  });

  test("„Mindenki kizárása” a vendég hozzáférést is megszünteti", async () => {
    const s = seed();
    const guest = await pwRequest.newContext({ baseURL: BASE });
    expect((await apiPost(guest, BASE, `/api/groups/${s.otherGroupId}/unlock`, { password: SEED.otherGroupPassword })).status()).toBe(200);
    expect((await guest.get(`/sets/${s.otherSetId}`, { maxRedirects: 0 })).status()).toBe(200);
    const admin = await adminCtx();
    expect((await apiPost(admin, BASE, `/api/admin/groups/${s.otherGroupId}/revoke`, {})).status()).toBe(200);
    expect((await guest.get(`/sets/${s.otherSetId}`, { maxRedirects: 0 })).status()).toBe(307);
  });
});

test.describe("Más felhasználó adatai", () => {
  test("más teszteredménye nem nyitható meg, saját adat csak sessionnel", async () => {
    const s = seed();
    const a = await newUser();
    const save = await apiPost(a.ctx, BASE, "/api/me/test-results", {
      materialId: s.publicSetId,
      correct: 1,
      total: 1,
      percent: 100,
      grade: 5,
      durationMs: 1000,
      details: { questions: [{ cardId: s.publicCardIds[0], type: "mc", prompt: "dog", correctAnswer: "kutya", userAnswer: "kutya", correct: true }] },
    });
    expect(save.status()).toBe(200);
    const { id } = await save.json();
    expect((await a.ctx.get(`/sets/${s.publicSetId}/tests/${id}`)).status()).toBe(200);
    const b = await newUser();
    expect((await b.ctx.get(`/sets/${s.publicSetId}/tests/${id}`)).status()).toBe(404);
    const anon = await pwRequest.newContext({ baseURL: BASE });
    expect((await anon.get(`/sets/${s.publicSetId}/tests/${id}`)).status()).toBe(404);
  });

  test("a /api/me végpontok session nélkül 401-et adnak", async ({ request }) => {
    const s = seed();
    const calls: [string, string, unknown][] = [
      ["/api/me/settings", "PATCH", { theme: "dark" }],
      ["/api/me/progress", "POST", { materialId: s.publicSetId, updates: [] }],
      ["/api/me/starred", "POST", { materialId: s.publicSetId, cardId: s.publicCardIds[0], starred: true }],
      ["/api/me/study-state", "PUT", { materialId: s.publicSetId, mode: "learn", state: {} }],
      ["/api/me/mode-settings", "PUT", { materialId: s.publicSetId, mode: "learn", settings: {} }],
      ["/api/me/test-results", "POST", {}],
      ["/api/me/match-times", "POST", { materialId: s.publicSetId, ms: 5000 }],
      ["/api/me/password", "POST", { currentPassword: "x", newPassword: "yyyyyyyy" }],
      ["/api/me/account", "DELETE", { password: "x" }],
      ["/api/me/import-guest", "POST", { items: [] }],
    ];
    for (const [path, method, body] of calls) {
      const r = await apiPost(request, BASE, path, body, method);
      expect(r.status(), `${method} ${path}`).toBe(401);
    }
    expect((await request.get("/api/me/avatar")).status()).toBe(401);
  });

  test("profilkép: csak kép, legfeljebb 2 MB", async () => {
    const { ctx } = await newUser();
    const bad = await ctx.post("/api/me/avatar", { headers: { Origin: BASE }, multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } } });
    expect(bad.status()).toBe(415);
    const big = await ctx.post("/api/me/avatar", { headers: { Origin: BASE }, multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 0xff) } } });
    expect(big.status()).toBe(413);
  });
});

test.describe("Admin", () => {
  test("az admin végpontok session nélkül elutasítanak", async ({ request }) => {
    const s = seed();
    const calls: [string, string, unknown][] = [
      ["/api/admin/groups", "POST", { name: "x", password: "xxxx" }],
      [`/api/admin/groups/${s.groupId}`, "PATCH", { name: "x" }],
      [`/api/admin/groups/${s.groupId}`, "DELETE", {}],
      [`/api/admin/groups/${s.groupId}/password`, "POST", { password: "xxxx" }],
      [`/api/admin/groups/${s.groupId}/revoke`, "POST", {}],
      ["/api/admin/materials", "POST", { title: "x", groupId: null }],
      [`/api/admin/materials/${s.publicSetId}`, "PUT", {}],
      [`/api/admin/materials/${s.publicSetId}`, "DELETE", {}],
      ["/api/admin/settings", "PUT", { gradeThresholds: { g5: 90, g4: 80, g3: 70, g2: 60 } }],
      ["/api/admin/users/00000000-0000-4000-8000-000000000000", "PATCH", { tempPassword: "xxxxxxxx" }],
      ["/api/admin/users/00000000-0000-4000-8000-000000000000", "DELETE", {}],
    ];
    for (const [path, method, body] of calls) {
      const r = await apiPost(request, BASE, path, body, method);
      expect(r.status(), `${method} ${path}`).toBe(401);
    }
    // Felhasználói session sem elég az admin végpontokhoz.
    const { ctx } = await newUser();
    expect((await apiPost(ctx, BASE, "/api/admin/groups", { name: "x", password: "xxxx" })).status()).toBe(401);
  });

  test("a belső admin útvonal nem érhető el, a titkos útvonal noindex, a robots.txt nem árulja el", async ({ request }) => {
    expect((await request.get("/adm-internal")).status()).toBe(404);
    expect((await request.get("/adm-internal/users")).status()).toBe(404);
    const res = await request.get(`/${ADMIN_SLUG}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    const html = await res.text();
    expect(html).toContain('name="robots" content="noindex');
    expect(html).toContain("Admin belépés");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).not.toContain(ADMIN_SLUG);
    expect(robots).not.toContain("adm");
  });

  test("admin belépés: hibás jelszó után próbálkozás-korlát", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-real-ip": "203.0.113.77" } });
    for (let i = 0; i < 5; i++) {
      expect((await apiPost(ctx, BASE, "/api/admin/login", { password: `rossz-${i}` })).status()).toBe(401);
    }
    expect((await apiPost(ctx, BASE, "/api/admin/login", { password: ADMIN_PASSWORD })).status()).toBe(429);
  });
});

test.describe("Belépés, CSRF, fejlécek", () => {
  test("hibás belépés: ugyanaz az üzenet, próbálkozás-korlát", async () => {
    const { username } = await newUser();
    const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-real-ip": "203.0.113.10" } });
    const wrongPw = await apiPost(ctx, BASE, "/api/auth/login", { username, password: "rossz-jelszo" });
    const noUser = await apiPost(ctx, BASE, "/api/auth/login", { username: "nincs_ilyen_user", password: "rossz-jelszo" });
    expect(wrongPw.status()).toBe(401);
    expect(noUser.status()).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
    for (let i = 0; i < 4; i++) await apiPost(ctx, BASE, "/api/auth/login", { username, password: `rossz-${i}` });
    const limited = await apiPost(ctx, BASE, "/api/auth/login", { username, password: "jelszo12345" });
    expect(limited.status()).toBe(429);
  });

  test("CSRF: idegen Origin vagy hiányzó Origin esetén 403", async ({ request }) => {
    const evil = await request.post("/api/auth/login", { data: { username: "a", password: "b" }, headers: { Origin: "https://evil.example", "Content-Type": "application/json" } });
    expect(evil.status()).toBe(403);
    const none = await request.post("/api/auth/login", { data: { username: "a", password: "b" }, headers: { "Content-Type": "application/json" } });
    expect(none.status()).toBe(403);
  });

  test("biztonsági fejlécek az oldalakon és az API-n", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).not.toContain("unsafe-eval");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["cache-control"]).toMatch(/no-store/);
    const api = await request.get("/api/me/avatar");
    expect(api.headers()["cache-control"]).toMatch(/no-store/);
  });

  test("a service worker csak nyilvános statikus fájlokat tárol", async ({ request }) => {
    const sw = await (await request.get("/sw.js")).text();
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain("/_next/static/");
    expect(sw).not.toMatch(/cache\.put\([^)]*navigate/);
  });
});
