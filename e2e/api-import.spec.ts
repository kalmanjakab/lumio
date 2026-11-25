import { test, expect } from "@playwright/test";
import { IMPORT_TEST_KEY } from "../playwright.config";
import { seed } from "./helpers";

const auth = { Authorization: `Bearer ${IMPORT_TEST_KEY}`, "Content-Type": "application/json" };
const stamp = () => Date.now().toString(36);

test.describe("AI import API", () => {
  test("kulcs nélkül vagy rossz kulccsal elutasít", async ({ request }) => {
    const body = { title: "x", cards: [{ front: "a", back: "b" }] };
    const none = await request.post("/api/v1/sets", { data: body });
    expect(none.status()).toBe(401);
    expect(none.headers()["www-authenticate"]).toContain("Bearer");
    expect((await none.json()).ok).toBe(false);
    const wrong = await request.post("/api/v1/sets", { data: body, headers: { Authorization: "Bearer rossz-kulcs-0123456789012345678901234567" } });
    expect(wrong.status()).toBe(401);
    const get = await request.get("/api/v1/sets", { headers: auth });
    expect(get.status()).toBe(405);
  });

  test("validál: hibás JSON, hiányzó mező, rossz típus, túl sok kártya", async ({ request }) => {
    const bad = await request.post("/api/v1/sets", { headers: auth, data: Buffer.from("{nem json") });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toBe("invalid_json");

    const missing = await request.post("/api/v1/sets", { headers: auth, data: { title: "Hiányos", cards: [{ front: "a" }] } });
    expect(missing.status()).toBe(400);
    const j = await missing.json();
    expect(j.error).toBe("validation_failed");
    expect(j.issues[0].path).toBe("cards.0.back");

    const tooMany = Array.from({ length: 1001 }, (_, i) => ({ front: `t${i}`, back: `d${i}` }));
    expect((await request.post("/api/v1/sets", { headers: auth, data: { title: "Sok", cards: tooMany } })).status()).toBe(400);

    const text = await request.post("/api/v1/sets", { headers: { ...auth, "Content-Type": "text/plain" }, data: "{}" });
    expect(text.status()).toBe(415);

    const unknownGroup = await request.post("/api/v1/sets", {
      headers: auth,
      data: { title: `Nincs csoport ${stamp()}`, groupId: "00000000-0000-4000-8000-000000000000", cards: [{ front: "a", back: "b" }] },
    });
    expect(unknownGroup.status()).toBe(400);
    expect((await unknownGroup.json()).error).toBe("group_not_found");
  });

  test("létrehozza a készletet, ami megjelenik az appban; a duplikátumot kiszűri", async ({ request, page }) => {
    const id = stamp();
    const title = `English Vocabulary ${id}`;
    const body = {
      title,
      description: "Advanced English vocabulary",
      cards: [
        { front: "What does reluctant mean?", back: "Unwilling or hesitant." },
        { front: "What does substantial mean?", back: "Large in amount, value or importance." },
      ],
    };
    const res = await request.post("/api/v1/sets", { headers: { ...auth, "Idempotency-Key": `e2e-import-${id}` }, data: body });
    expect(res.status()).toBe(201);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, cardCount: 2, duplicate: false });
    expect(out.setId).toMatch(/^[0-9a-f-]{36}$/);

    // Ugyanaz a kulcs és tartalom: ugyanazt az eredményt adja vissza, új készlet nélkül.
    const again = await request.post("/api/v1/sets", { headers: { ...auth, "Idempotency-Key": `e2e-import-${id}` }, data: body });
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, setId: out.setId, duplicate: true });

    // Ugyanaz a kulcs más tartalommal: hiba.
    const conflict = await request.post("/api/v1/sets", { headers: { ...auth, "Idempotency-Key": `e2e-import-${id}` }, data: { ...body, title: `${title} 2` } });
    expect(conflict.status()).toBe(422);

    // Kulcs nélkül, azonos tartalommal: duplikátum.
    const dup = await request.post("/api/v1/sets", { headers: auth, data: body });
    expect(dup.status()).toBe(409);
    expect(await dup.json()).toMatchObject({ ok: false, error: "duplicate", setId: out.setId });

    // A nyilvános készlet megjelenik a felhasználói felületen a kártyákkal együtt.
    await page.goto(out.url);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("What does reluctant mean?").first()).toBeVisible();
  });

  test("csoportba is tud importálni", async ({ request }) => {
    const s = seed();
    const res = await request.post("/api/v1/sets", {
      headers: auth,
      data: { title: `Csoportos ${stamp()}`, groupId: s.groupId, termLang: "de-DE", cards: [{ term: "Haus", definition: "ház" }] },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).cardCount).toBe(1);
  });
});
