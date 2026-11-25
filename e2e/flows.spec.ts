import { test, expect, SEED, seed, uniqueName, registerViaUi } from "./helpers";
import type { Page } from "@playwright/test";

const pairs = new Map<string, string>([...SEED.publicTerms, ...SEED.protectedTerms].flatMap(([t, d]) => [[t!, d!], [d!, t!]]));

test.describe("Fiók", () => {
  test("regisztráció ellenőrzéssel, kijelentkezés, belépés egységes hibaüzenettel", async ({ page }) => {
    const name = uniqueName("reg");
    await page.goto("/login?mode=register");
    await expect(page.getByText("Ne a valódi nevedet használd felhasználónévnek.")).toBeVisible();
    await page.getByLabel("Felhasználónév").fill("ab");
    await page.getByLabel("Jelszó", { exact: true }).fill("rovid");
    await page.getByLabel("Jelszó újra").fill("masik");
    await page.getByRole("button", { name: "Fiók létrehozása" }).click();
    await expect(page.getByText("A felhasználónév 3–20 karakter lehet")).toBeVisible();
    await expect(page.getByText("A jelszó legalább 8 karakter legyen.")).toBeVisible();
    await expect(page.getByText("A két jelszó nem egyezik.")).toBeVisible();

    await registerViaUi(page, name);
    await expect(page.getByRole("heading", { name: `Szia, ${name}!` })).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Kijelentkezés" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Szia!" })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Felhasználónév").fill(name);
    await page.getByLabel("Jelszó", { exact: true }).fill("rossz-jelszo");
    await page.getByRole("button", { name: "Belépés", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toHaveText("Hibás felhasználónév vagy jelszó.");
    await page.getByLabel("Felhasználónév").fill("nincs_ilyen_nev");
    await page.getByRole("button", { name: "Belépés", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toHaveText("Hibás felhasználónév vagy jelszó.");

    await page.getByLabel("Felhasználónév").fill(name.toUpperCase());
    await page.getByLabel("Jelszó", { exact: true }).fill("jelszo12345");
    await page.getByRole("button", { name: "Belépés", exact: true }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: `Szia, ${name}!` })).toBeVisible();
  });
});

test.describe("Csoport feloldása", () => {
  test("vendég: rossz jelszó, majd jó jelszó; a csoport a fiókba kerül regisztrációkor", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.protectedSetId}`);
    await expect(page).toHaveURL(new RegExp(`/groups/${s.groupId}`));
    await expect(page.getByText("Titkos Unit 3")).toHaveCount(0);
    await page.getByLabel("Csoport jelszava").fill("rossz");
    await page.getByRole("button", { name: "Megnyitás" }).click();
    await expect(page.getByText("Hibás jelszó.")).toBeVisible();
    await page.getByLabel("Csoport jelszava").fill(SEED.groupPassword);
    await page.getByRole("button", { name: "Megnyitás" }).click();
    await expect(page).toHaveURL(new RegExp(`/sets/${s.protectedSetId}`));
    await expect(page.getByRole("heading", { name: "Titkos Unit 3" })).toBeVisible();
    await expect(page.getByText("abundant").first()).toBeVisible();

    // Regisztráció után a csoport a fiókhoz kerül.
    await registerViaUi(page, uniqueName("grp"));
    await page.goto("/");
    await expect(page.locator('section[aria-labelledby="my-groups"]').getByText("Angol")).toBeVisible();
    await page.goto(`/sets/${s.protectedSetId}`);
    await expect(page.getByRole("heading", { name: "Titkos Unit 3" })).toBeVisible();

    // A Kártyák módban elkezdett készlet megjelenik a „Folytasd” részben.
    await page.goto(`/sets/${s.protectedSetId}/flashcards`);
    await page.getByRole("button", { name: "Tudom", exact: true }).click();
    await page.waitForTimeout(800);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Folytasd" })).toBeVisible();
    await expect(page.getByText("1/8 kártya rendezve")).toBeVisible();
  });
});

async function answerCurrentLearnQuestion(page: Page) {
  const prompt = (await page.locator("main .rounded-3xl p").first().textContent())?.trim() ?? "";
  const answer = pairs.get(prompt);
  if (!answer) throw new Error(`Ismeretlen kérdés: ${prompt}`);
  const group = page.getByRole("group", { name: "Válaszd ki a helyes választ" });
  if (await group.count()) {
    await group.getByRole("button", { name: new RegExp(`^\\d?${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
  } else {
    await page.locator("#written-answer").fill(answer);
    await page.getByRole("button", { name: "Ellenőrzés" }).click();
  }
  await expect(page.getByText("Helyes!")).toBeVisible();
  // Helyes válasz után magától is továbblép; ha még látszik a gomb, rányomunk.
  await page.getByRole("button", { name: "Folytatás" }).click({ timeout: 800 }).catch(() => {});
  await expect(page.getByText("Helyes!")).toHaveCount(0);
}

test.describe("Tanulási módok", () => {
  test("Kártyák: végigrendezés, összegző, folytatás a nem tudottakkal", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/flashcards`);
    await expect(page.getByText("1 / 7")).toBeVisible();
    await page.locator('button[data-card="1"]').first().click();
    await page.getByRole("button", { name: "Még tanulom" }).click();
    await page.getByRole("button", { name: "Visszavonás" }).click();
    await expect(page.getByText("1 / 7")).toBeVisible();
    for (let i = 0; i < 7; i++) {
      await page.getByRole("button", { name: i < 2 ? "Még tanulom" : "Tudom", exact: true }).click();
      await page.waitForTimeout(260);
    }
    await expect(page.getByRole("heading", { name: "Szép munka!" })).toBeVisible();
    await page.getByRole("button", { name: "Folytatás a nem tudott kártyákkal" }).click();
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("Kártyák érintéssel: átlós húzás válaszol, függőleges nem", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/flashcards`);
    await expect(page.getByText("1 / 7")).toBeVisible();
    const box = (await page.getByTestId("flashcard").boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = async (dx: number, dy: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
      for (let i = 1; i <= 12; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + (dx * i) / 12, y: cy + (dy * i) / 12 }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(450);
    };
    await touch(0, -150);
    await expect(page.getByText("1 / 7")).toBeVisible();
    await touch(170, -110);
    await expect(page.getByText("2 / 7")).toBeVisible();
    await expect(page.getByLabel("Tudom: 1")).toBeVisible();
    await touch(-170, -60);
    await expect(page.getByText("3 / 7")).toBeVisible();
    await expect(page.getByLabel("Még tanulom: 1")).toBeVisible();
    // Koppintás továbbra is fordít.
    await page.locator('button[data-card="1"]').first().tap();
    await expect(page.locator(".flip-inner.is-flipped")).toHaveCount(1);
  });

  test("Tanulás: végig helyes válaszokkal minden kártya elsajátítva", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/learn`);
    for (let guard = 0; guard < 40; guard++) {
      if (await page.getByRole("heading", { name: "Mindet elsajátítottad!" }).count()) break;
      if (await page.getByRole("button", { name: "Következő kör" }).count()) {
        await page.getByRole("button", { name: "Következő kör" }).click();
        continue;
      }
      await answerCurrentLearnQuestion(page);
    }
    await expect(page.getByRole("heading", { name: "Mindet elsajátítottad!" })).toBeVisible();
  });

  test("Tanulás: hibás írásos válasz, Mégis jó volt", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/learn`);
    // Csak írásos kérdések.
    await page.getByRole("button", { name: "Beállítások" }).click();
    await page.getByRole("switch", { name: "Feleletválasztós" }).click();
    await page.getByRole("button", { name: "Bezárás" }).click();
    await page.locator("#written-answer").fill("teljesen rossz");
    await page.getByRole("button", { name: "Ellenőrzés" }).click();
    await expect(page.getByText("Ez most nem jó.")).toBeVisible();
    await expect(page.getByText("Helyes válasz")).toBeVisible();
    await page.getByRole("button", { name: "Mégis jó volt" }).click();
    await expect(page.locator("#written-answer")).toHaveValue("");
  });

  test("Teszt: minden típussal, 100% és 5-ös", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/test`);
    await expect(page.getByRole("heading", { name: "Teszt beállítása" })).toBeVisible();
    await page.getByRole("switch", { name: "Igaz/Hamis" }).click();
    await page.getByRole("switch", { name: "Írásos" }).click();
    await page.getByRole("button", { name: "Teszt indítása" }).click();
    for (let i = 0; i < 7; i++) {
      const section = (await page.locator("main > p").first().textContent()) ?? "";
      const prompt = (await page.locator("main .rounded-3xl p").first().textContent())?.trim() ?? "";
      const answer = pairs.get(prompt)!;
      if (section.includes("Igaz")) {
        const shown = (await page.locator("main .border-dashed p").nth(1).textContent())?.trim();
        await page.getByRole("button", { name: shown === answer ? "Igaz" : "Hamis", exact: true }).click();
      } else if (section.includes("Feleletválasztós")) {
        await page.locator("main [role=group] button", { hasText: new RegExp(`^\\d?${answer}$`) }).click();
      } else {
        await page.locator("#written-answer").fill(answer);
      }
      if (i < 6) await page.getByRole("button", { name: /Következő|Átugrás/ }).click();
    }
    await page.getByRole("button", { name: "Teszt beküldése" }).click();
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByText("5-ös")).toBeVisible();
    await expect(page.getByText("7 / 7 helyes")).toBeVisible();
  });

  test("Teszt: megválaszolatlan kérdésnél figyelmeztet, eredmény osztályzattal", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/test`);
    await page.getByRole("button", { name: "Teszt indítása" }).click();
    await page.getByRole("button", { name: "Kérdések" }).click();
    await page.getByRole("button", { name: "Teszt beküldése" }).last().click();
    await expect(page.getByText("Van megválaszolatlan kérdés")).toBeVisible();
    await page.getByRole("button", { name: "Beküldés így" }).click();
    await expect(page.getByText("0%")).toBeVisible();
    await expect(page.getByText("1-es")).toBeVisible();
    await page.getByRole("switch", { name: "Csak a hibák" }).click();
    await expect(page.getByRole("button", { name: "Tanulás a hibás kártyákkal" })).toBeVisible();
  });

  test("Párosítás: rossz pár büntetéssel, majd kész és legjobb idő", async ({ page }) => {
    const s = seed();
    await page.goto(`/sets/${s.publicSetId}/match`);
    await page.getByRole("button", { name: "Játék indítása" }).click();
    const tiles = page.locator("[data-tile]");
    await expect(tiles).toHaveCount(12);
    const texts = (await tiles.allTextContents()).map((t) => t.trim());
    const terms = texts.filter((t) => SEED.publicTerms.some(([term]) => term === t));
    const wrong = texts.find((t) => t !== pairs.get(terms[0]!) && !terms.includes(t))!;
    await page.locator("[data-tile]", { hasText: new RegExp(`^${terms[0]}$`) }).click();
    await page.locator("[data-tile]", { hasText: new RegExp(`^${wrong}$`) }).click();
    await page.waitForTimeout(450);
    for (const term of terms) {
      await page.locator("[data-tile]", { hasText: new RegExp(`^${term}$`) }).click();
      await page.locator("[data-tile]", { hasText: new RegExp(`^${pairs.get(term)}$`) }).click();
      await page.waitForTimeout(60);
    }
    await expect(page.getByRole("heading", { name: "Kész!" })).toBeVisible();
    await expect(page.getByText("Új rekord!")).toBeVisible();
    await expect(page.getByText(/Legjobb idő: \d+\.\d s/)).toBeVisible();
  });
});

test.describe("Telepítés és nyelv", () => {
  test("telepítési sáv a beforeinstallprompt eseményre, elutasítás után nem jön újra", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("install-bar")).toHaveCount(0);
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    });
    const bar = page.getByTestId("install-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("button", { name: "Telepítés" })).toBeVisible();
    await bar.getByRole("button", { name: "Most nem" }).first().click();
    await expect(bar).toHaveCount(0);
    await page.reload();
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => {};
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    });
    await page.waitForTimeout(300);
    await expect(page.getByTestId("install-bar")).toHaveCount(0);
  });

  test("iPhone Safarin magyarázatot mutat", async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: { "x-real-ip": "198.51.100.200" },
    });
    const page = await ctx.newPage();
    await page.goto("http://localhost:3100/");
    await expect(page.getByTestId("install-bar")).toContainText("Főképernyőhöz adás");
    await ctx.close();
  });

  test("nyelvváltás azonnal érvényesül és megmarad", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Library" }).first()).toBeVisible();
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Einstellungen");
    await page.getByRole("radio", { name: "Magyar" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Beállítások");
  });

  test("sötét mód a beállításokban", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Sötét" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
