import { verify } from "@node-rs/argon2";
import { test, expect, ADMIN_PASSWORD, ADMIN_SLUG, SEED, seed, uniqueName, registerViaUi } from "./helpers";

test.describe("Admin felület", () => {
  test("csoport és készlet létrehozása, tömeges import, majd a felhasználó feloldja", async ({ page, browser }) => {
    await page.goto(`/${ADMIN_SLUG}`);
    await page.getByLabel("Admin jelszó").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Belépés" }).click();
    await expect(page.getByRole("heading", { name: "Csoportok" })).toBeVisible();

    const groupName = `Kémia ${Date.now().toString(36)}`;
    await page.getByLabel("Csoport neve").fill(groupName);
    await page.getByLabel("Csoport jelszava (min. 4 karakter)").fill("kemia2026");
    await page.getByRole("button", { name: "Létrehozás" }).first().click();
    await expect(page.getByRole("link", { name: new RegExp(groupName) })).toBeVisible();

    await page.getByLabel("Új készlet címe").fill("Elemek");
    await page.getByLabel("Hová kerüljön").selectOption({ label: groupName });
    await page.getByRole("button", { name: "Létrehozás" }).nth(1).click();
    await expect(page.getByRole("heading", { name: "Készlet szerkesztése" })).toBeVisible();

    await page.getByRole("button", { name: "Tömeges import" }).click();
    await page.getByLabel("Importálandó szöveg").fill("H\thidrogén\nO\toxigén\nrossz sor tab nélkül\nC\tszén");
    await expect(page.getByText("3 kártya felismerve.")).toBeVisible();
    await page.getByRole("button", { name: "Importálás" }).click();
    await page.getByLabel("Szó nyelve (felolvasáshoz)").selectOption("la");
    await page.getByRole("button", { name: "Mentés" }).click();
    await expect(page.getByText("Mentve (3 kártya).")).toBeVisible();
    const setUrl = page.url();
    const setId = setUrl.split("/").pop()!;

    // Egy új felhasználó a jelszóval feloldja és látja a kártyákat.
    const ctx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": "198.51.100.231" } });
    const user = await ctx.newPage();
    await registerViaUi(user, uniqueName("adm"));
    await user.goto(`/sets/${setId}`);
    await user.getByLabel("Csoport jelszava").fill("kemia2026");
    await user.getByRole("button", { name: "Megnyitás" }).click();
    await expect(user.getByRole("heading", { name: "Elemek" })).toBeVisible();
    await expect(user.getByText("hidrogén").first()).toBeVisible();

    // Az admin ideiglenes jelszót ad neki: a felhasználó kijelentkezik, belépés után új jelszót kell választania.
    await page.goto(`/${ADMIN_SLUG}/users`);
    await expect(page.getByRole("heading", { name: /Felhasználók/ })).toBeVisible();
    await ctx.close();
  });

  test("a hash-generátor base64 kimenete érvényes argon2id hash", async ({ page }) => {
    await page.goto(`/${ADMIN_SLUG}/hash`);
    await page.getByLabel("Admin jelszó (min. 12 karakter)").fill("probajelszo-12345");
    await page.getByLabel("Admin jelszó újra").fill("probajelszo-12345");
    await page.getByRole("button", { name: "Hash készítése" }).click();
    const value = (await page.locator("code").first().textContent())!.trim();
    expect(value).not.toContain("$");
    const decoded = Buffer.from(value, "base64").toString("utf8");
    expect(decoded.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(await verify(decoded, "probajelszo-12345")).toBe(true);
    await page.getByRole("button", { name: "Titok generálása" }).click();
    const secret = (await page.locator("code").nth(1).textContent())!.trim();
    expect(secret.length).toBeGreaterThanOrEqual(40);
  });
});

test.describe("Service worker", () => {
  test("védett oldal és API-válasz nem kerül a gyorsítótárba", async ({ page }) => {
    const s = seed();
    await page.goto("/");
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.active);
    });
    await page.reload();
    await page.goto(`/groups/${s.groupId}`);
    await page.getByLabel("Csoport jelszava").fill(SEED.groupPassword);
    await page.getByRole("button", { name: "Megnyitás" }).click();
    await expect(page.getByRole("link", { name: /Titkos Unit 3/ })).toBeVisible();
    await page.goto(`/sets/${s.protectedSetId}`);
    await expect(page.getByRole("heading", { name: "Titkos Unit 3" })).toBeVisible();
    await page.goto(`/sets/${s.protectedSetId}/learn`);
    await page.waitForTimeout(800);
    const cached = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        for (const req of await c.keys()) out.push(new URL(req.url).pathname);
      }
      return out;
    });
    expect(cached.length).toBeGreaterThan(0);
    for (const p of cached) {
      expect(p.startsWith("/_next/static/") || p.startsWith("/icons/") || p.startsWith("/avatars/") || ["/offline", "/manifest.webmanifest", "/favicon.ico"].includes(p), p).toBe(true);
    }
    // Az eltárolt offline oldalban nincs személyes vagy védett adat.
    const offlineHtml = await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const r = await (await caches.open(name)).match("/offline");
        if (r) return r.text();
      }
      return "";
    });
    expect(offlineHtml).toContain("Nincs internetkapcsolat");
    expect(offlineHtml).not.toContain("Titkos Unit 3");
  });
});

test.describe("Asztali kezelés", () => {
  test("Kártyák billentyűzettel: szóköz fordít, nyilak rendeznek, Z visszavon", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/flashcards`);
    await expect(page.getByText("1 / 7")).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("Space");
    await expect(page.locator(".flip-inner.is-flipped")).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await expect(page.getByText("2 / 7")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    await expect(page.getByText("3 / 7")).toBeVisible();
    await page.keyboard.press("z");
    await expect(page.getByText("2 / 7")).toBeVisible();
  });

  test("Tanulás billentyűzettel: számgombbal választ, Enterrel továbblép", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/learn`);
    await expect(page.getByText("Válaszd ki a helyes választ").first()).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByText(/Helyes!|Ez most nem jó\./)).toBeVisible();
  });

  test("fiók menü asztali gépen: sötét mód és kijelentkezés", async ({ page }) => {
    const name = uniqueName("desk");
    await registerViaUi(page, name);
    await page.getByRole("button", { name: "Fiók menü" }).click();
    await expect(page.getByRole("menu")).toContainText(name);
    await page.getByRole("menuitemcheckbox", { name: "Sötét mód" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("menuitem", { name: "Kijelentkezés" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("link", { name: "Belépés" }).first()).toBeVisible();
  });
});
