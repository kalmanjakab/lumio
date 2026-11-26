import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { getMaterialForViewer } from "@/lib/server/data";
import { SetEditor } from "@/components/admin/set-editor";
import { ModeHeader } from "@/components/modes/mode-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("editor");
  return { title: t("title") };
}

/** Saját készlet szerkesztése. Más készletét nem lehet itt szerkeszteni. */
export default async function EditOwnSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== "user") redirect(`/login?next=${encodeURIComponent(`/sets/${id}/edit`)}`);
  const r = await getMaterialForViewer(id);
  if (r.status !== "ok" || !r.material.isOwn) notFound();
  const m = r.material;
  const t = await getTranslations("editor");
  return (
    <div className="min-h-dvh">
      <ModeHeader backHref={`/sets/${m.id}`} center={t("title")} />
      <main className="mx-auto max-w-4xl px-4 pt-2">
        <SetEditor
          variant={{ kind: "user" }}
          material={{
            id: m.id,
            title: m.title,
            description: m.description,
            groupId: null,
            termLang: m.termLang,
            definitionLang: m.definitionLang,
            gradeThresholds: null,
            cards: r.cards,
          }}
        />
      </main>
    </div>
  );
}
