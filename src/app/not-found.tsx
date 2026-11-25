import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/logo";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark className="size-14" />
      <h1 className="text-2xl font-extrabold">{t("notFoundTitle")}</h1>
      <p className="text-muted">{t("notFoundText")}</p>
      <Link href="/" className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">
        {t("goHome")}
      </Link>
    </main>
  );
}
