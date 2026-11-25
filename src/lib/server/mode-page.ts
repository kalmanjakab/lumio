import "server-only";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "./auth";
import { getMaterialForViewer, loadStudyDataForUser } from "./data";

/** Közös betöltés a tanulási módok oldalaihoz: jogosultság-ellenőrzés, kártyák, mentett adatok. */
export async function loadModePage(id: string, mode: string) {
  const r = await getMaterialForViewer(id);
  if (r.status === "not_found") notFound();
  if (r.status === "locked") redirect(`/groups/${r.group.id}?next=${encodeURIComponent(`/sets/${id}/${mode}`)}`);
  const viewer = await getViewer();
  const data = viewer.kind === "user" ? await loadStudyDataForUser(viewer.user.id, id) : null;
  const { gradeThresholds, ...material } = r.material;
  return { material, gradeThresholds, cards: r.cards, data };
}
