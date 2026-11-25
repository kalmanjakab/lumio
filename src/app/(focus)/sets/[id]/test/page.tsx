import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadModePage } from "@/lib/server/mode-page";
import { TestMode } from "@/components/modes/test-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("test");
  return { title: t("title") };
}

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { material, cards, data, gradeThresholds } = await loadModePage(id, "test");
  return <TestMode material={material} cards={cards} serverData={data} thresholds={gradeThresholds} />;
}
