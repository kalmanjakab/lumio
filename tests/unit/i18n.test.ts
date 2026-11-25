import { describe, expect, it } from "vitest";
import hu from "../../messages/hu.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import de from "../../messages/de.json";
import { IntlMessageFormat } from "intl-messageformat";

type Msgs = Record<string, Record<string, string>>;
const all: Record<string, Msgs> = { hu, en, fr, de };

function flat(m: Msgs) {
  const out: Record<string, string> = {};
  for (const [ns, v] of Object.entries(m)) for (const [k, s] of Object.entries(v)) out[`${ns}.${k}`] = s;
  return out;
}
const args = (s: string) => new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).filter((x) => !/^\d+$/.test(x!)));

describe("fordítások", () => {
  const base = flat(hu);
  for (const [lang, msgs] of Object.entries(all)) {
    const f = flat(msgs);
    it(`${lang}: ugyanazok a kulcsok, mint a magyarban`, () => {
      expect(Object.keys(f).sort()).toEqual(Object.keys(base).sort());
    });
    it(`${lang}: ugyanazok a változók, és minden üzenet értelmezhető`, () => {
      for (const [k, s] of Object.entries(f)) {
        expect([...args(s)].sort(), `${lang} ${k}`).toEqual([...args(base[k]!)].sort());
        expect(() => new IntlMessageFormat(s, lang), `${lang} ${k}`).not.toThrow();
        expect(s.trim().length, `${lang} ${k} üres`).toBeGreaterThan(0);
      }
    });
  }
});
