import { describe, expect, it } from "vitest";
import { IMPORT_MAX_CARDS, bearerToken, importContentHash, importRequestSchema, validIdempotencyKey } from "@/lib/import-api";

const base = { title: "English – Unit 5", cards: [{ front: "reluctant", back: "unwilling" }] };

describe("Import API – bemenet", () => {
  it("elfogadja a front/back formát és alapértékeket ad", () => {
    const r = importRequestSchema.parse(base);
    expect(r.cards).toEqual([{ term: "reluctant", definition: "unwilling" }]);
    expect(r.description).toBe("");
    expect(r.groupId).toBeNull();
    expect(r.termLang).toBe("en-GB");
  });
  it("elfogadja a term/definition formát is", () => {
    const r = importRequestSchema.parse({ ...base, cards: [{ term: "a", definition: "b" }] });
    expect(r.cards[0]).toEqual({ term: "a", definition: "b" });
  });
  it("elutasítja a hiányos kártyát, az üres listát és az ismeretlen mezőt", () => {
    expect(importRequestSchema.safeParse({ ...base, cards: [{ front: "x" }] }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...base, cards: [] }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...base, cards: [{ front: "a", back: "b", x: 1 }] }).success).toBe(false);
    expect(importRequestSchema.safeParse({ cards: base.cards }).success).toBe(false);
  });
  it("korlátozza a kártyák számát és a hosszt", () => {
    const many = Array.from({ length: IMPORT_MAX_CARDS + 1 }, (_, i) => ({ front: `t${i}`, back: `d${i}` }));
    expect(importRequestSchema.safeParse({ ...base, cards: many }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...base, title: "x".repeat(121) }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...base, cards: [{ front: "a", back: "b".repeat(2001) }] }).success).toBe(false);
  });
  it("kiszűri a vezérlőkaraktereket és a rossz groupId-t", () => {
    expect(importRequestSchema.safeParse({ ...base, title: "a\u0000b" }).success).toBe(false);
    expect(importRequestSchema.safeParse({ ...base, groupId: "nem-uuid" }).success).toBe(false);
  });
  it("a tartalom-hash stabil és a különbségre érzékeny", () => {
    const a = importRequestSchema.parse(base);
    const b = importRequestSchema.parse({ ...base, description: "más leírás" });
    const c = importRequestSchema.parse({ ...base, cards: [{ front: "reluctant", back: "hesitant" }] });
    expect(importContentHash(a)).toBe(importContentHash(b));
    expect(importContentHash(a)).not.toBe(importContentHash(c));
  });
  it("Bearer token és Idempotency-Key", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer   abc123 ")).toBe("abc123");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
    expect(validIdempotencyKey("import-2026-11-25-001")).toBe(true);
    expect(validIdempotencyKey("rövid")).toBe(false);
  });
});
