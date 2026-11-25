// Írásos válaszok értékelése külső AI nélkül.
//
// Szigorú:   csak kis-nagybetű, írásjel és zárójeles rész eltérése megengedett.
// Közepes:   ezen felül ékezet-eltérés és egy betűnyi elírás (hiányzó, felesleges, rossz vagy felcserélt betű).
// Megengedő: ezen felül kb. 20%-os elírás-tűrés, a kártyán vesszővel/pontosvesszővel/perjellel felsorolt
//            jelentések bármelyike elég, és elég, ha a kulcsszavak megvannak.

export type GradingLevel = "lenient" | "medium" | "strict";

export type GradeResult = { correct: boolean; reason: "exact" | "style" | "accent" | "typo" | "alternative" | "keywords" | "wrong" | "empty" };

/** Zárójeles (kerek, szögletes, kapcsos) részek eltávolítása, akár egymásba ágyazva is. */
export function stripParentheticals(s: string): string {
  let prev = "";
  let cur = s;
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(/\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}/g, " ");
  }
  return cur;
}

/** Stílus-normalizálás: kisbetű, zárójeles részek, írásjelek és felesleges szóközök nélkül. */
export function normalizeStyle(s: string): string {
  return stripParentheticals(s.normalize("NFC"))
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SPECIAL: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };

export function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ßæœøłđðþı]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFC");
}

/** Optimal string alignment távolság (Levenshtein + szomszédos betűcsere). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const A = Array.from(a);
  const B = Array.from(b);
  const n = A.length;
  const m = B.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[n]![m]!;
}

/** A kártyán felsorolt alternatív jelentések (vessző, pontosvessző, perjel, „|” mentén). */
export function splitAlternatives(answer: string): string[] {
  const outside = stripParentheticals(answer);
  return outside
    .split(/[,;/|\n]+/)
    .map((x) => x.trim())
    .filter((x) => normalizeStyle(x).length > 0);
}

// Gyakori töltelékszavak, amik nélkül is elfogadjuk a választ (megengedő szinten).
const STOPWORDS = new Set([
  // angol
  "to", "a", "an", "the", "of", "sb", "sth", "someone", "something", "somebody", "be", "is", "are",
  // magyar
  "az", "egy", "valamit", "valakit", "valami", "valaki", "vmit", "vkit", "vmi", "vki", "meg",
  // német
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "sich", "etwas", "jemand", "jemanden", "jdn", "jdm", "etw",
  // francia
  "le", "la", "les", "l", "un", "une", "de", "du", "des", "se", "s", "qqch", "qqn", "quelque", "chose",
]);

function words(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

function keywordsOf(s: string): string[] {
  const ws = words(s);
  const kw = ws.filter((w) => !STOPWORDS.has(w));
  return kw.length ? kw : ws;
}

// Rövid (4 betűs vagy rövidebb) szavaknál nincs elírás-tűrés, mert ott egy betű már másik szót jelent (pl. haus/maus).
const MIN_TYPO_LEN = 5;

function typoBudget(len: number, ratio: number): number {
  if (len < MIN_TYPO_LEN) return 0;
  return Math.max(1, Math.floor(len * ratio));
}

function lenientMatch(input: string, target: string): GradeResult["reason"] | null {
  if (!input || !target) return null;
  if (input === target) return "exact";
  if (editDistance(input, target) <= typoBudget(target.length, 0.2)) return "typo";
  // Töltelékszavak nélkül (pl. „give up” a „to give up” helyett).
  const ti = keywordsOf(input).join(" ");
  const tt = keywordsOf(target).join(" ");
  if (ti && tt && (ti === tt || editDistance(ti, tt) <= typoBudget(tt.length, 0.2))) return "keywords";
  // Kulcsszavak: a helyes válasz minden kulcsszava megvan (elírás-tűréssel), bármilyen sorrendben.
  const inWords = words(input);
  const kws = keywordsOf(target);
  if (kws.length >= 2 || (kws.length === 1 && words(target).length > 1)) {
    const all = kws.every((k) => inWords.some((w) => w === k || editDistance(w, k) <= typoBudget(k.length, 0.2)));
    // Ne fogadjunk el olyat, ami jóval hosszabb a helyesnél (pl. egész mondat a kulcsszavakkal).
    if (all && inWords.length <= words(target).length + 3) return "keywords";
  }
  return null;
}

export function gradeWritten(inputRaw: string, correctRaw: string, level: GradingLevel): GradeResult {
  const input = normalizeStyle(inputRaw);
  if (!input) return { correct: false, reason: "empty" };
  const target = normalizeStyle(correctRaw);
  if (inputRaw.trim() === correctRaw.trim()) return { correct: true, reason: "exact" };
  if (input === target && target.length > 0) return { correct: true, reason: "style" };
  // Ha a helyes válasz csak zárójeles részből áll, a zárójelet nem dobjuk el.
  if (!target) {
    const alt = normalizeStyle(correctRaw.replace(/[()[\]{}]/g, " "));
    return input === alt ? { correct: true, reason: "style" } : { correct: false, reason: "wrong" };
  }
  if (level === "strict") return { correct: false, reason: "wrong" };

  const ia = stripAccents(input);
  const ta = stripAccents(target);
  if (level === "medium") {
    if (ia === ta) return { correct: true, reason: "accent" };
    if (ta.length >= MIN_TYPO_LEN && editDistance(ia, ta) <= 1) return { correct: true, reason: "typo" };
    return { correct: false, reason: "wrong" };
  }

  // Megengedő
  const whole = lenientMatch(ia, ta);
  if (whole) return { correct: true, reason: whole === "exact" ? "accent" : whole };
  const alts = splitAlternatives(correctRaw).map((a) => stripAccents(normalizeStyle(a)));
  const inputs = [ia, ...splitAlternatives(inputRaw).map((a) => stripAccents(normalizeStyle(a)))];
  if (alts.length > 1 || inputs.length > 2) {
    for (const alt of alts) {
      for (const inp of inputs) {
        if (lenientMatch(inp, alt)) return { correct: true, reason: "alternative" };
      }
    }
  }
  return { correct: false, reason: "wrong" };
}
