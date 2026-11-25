// A külső (AI) import API bemenetének leírása és ellenőrzése.
// Szerver- és tesztkódból is használjuk, ezért itt nincs adatbázis- vagy titokkezelés.
import { createHash } from "node:crypto";
import { z } from "zod";
import { langSchema } from "./server/admin-schemas";

export const IMPORT_MAX_CARDS = 1000;
export const IMPORT_MAX_BODY_BYTES = 1_000_000;
export const IMPORT_TITLE_MAX = 120;
export const IMPORT_DESCRIPTION_MAX = 500;
export const IMPORT_TERM_MAX = 1000;
export const IMPORT_DEFINITION_MAX = 2000;

// Vezérlőkarakterek (a tabulátor és a sortörés kivételével) nem kerülhetnek a kártyákra.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !CONTROL_CHARS.test(s), "control_characters");

// Egy kártya: a „front/back” az elsődleges forma, a „term/definition” az app saját elnevezése.
const cardSchema = z
  .object({
    front: text(IMPORT_TERM_MAX).optional(),
    back: text(IMPORT_DEFINITION_MAX).optional(),
    term: text(IMPORT_TERM_MAX).optional(),
    definition: text(IMPORT_DEFINITION_MAX).optional(),
  })
  .strict()
  .transform((c, ctx) => {
    const term = c.front ?? c.term;
    const definition = c.back ?? c.definition;
    if (!term) ctx.addIssue({ code: "custom", path: ["front"], message: "required" });
    if (!definition) ctx.addIssue({ code: "custom", path: ["back"], message: "required" });
    return { term: term ?? "", definition: definition ?? "" };
  });

export const importRequestSchema = z
  .object({
    title: text(IMPORT_TITLE_MAX),
    description: z
      .string()
      .trim()
      .max(IMPORT_DESCRIPTION_MAX)
      .refine((s) => !CONTROL_CHARS.test(s), "control_characters")
      .optional()
      .default(""),
    // Nincs megadva vagy null: nyilvános készlet. Egyébként a megadott csoportba kerül.
    groupId: z.uuid().nullable().optional().default(null),
    termLang: langSchema.optional().default("en-GB"),
    definitionLang: langSchema.optional().default("hu-HU"),
    cards: z.array(cardSchema).min(1).max(IMPORT_MAX_CARDS),
  })
  .strict();

export type ImportRequest = z.infer<typeof importRequestSchema>;

/** A tartalom ujjlenyomata: ugyanaz a cím és ugyanazok a kártyák ugyanazt a hash-t adják. */
export function importContentHash(input: Pick<ImportRequest, "title" | "groupId" | "cards">): string {
  const canonical = JSON.stringify({
    t: input.title.normalize("NFC").toLowerCase(),
    g: input.groupId ?? null,
    c: input.cards.map((c) => [c.term.normalize("NFC"), c.definition.normalize("NFC")]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Az Idempotency-Key fejléc formai ellenőrzése (látható ASCII, 8–200 karakter). */
export function validIdempotencyKey(key: string): boolean {
  return /^[\x21-\x7E]{8,200}$/.test(key);
}

/** Kiveszi a Bearer tokent az Authorization fejlécből. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer[ ]+([^\s]+)\s*$/i.exec(header);
  return m ? m[1]! : null;
}
