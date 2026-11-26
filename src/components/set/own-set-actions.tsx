"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Pencil, Plus } from "lucide-react";
import { Button, TextField } from "../ui";
import { Sheet } from "../sheet";
import { useToast } from "../toast";
import { useSettings } from "../providers";
import { api, ApiClientError } from "@/lib/client/api";

function errorText(t: (k: string) => string, e: unknown) {
  const code = e instanceof ApiClientError ? e.code : "";
  if (code === "too_many_sets") return t("tooManySets");
  if (code === "too_many_requests") return t("tooFast");
  return t("createError");
}

/** „Új készlet” gomb: cím megadása, létrehozás, majd a szerkesztő megnyitása. */
export function NewSetButton({ size = "md" }: { size?: "sm" | "md" }) {
  const t = useTranslations("ownSets");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/me/sets", { body: { title: title.trim() } });
      router.push(`/sets/${r.id}/edit`);
    } catch (e) {
      toast(errorText(t, e), "error");
      setBusy(false);
    }
  };
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> {t("newSet")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("newSet")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="flex flex-col gap-4"
        >
          <TextField label={t("titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={busy} disabled={!title.trim()}>
              {t("create")}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

/** A készlet oldalán: saját készletnél szerkesztés, másénál másolat a saját könyvtárba. */
export function SetOwnerActions({ materialId, isOwn }: { materialId: string; isOwn: boolean }) {
  const t = useTranslations("ownSets");
  const router = useRouter();
  const toast = useToast();
  const { viewer } = useSettings();
  const [busy, setBusy] = useState(false);
  if (isOwn) {
    return (
      <Link href={`/sets/${materialId}/edit`} className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-card hover:bg-surface-2">
        <Pencil className="size-4" aria-hidden /> {t("edit")}
      </Link>
    );
  }
  if (viewer.kind !== "user") {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/sets/${materialId}`)}`}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-card hover:bg-surface-2"
        title={t("copyNeedsAccount")}
      >
        <Copy className="size-4" aria-hidden /> {t("copy")}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ id: string }>("/api/me/sets/copy", { body: { materialId } });
          toast(t("copied"), "success");
          router.push(`/sets/${r.id}/edit`);
        } catch (e) {
          toast(errorText(t, e), "error");
          setBusy(false);
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-card hover:bg-surface-2 disabled:opacity-50"
    >
      <Copy className="size-4" aria-hidden /> {t("copy")}
    </button>
  );
}
