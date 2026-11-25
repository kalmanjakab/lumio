import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listGroupsForViewer } from "@/lib/server/data";
import { GroupTile } from "@/components/material-row";
import { EmptyState } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groups");
  return { title: t("title") };
}

export default async function GroupsPage() {
  const t = await getTranslations("groups");
  const tc = await getTranslations("common");
  const groups = await listGroupsForViewer();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      {groups.length === 0 ? (
        <EmptyState>{t("noMaterials")}</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <GroupTile
                href={`/groups/${g.id}`}
                name={g.name}
                meta={g.unlocked ? `${t("open")} · ${tc("materials", { count: g.materialCount ?? 0 })}` : tc("locked")}
                locked={!g.unlocked}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
