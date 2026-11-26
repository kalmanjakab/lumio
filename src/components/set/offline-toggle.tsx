"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudDownload, CloudOff } from "lucide-react";
import type { CardDTO, MaterialDTO } from "@/lib/study-types";
import { isSavedOffline, removeOffline, saveOffline } from "@/lib/client/offline";
import { useToast } from "../toast";

/** „Mentés offline használatra” – csak nyilvános és saját készletnél. */
export function OfflineToggle({ material, cards }: { material: MaterialDTO; cards: CardDTO[] }) {
  const t = useTranslations("offline");
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const payload = { id: material.id, title: material.title, termLang: material.termLang, definitionLang: material.definitionLang, cards };

  useEffect(() => {
    const s = isSavedOffline(material.id);
    setSaved(s);
    // Ha már el van mentve, frissítjük a tárolt példányt a legújabb kártyákkal.
    if (s && cards.length) saveOffline(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.id, cards]);

  if (material.groupId !== null || cards.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (saved) {
          removeOffline(material.id);
          setSaved(false);
          toast(t("removed"), "success");
          return;
        }
        const r = saveOffline(payload);
        if (r === "ok") {
          setSaved(true);
          toast(t("saved"), "success");
        } else toast(r === "full" ? t("full") : t("saveFailed"), "error");
      }}
      aria-pressed={saved}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-semibold hover:bg-border"
    >
      {saved ? <CloudOff className="size-4" aria-hidden /> : <CloudDownload className="size-4" aria-hidden />}
      {saved ? t("unsave") : t("save")}
    </button>
  );
}
