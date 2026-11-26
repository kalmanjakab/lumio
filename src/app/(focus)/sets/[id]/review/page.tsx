import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadModePage } from "@/lib/server/mode-page";
import { ReviewMode } from "@/components/modes/review-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("review");
  return { title: t("title") };
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { material, cards, data } = await loadModePage(id, "review");
  return <ReviewMode material={material} cards={cards} serverData={data} />;
}
