import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { getRecentForUser, listAccessibleMaterials, listGroupsForViewer } from "@/lib/server/data";
import { ContinueCarousel } from "@/components/home/continue-carousel";
import { GuestNudge } from "@/components/home/guest-nudge";
import { GroupTile, MaterialRow } from "@/components/material-row";
import { EmptyState, SectionTitle } from "@/components/ui";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const viewer = await getViewer();
  const [groups, materials, recent] = await Promise.all([
    listGroupsForViewer(),
    listAccessibleMaterials(),
    viewer.kind === "user" ? getRecentForUser(viewer.user.id) : Promise.resolve(null),
  ]);
  const myGroups = groups.filter((g) => g.unlocked);
  const publicSets = materials.filter((m) => m.groupId === null);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold sm:text-3xl">
        {viewer.kind === "user" ? t("greeting", { name: viewer.user.username }) : t("greetingGuest")}
      </h1>
      <GuestNudge />
      <ContinueCarousel serverItems={recent} materials={materials.map((m) => ({ id: m.id, title: m.title, cardCount: m.cardCount }))} />

      <section aria-labelledby="my-groups" className="mb-10">
        <SectionTitle id="my-groups">{t("myGroups")}</SectionTitle>
        {myGroups.length === 0 ? (
          <EmptyState>{t("noGroups")}</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myGroups.map((g) => (
              <li key={g.id}>
                <GroupTile href={`/groups/${g.id}`} name={g.name} meta={tc("materials", { count: g.materialCount ?? 0 })} locked={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="all-groups" className="mb-10">
        <SectionTitle id="all-groups">{t("allGroups")}</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <GroupTile href={`/groups/${g.id}`} name={g.name} meta={g.unlocked ? tc("seeAll") : tc("locked")} locked={!g.unlocked} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="public-sets">
        <SectionTitle id="public-sets">{t("publicSets")}</SectionTitle>
        {publicSets.length === 0 ? (
          <EmptyState>{t("noPublicSets")}</EmptyState>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {publicSets.map((m) => (
              <li key={m.id}>
                <MaterialRow href={`/sets/${m.id}`} title={m.title} meta={`${tc("cards", { count: m.cardCount })} · ${tc("public")}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
