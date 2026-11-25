import { describe, expect, it } from "vitest";
import { gradeFor, DEFAULT_THRESHOLDS } from "@/lib/grading-scale";
import { parseImport } from "@/lib/import-parser";

describe("osztályzat", () => {
  it("alapértelmezett küszöbök", () => {
    expect(gradeFor(100)).toBe(5);
    expect(gradeFor(85)).toBe(5);
    expect(gradeFor(84)).toBe(4);
    expect(gradeFor(70)).toBe(4);
    expect(gradeFor(55)).toBe(3);
    expect(gradeFor(40)).toBe(2);
    expect(gradeFor(39)).toBe(1);
    expect(gradeFor(0)).toBe(1);
  });
  it("saját küszöbök", () => {
    expect(gradeFor(90, { g5: 95, g4: 80, g3: 60, g2: 50 })).toBe(4);
    expect(DEFAULT_THRESHOLDS.g5).toBe(85);
  });
});

describe("tömeges import", () => {
  it("tabulátorral elválasztott sorok", () => {
    const r = parseImport("apple\talma\nhouse\tház\n\nrossz sor\n\türes szó\nkey\tkulcs\textra");
    expect(r.cards).toEqual([
      { term: "apple", definition: "alma" },
      { term: "house", definition: "ház" },
      { term: "key", definition: "kulcs extra" },
    ]);
    expect(r.skipped).toBe(2);
  });
  it("1000 sor fölött jelez", () => {
    const text = Array.from({ length: 1001 }, (_, i) => `t${i}\td${i}`).join("\n");
    expect(parseImport(text).tooMany).toBe(true);
  });
});
