import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { getRecentForUser, getStarredForUser, getTestsForUser, listAccessibleMaterials, listGroupsForViewer } from "@/lib/server/data";
import { LibraryView } from "@/components/library/library-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("title") };
}

export default async function LibraryPage() {
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
      serverStarred={starred}
      serverRecent={recent}
      serverTests={tests}
    />
  );
}
