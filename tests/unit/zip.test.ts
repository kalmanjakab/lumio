import { describe, expect, it } from "vitest";
import { crc32, makeZip } from "@/lib/client/zip";

describe("zip", () => {
  it("crc32 a szabványos ellenőrző értéket adja", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("érvényes szerkezetű ZIP-et készít", () => {
    const z = makeZip([
      { path: "a/SKILL.md", content: "árvíztűrő" },
      { path: "a/b.txt", content: "x" },
    ]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = z.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
  });
});
