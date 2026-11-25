import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getMaterialForViewer, loadStudyDataForUser } from "@/lib/server/data";
import { SetView } from "@/components/set/set-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await getMaterialForViewer((await params).id);
  return { title: r.status === "ok" ? r.material.title : "Flashly" };
}

export default async function SetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getMaterialForViewer(id);
  if (r.status === "not_found") notFound();
  if (r.status === "locked") redirect(`/groups/${r.group.id}?next=${encodeURIComponent(`/sets/${id}`)}`);
  const viewer = await getViewer();
  const data = viewer.kind === "user" ? await loadStudyDataForUser(viewer.user.id, id) : null;
  const { gradeThresholds: _g, ...material } = r.material;
  return <SetView material={material} cards={r.cards} serverData={data} />;
}
