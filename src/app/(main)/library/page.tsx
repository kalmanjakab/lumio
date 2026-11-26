import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { getRecentForUser, getStarredForUser, getTestsForUser, listAccessibleMaterials, listGroupsForViewer } from "@/lib/server/data";
import { LibraryView, type LibraryTab } from "@/components/library/library-view";

const TAB_VALUES: LibraryTab[] = ["groups", "mine", "starred", "recent", "tests"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("title") };
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab = TAB_VALUES.find((x) => x === tab);
  const viewer = await getViewer();
  const [groups, materials] = await Promise.all([listGroupsForViewer(), listAccessibleMaterials()]);
  let starred = null,
    recent = null,
    tests = null;
  if (viewer.kind === "user") {
    const [s, r, te] = await Promise.all([getStarredForUser(viewer.user.id), getRecentForUser(viewer.user.id, 30), getTestsForUser(viewer.user.id)]);
    starred = s;
    recent = r.map((x) => ({ materialId: x.materialId, title: x.title, cardCount: x.cardCount }));
    tests = te;
  }
  return (
    <LibraryView
      groups={groups.filter((g) => g.unlocked).map((g) => ({ id: g.id, name: g.name, materialCount: g.materialCount }))}
      materials={materials.map((m) => ({ id: m.id, title: m.title, cardCount: m.cardCount }))}
      mySets={viewer.kind === "user" ? materials.filter((m) => m.isOwn).map((m) => ({ id: m.id, title: m.title, cardCount: m.cardCount })) : null}
      initialTab={initialTab}
      serverStarred={starred}
      serverRecent={recent}
      serverTests={tests}
    />
  );
}
