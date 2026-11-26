import { z } from "zod";
export const modeSchema = z.enum(["set", "flashcards", "learn", "test", "match", "review", "dictation"]);
export const jsonValue = z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 200_000, "too_large");
