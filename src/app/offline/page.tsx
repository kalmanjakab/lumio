import { getTranslations } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { LogoMark } from "@/components/logo";

// Statikus offline oldal: nincs benne semmilyen személyes adat, ezért a service worker eltárolhatja.
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark className="size-16" />
      <WifiOff className="size-8 text-muted" aria-hidden />
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="text-muted">{t("text")}</p>
      <a href="/" className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary">
        {t("retry")}
      </a>
    </main>
  );
}
