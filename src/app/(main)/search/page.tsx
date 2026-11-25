import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { searchMaterials } from "@/lib/server/data";
import { MaterialRow } from "@/components/material-row";
import { EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/library/search-box";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getTranslations("search");
  const tc = await getTranslations("common");
  const q = typeof (await searchParams).q === "string" ? (await searchParams).q!.slice(0, 80) : "";
  const results = q.trim() ? await searchMaterials(q) : [];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      <SearchBox initial={q} />
      <p className="mb-6 mt-2 text-sm text-muted">{t("hint")}</p>
      {q.trim() ? (
        results.length === 0 ? (
          <EmptyState>{t("noResults", { q })}</EmptyState>
        ) : (
          <>
            <p className="mb-2 text-sm font-semibold text-muted">{t("results", { count: results.length })}</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {results.map((r) => (
                <li key={r.material.id}>
                  <MaterialRow
                    href={`/sets/${r.material.id}`}
                    title={r.material.title}
                    meta={`${tc("cards", { count: r.material.cardCount })} · ${r.material.groupName ?? tc("public")}`}
                    matched={r.matchedCard ? t("matchedCard", { text: r.matchedCard }) : null}
                  />
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
}
