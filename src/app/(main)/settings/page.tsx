import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listGroupsForViewer } from "@/lib/server/data";
import { SettingsView } from "@/components/settings/settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const groups = await listGroupsForViewer();
  return <SettingsView groups={groups.map((g) => ({ id: g.id, name: g.name, unlocked: g.unlocked }))} />;
}
