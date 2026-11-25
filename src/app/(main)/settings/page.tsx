import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listGroupsForViewer } from "@/lib/server/data";
import { SettingsView } from "@/components/settings/settings-view";
import pkg from "../../../../package.json";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const groups = await listGroupsForViewer();
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const version = sha ? `${pkg.version} (${sha})` : pkg.version;
  return <SettingsView groups={groups.map((g) => ({ id: g.id, name: g.name, unlocked: g.unlocked }))} version={version} />;
}
