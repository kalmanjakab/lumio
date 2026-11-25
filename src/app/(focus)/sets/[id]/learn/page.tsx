import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadModePage } from "@/lib/server/mode-page";
import { LearnMode } from "@/components/modes/learn-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("learn");
  return { title: t("title") };
}

export default async function LearnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cards?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { material, cards, data } = await loadModePage(id, "learn");
  const valid = new Set(cards.map((c) => c.id));
  const subset = typeof sp.cards === "string" ? sp.cards.split(",").filter((x) => valid.has(x)).slice(0, 2000) : null;
  return <LearnMode material={material} cards={cards} serverData={data} subset={subset && subset.length ? subset : null} />;
}
