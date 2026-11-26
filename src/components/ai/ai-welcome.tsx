"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb, Sparkles, Wand2 } from "lucide-react";
import { Sheet } from "../sheet";
import { Button } from "../ui";
import { useSettings } from "../providers";
import { api } from "@/lib/client/api";

/** Egyszer megjelenő ablak, miután az admin bekapcsolta a felhasználónak az AI funkciókat. */
export function AiWelcome() {
  const t = useTranslations("ai");
  const { viewer } = useSettings();
  const [open, setOpen] = useState(viewer.kind === "user" && viewer.aiWelcome);
  if (viewer.kind !== "user" || !viewer.aiWelcome) return null;

  const close = () => {
    setOpen(false);
    void api("/api/ai/status", { method: "POST", body: { action: "dismissWelcome" } }).catch(() => {});
  };
  const items = [
    { icon: Sparkles, title: t("welcomeExplainTitle"), body: t("welcomeExplainBody") },
    { icon: Lightbulb, title: t("welcomeMnemonicTitle"), body: t("welcomeMnemonicBody") },
    { icon: Wand2, title: t("welcomeTipsTitle"), body: t("welcomeTipsBody") },
  ];
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("welcomeTitle")}
      footer={
        <Button block onClick={close}>
          {t("welcomeOk")}
        </Button>
      }
    >
      <p className="mb-4">{t("welcomeIntro")}</p>
      <ul className="flex flex-col gap-3">
        {items.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="block text-sm text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">{t("welcomeLimit", { count: 20 })}</p>
    </Sheet>
  );
}
