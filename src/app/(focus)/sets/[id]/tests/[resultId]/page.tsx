import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { getViewer } from "@/lib/server/auth";
import { getMaterialForViewer, toTestRecord } from "@/lib/server/data";
import { PastTestView } from "@/components/modes/past-test-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("test");
  return { title: t("pastResult") };
}

export default async function PastTestPage({ params }: { params: Promise<{ id: string; resultId: string }> }) {
  const { id, resultId } = await params;
  const m = await getMaterialForViewer(id);
  if (m.status === "not_found") notFound();
  if (m.status === "locked") redirect(`/groups/${m.group.id}`);
  const viewer = await getViewer();
  let record = null;
  if (/^[0-9a-f-]{36}$/i.test(resultId)) {
    if (viewer.kind !== "user") notFound();
    // Csak a saját eredmény kérhető le.
    const [row] = await db
      .select()
      .from(schema.testResults)
      .where(and(eq(schema.testResults.id, resultId), eq(schema.testResults.userId, viewer.user.id), eq(schema.testResults.materialId, id)));
    if (!row) notFound();
    record = toTestRecord(row);
  } else if (!/^local-\d+$/.test(resultId)) notFound();
  return <PastTestView materialId={id} materialTitle={m.material.title} record={record} localId={record ? null : resultId} />;
}
