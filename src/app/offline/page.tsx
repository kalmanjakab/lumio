import { getTranslations } from "next-intl/server";
import { OfflineStudy } from "@/components/offline/offline-study";

// Offline oldal: a szerver csak a (személyes adatot nem tartalmazó) felületet adja,
// a mentett készleteket a böngésző olvassa be a saját tárolójából. Ezért a service worker eltárolhatja.
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <OfflineStudy
      t={{
        title: t("title"),
        text: t("textSaved"),
        retry: t("retry"),
        savedTitle: t("savedTitle"),
        none: t("none"),
        cards: t.raw("cards") as string,
        study: t("study"),
        back: t("back"),
        know: t("know"),
        dontKnow: t("dontKnow"),
        flip: t("flip"),
        done: t.raw("done") as string,
        again: t("again"),
        againMissed: t.raw("againMissed") as string,
        savedNote: t("savedNote"),
      }}
    />
  );
}
