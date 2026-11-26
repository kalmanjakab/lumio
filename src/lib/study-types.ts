// Közös típusok a szerver és a kliens között.
import type { SrsCard } from "./srs";

export type ProgressEntry = { level: number; streak: number; wrong: number; at: number };

export type TestQuestionDetail = {
  cardId: string;
  type: "tf" | "mc" | "written";
  prompt: string;
  shown?: string;
  options?: string[];
  correctAnswer: string;
  userAnswer: string | null;
  correct: boolean;
};

export type TestResultRecord = {
  id: string;
  correct: number;
  total: number;
  percent: number;
  grade: number;
  durationMs: number;
  details: { questions: TestQuestionDetail[] };
  createdAt: string;
};

export type StudyData = {
  modeSettings: Record<string, unknown>;
  studyState: Record<string, unknown>;
  progress: Record<string, ProgressEntry>;
  starred: string[];
  tests: TestResultRecord[];
  matchBestMs: number | null;
  // Ütemezett ismétlés állapota kártyánként.
  srs: Record<string, SrsCard>;
};

export type CardDTO = { id: string; term: string; definition: string; imageId: string | null };

export type MaterialDTO = {
  id: string;
  title: string;
  description: string;
  groupId: string | null;
  groupName: string | null;
  termLang: string;
  definitionLang: string;
  cardCount: number;
  // A néző saját (privát) készlete.
  isOwn: boolean;
};
