import { z } from "zod";

export const groupNameSchema = z.string().trim().min(1).max(80);
export const groupPasswordSchema = z.string().min(4).max(200);
export const langSchema = z.string().trim().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$/);
export const thresholdsSchema = z
  .object({ g5: z.number().int().min(1).max(100), g4: z.number().int().min(1).max(100), g3: z.number().int().min(1).max(100), g2: z.number().int().min(1).max(100) })
  .refine((t) => t.g5 > t.g4 && t.g4 > t.g3 && t.g3 > t.g2, "order");

export const MAX_CARDS_PER_SET = 2000;
export const MAX_IMPORT_LINES = 1000;

export const cardInputSchema = z.object({
  id: z.string().max(40).optional(),
  term: z.string().trim().min(1).max(1000),
  definition: z.string().trim().min(1).max(2000),
  imageId: z.uuid().nullable().optional(),
});

export const materialUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  groupId: z.uuid().nullable(),
  termLang: langSchema,
  definitionLang: langSchema,
  gradeThresholds: thresholdsSchema.nullable(),
  cards: z.array(cardInputSchema).max(MAX_CARDS_PER_SET),
});
