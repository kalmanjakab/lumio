import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("title") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const tc = await getTranslations("common");
  const sections: [string, string][] = [
    ["whatTitle", "whatList"],
    ["guestTitle", "guestText"],
    ["cookiesTitle", "cookiesText"],
    ["deleteTitle", "deleteText"],
    ["contactTitle", "contactText"],
  ];
  return (
    <article className="mx-auto max-w-2xl">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ChevronLeft className="size-4" aria-hidden /> {tc("back")}
      </Link>
      <h1 className="mb-4 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      <p className="mb-6 text-lg">{t("intro")}</p>
      {sections.map(([h, p]) => (
        <section key={h} className="mb-6">
          <h2 className="mb-1 text-lg font-bold">{t(h)}</h2>
          <p className="text-fg">{t(p)}</p>
        </section>
      ))}
    </article>
  );
}
