import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadModePage } from "@/lib/server/mode-page";
import { DictationMode } from "@/components/modes/dictation-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dictation");
  return { title: t("title") };
}

export default async function DictationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { material, cards, data } = await loadModePage(id, "dictation");
  return <DictationMode material={material} cards={cards} serverData={data} />;
}
