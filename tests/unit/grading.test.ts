import { describe, expect, it } from "vitest";
import { editDistance, gradeWritten, normalizeStyle, splitAlternatives, stripAccents } from "@/lib/grading";

const ok = (input: string, correct: string, level: "lenient" | "medium" | "strict") => gradeWritten(input, correct, level).correct;

describe("segédfüggvények", () => {
  it("normalizálja a stílust", () => {
    expect(normalizeStyle("  To Give UP (sth)! ")).toBe("to give up");
    expect(normalizeStyle("Hello, World.")).toBe("hello world");
    expect(normalizeStyle("[a] b {c} (d (e))")).toBe("b");
  });
  it("leveszi az ékezeteket", () => {
    expect(stripAccents("árvíztűrő tükörfúrógép")).toBe("arvizturo tukorfurogep");
    expect(stripAccents("Straße")).toBe("Strasse");
    expect(stripAccents("élève")).toBe("eleve");
  });
  it("szerkesztési távolság (felcserélt betű = 1)", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abcd", "abdc")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
  it("szétszedi az alternatívákat", () => {
    expect(splitAlternatives("feladni, abbahagyni; felhagyni")).toEqual(["feladni", "abbahagyni", "felhagyni"]);
    expect(splitAlternatives("ház (épület), otthon")).toEqual(["ház", "otthon"]);
  });
});

describe("Szigorú", () => {
  it("elfogadja a kis-nagybetű, írásjel és zárójeles eltérést", () => {
    expect(ok("APPLE", "apple", "strict")).toBe(true);
    expect(ok("apple", "apple!", "strict")).toBe(true);
    expect(ok("to borrow", "(to) borrow", "strict")).toBe(false);
    expect(ok("borrow", "(to) borrow", "strict")).toBe(true);
    expect(ok("give up", "give up (sth)", "strict")).toBe(true);
  });
  it("nem fogad el elírást vagy ékezethibát", () => {
    expect(ok("aple", "apple", "strict")).toBe(false);
    expect(ok("haz", "ház", "strict")).toBe(false);
    expect(ok("alma", "körte", "strict")).toBe(false);
  });
  it("üres válasz mindig rossz", () => {
    expect(ok("", "apple", "strict")).toBe(false);
    expect(ok("   ", "apple", "lenient")).toBe(false);
  });
});

describe("Közepes", () => {
  it("elfogadja az ékezethibát", () => {
    expect(ok("haz", "ház", "medium")).toBe(true);
    expect(ok("idojaras", "időjárás", "medium")).toBe(true);
    expect(ok("eleve", "élève", "medium")).toBe(true);
  });
  it("elfogad egy betűnyi elírást", () => {
    expect(ok("aple", "apple", "medium")).toBe(true);
    expect(ok("journy", "journey", "medium")).toBe(true);
    expect(ok("joruney", "journey", "medium")).toBe(true);
  });
  it("nem fogad el két elírást vagy rövid szónál elírást", () => {
    expect(ok("jurny", "journey", "medium")).toBe(false);
    expect(ok("cot", "cat", "medium")).toBe(false);
    expect(ok("haus", "maus", "medium")).toBe(false);
  });
  it("nem fogad el csak egy alternatívát", () => {
    expect(ok("feladni", "feladni, abbahagyni", "medium")).toBe(false);
  });
});

describe("Megengedő", () => {
  it("elfogadja bármelyik felsorolt jelentést", () => {
    expect(ok("abbahagyni", "feladni, abbahagyni", "lenient")).toBe(true);
    expect(ok("gondos", "óvatos, gondos", "lenient")).toBe(true);
    expect(ok("otthon", "ház; otthon", "lenient")).toBe(true);
  });
  it("kb. 20% elírást elfogad", () => {
    expect(ok("idöjaras", "időjárás", "lenient")).toBe(true);
    expect(ok("tempreture", "temperature", "lenient")).toBe(true);
    expect(ok("tempreture", "temperature", "medium")).toBe(false);
    expect(ok("abundent", "abundant", "lenient")).toBe(true);
  });
  it("töltelékszavak nélkül is jó", () => {
    expect(ok("give up", "to give up", "lenient")).toBe(true);
    expect(ok("borrow", "to borrow", "lenient")).toBe(true);
    expect(ok("Haus", "das Haus", "lenient")).toBe(true);
  });
  it("kulcsszavak más sorrendben", () => {
    expect(ok("up give", "give up", "lenient")).toBe(true);
  });
  it("nem fogad el rossz választ", () => {
    expect(ok("körte", "alma", "lenient")).toBe(false);
    expect(ok("give", "give up", "lenient")).toBe(false);
    expect(ok("cat", "dog", "lenient")).toBe(false);
    expect(ok("haus", "maus", "lenient")).toBe(false);
  });
  it("rövid szavaknál nincs elírás-tűrés", () => {
    expect(ok("cot", "cat", "lenient")).toBe(false);
    expect(ok("jo", "jó", "lenient")).toBe(true);
  });
});
