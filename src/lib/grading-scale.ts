import type { GradeThresholds } from "@/lib/db/schema";

export const DEFAULT_THRESHOLDS: GradeThresholds = { g5: 85, g4: 70, g3: 55, g2: 40 };

export function isValidThresholds(t: GradeThresholds) {
  return t.g5 <= 100 && t.g5 > t.g4 && t.g4 > t.g3 && t.g3 > t.g2 && t.g2 >= 1;
}

/** 1–5 osztályzat a százalék alapján. A küszöb „legalább” értelemben számít (85% → 5-ös). */
export function gradeFor(percent: number, t: GradeThresholds = DEFAULT_THRESHOLDS): number {
  if (percent >= t.g5) return 5;
  if (percent >= t.g4) return 4;
  if (percent >= t.g3) return 3;
  if (percent >= t.g2) return 2;
  return 1;
}
