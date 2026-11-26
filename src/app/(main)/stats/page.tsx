import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { getActivityHistory } from "@/lib/server/activity";
import { getSetStatsForUser } from "@/lib/server/review";
import { listAccessibleMaterials } from "@/lib/server/data";
import { StatsView } from "@/components/stats/stats-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

export default async function StatsPage() {
  const viewer = await getViewer();
  if (viewer.kind === "user") {
    const [history, sets] = await Promise.all([getActivityHistory(viewer.user.id, 190), getSetStatsForUser(viewer.user.id)]);
    return <StatsView serverHistory={history} serverSets={sets} materials={null} />;
  }
  const materials = await listAccessibleMaterials();
  return <StatsView serverHistory={null} serverSets={null} materials={materials.map((m) => ({ id: m.id, title: m.title, cardCount: m.cardCount }))} />;
}
