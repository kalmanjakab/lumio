import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadModePage } from "@/lib/server/mode-page";
import { MatchMode } from "@/components/modes/match-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("match");
  return { title: t("title") };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { material, cards, data } = await loadModePage(id, "match");
  return <MatchMode material={material} cards={cards} serverData={data} />;
}
