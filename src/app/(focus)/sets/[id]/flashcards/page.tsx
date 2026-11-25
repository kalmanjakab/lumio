import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadModePage } from "@/lib/server/mode-page";
import { FlashcardsMode } from "@/components/modes/flashcards-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("flashcards");
  return { title: t("title") };
}

export default async function FlashcardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { material, cards, data } = await loadModePage(id, "flashcards");
  return <FlashcardsMode material={material} cards={cards} serverData={data} />;
}
