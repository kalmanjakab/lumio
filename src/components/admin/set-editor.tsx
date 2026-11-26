"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Plus, Trash2, Upload, X } from "lucide-react";
import { Button, Switch, TextField, cn } from "../ui";
import { Sheet } from "../sheet";
import { useToast } from "../toast";
import { ThresholdInputs } from "./admin-forms";
import { api, ApiClientError } from "@/lib/client/api";
import type { GradeThresholds } from "@/lib/db/schema";
import { DEFAULT_THRESHOLDS } from "@/lib/grading-scale";
import { parseImport } from "@/lib/import-parser";
import { useAutoReloadBlocker } from "@/lib/client/app-update";

type Row = { key: string; id?: string; term: string; definition: string; imageId: string | null };

const LANGS: [string, string][] = [
  ["hu-HU", "Magyar"],
  ["en-GB", "Angol (brit)"],
  ["en-US", "Angol (amerikai)"],
  ["de-DE", "Német"],
  ["fr-FR", "Francia"],
  ["es-ES", "Spanyol"],
  ["it-IT", "Olasz"],
  ["ru-RU", "Orosz"],
  ["pl-PL", "Lengyel"],
  ["nl-NL", "Holland"],
  ["pt-PT", "Portugál"],
  ["sk-SK", "Szlovák"],
  ["ro-RO", "Román"],
  ["hr-HR", "Horvát"],
  ["cs-CZ", "Cseh"],
  ["la", "Latin"],
  ["ja-JP", "Japán"],
  ["zh-CN", "Kínai"],
];

let keySeq = 0;
const newKey = () => `tmp-${++keySeq}`;

export type EditorMaterial = {
  id: string;
  title: string;
  description: string;
  groupId: string | null;
  termLang: string;
  definitionLang: string;
  gradeThresholds: GradeThresholds | null;
  cards: { id: string; term: string; definition: string; imageId: string | null }[];
};

/** Nagy fényképet a böngészőben kicsinyítünk feltöltés előtt (gyorsabb, kevesebb adat). */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.size < 600_000 || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

function LangSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("editor");
  const locale = useLocale();
  const known = LANGS.some(([v]) => v === value);
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  }, [locale]);
  const nameOf = (code: string, fallback: string) => {
    try {
      return names?.of(code) ?? fallback;
    } catch {
      return fallback;
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select id={id} value={known ? value : "__custom"} onChange={(e) => onChange(e.target.value === "__custom" ? "" : e.target.value)} className="h-12 rounded-xl border-2 border-border bg-surface px-3">
        {LANGS.map(([v, l]) => (
          <option key={v} value={v}>
            {nameOf(v, l)} ({v})
          </option>
        ))}
        <option value="__custom">{t("langCustom")}</option>
      </select>
      {!known ? (
        <input
          aria-label={`${label}: ${t("langCode")}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sv-SE"
          className="h-11 rounded-xl border-2 border-border bg-surface px-3"
        />
      ) : null}
    </div>
  );
}

export type EditorVariant =
  | { kind: "admin"; groups: { id: string; name: string }[]; base: string; globalThresholds: GradeThresholds }
  | { kind: "user" };

export function SetEditor({ material, variant }: { material: EditorMaterial; variant: EditorVariant }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("editor");
  const isAdmin = variant.kind === "admin";
  const groups = variant.kind === "admin" ? variant.groups : [];
  const globalThresholds = variant.kind === "admin" ? variant.globalThresholds : DEFAULT_THRESHOLDS;
  const apiUrl = isAdmin ? `/api/admin/materials/${material.id}` : `/api/me/sets/${material.id}`;
  const afterDelete = variant.kind === "admin" ? variant.base : "/library?tab=mine";
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadFor = useRef<string | null>(null);
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description);
  const [groupId, setGroupId] = useState<string>(material.groupId ?? "");
  const [termLang, setTermLang] = useState(material.termLang);
  const [definitionLang, setDefinitionLang] = useState(material.definitionLang);
  const [override, setOverride] = useState(material.gradeThresholds !== null);
  const [thresholds, setThresholds] = useState<GradeThresholds>(material.gradeThresholds ?? globalThresholds ?? DEFAULT_THRESHOLDS);
  const [rows, setRows] = useState<Row[]>(() => material.cards.map((c) => ({ key: c.id, id: c.id, term: c.term, definition: c.definition, imageId: c.imageId })));
  const [dirty, setDirty] = useState(false);
  // Mentetlen változás mellett az automatikus frissítés nem töltheti újra az oldalt.
  useAutoReloadBlocker(dirty);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const lastTermRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const mark = () => setDirty(true);
  const parsed = useMemo(() => parseImport(importText), [importText]);
  const thresholdsValid = thresholds.g5 <= 100 && thresholds.g5 > thresholds.g4 && thresholds.g4 > thresholds.g3 && thresholds.g3 > thresholds.g2 && thresholds.g2 >= 1;
  const filled = rows.filter((r) => r.term.trim() && r.definition.trim());
  const incomplete = rows.filter((r) => (r.term.trim() || r.definition.trim()) && !(r.term.trim() && r.definition.trim())).length;

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    mark();
  };
  const move = (idx: number, dir: -1 | 1) => {
    setRows((rs) => {
      const j = idx + dir;
      if (j < 0 || j >= rs.length) return rs;
      const copy = rs.slice();
      [copy[idx], copy[j]] = [copy[j]!, copy[idx]!];
      return copy;
    });
    mark();
  };
  const addRow = () => {
    setRows((rs) => [...rs, { key: newKey(), term: "", definition: "", imageId: null }]);
    mark();
    setTimeout(() => lastTermRef.current?.focus(), 30);
  };

  const pickImage = (key: string) => {
    uploadFor.current = key;
    fileRef.current?.click();
  };
  const onFile = async (file: File | undefined) => {
    const key = uploadFor.current;
    if (!file || !key) return;
    setUploading(key);
    try {
      const form = new FormData();
      form.set("materialId", material.id);
      form.set("file", await shrinkImage(file), "image");
      const r = await api<{ id: string }>("/api/images", { form });
      update(key, { imageId: r.id });
    } catch (e) {
      const code = e instanceof ApiClientError ? e.code : "";
      toast(code === "too_large" ? t("imageTooLarge") : code === "bad_type" ? t("imageBadType") : t("imageError"), "error");
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!title.trim()) return toast(t("titleEmpty"), "error");
    if (override && !thresholdsValid) return toast(t("thresholdsOrder"), "error");
    if (!termLang.trim() || !definitionLang.trim()) return toast(t("langMissing"), "error");
    setSaving(true);
    try {
      const r = await api<{ cards: { id: string; term: string; definition: string; imageId: string | null }[] }>(apiUrl, {
        method: "PUT",
        body: {
          title,
          description,
          groupId: isAdmin ? groupId || null : null,
          termLang,
          definitionLang,
          gradeThresholds: isAdmin && override ? thresholds : null,
          cards: filled.map((r) => ({ id: r.id, term: r.term, definition: r.definition, imageId: r.imageId })),
        },
      });
      setRows(r.cards.map((c) => ({ key: c.id, id: c.id, term: c.term, definition: c.definition, imageId: c.imageId })));
      setDirty(false);
      toast(t("saved", { count: r.cards.length }), "success");
      router.refresh();
    } catch (e) {
      toast(
        e instanceof ApiClientError ? (e.status === 401 ? (isAdmin ? t("adminExpired") : t("loggedOut")) : t("errorCode", { code: e.code })) : t("saveError"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const doImport = () => {
    if (parsed.cards.length === 0) return;
    if (parsed.tooMany) return toast(t("importTooMany"), "error");
    const imported = parsed.cards.map((c) => ({ key: newKey(), term: c.term, definition: c.definition, imageId: null }));
    setRows((rs) => (importMode === "replace" ? imported : [...rs.filter((r) => r.term.trim() || r.definition.trim()), ...imported]));
    setImportOpen(false);
    setImportText("");
    mark();
    toast(t("importDone", { count: imported.length }), "success");
  };

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <Link href={`/sets/${material.id}`} target={isAdmin ? "_blank" : undefined} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          {isAdmin ? t("openInApp") : t("openSet")} <ExternalLink className="size-4" aria-hidden />
        </Link>
      </div>

      <section className="grid gap-4 rounded-2xl bg-surface p-5 shadow-card md:grid-cols-2">
        <TextField className={isAdmin ? undefined : "md:col-span-2"} label={t("fieldTitle")} value={title} onChange={(e) => (setTitle(e.target.value), mark())} maxLength={120} required />
        {isAdmin ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="set-group" className="text-sm font-semibold">
              {t("fieldGroup")}
            </label>
            <select id="set-group" value={groupId} onChange={(e) => (setGroupId(e.target.value), mark())} className="h-12 rounded-xl border-2 border-border bg-surface px-3">
              <option value="">{t("groupPublic")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <TextField className="md:col-span-2" label={t("fieldDescription")} value={description} onChange={(e) => (setDescription(e.target.value), mark())} maxLength={500} />
        <LangSelect id="term-lang" label={t("termLang")} value={termLang} onChange={(v) => (setTermLang(v), mark())} />
        <LangSelect id="def-lang" label={t("definitionLang")} value={definitionLang} onChange={(v) => (setDefinitionLang(v), mark())} />
        {isAdmin ? (
          <div className="md:col-span-2">
            <Switch
              label={t("ownThresholds")}
              description={t("ownThresholdsHint", { g5: globalThresholds.g5, g4: globalThresholds.g4, g3: globalThresholds.g3, g2: globalThresholds.g2 })}
              checked={override}
              onChange={(v) => (setOverride(v), mark())}
            />
            {override ? (
              <>
                <ThresholdInputs value={thresholds} onChange={(v) => (setThresholds(v), mark())} />
                {!thresholdsValid ? <p className="mt-2 text-sm font-medium text-danger">{t("thresholdsOrder")}</p> : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            {t("cards")} <span className="text-muted">({filled.length})</span>
          </h2>
          <div className="flex gap-2">
            <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" aria-hidden /> {t("bulkImport")}
            </Button>
            <Button variant="soft" size="sm" onClick={addRow}>
              <Plus className="size-4" aria-hidden /> {t("newCard")}
            </Button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {incomplete ? <p className="text-sm font-medium text-learning">{t("incomplete", { count: incomplete })}</p> : null}
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-2xl bg-surface p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-muted">{i + 1}.</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => pickImage(r.key)}
                    disabled={uploading !== null}
                    aria-label={t("addImage")}
                    title={t("addImage")}
                    className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30"
                  >
                    <ImagePlus className="size-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")} title={t("moveUp")} className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t("moveDown")} title={t("moveDown")} className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => (setRows((rs) => rs.filter((x) => x.key !== r.key)), mark())}
                    aria-label={t("deleteCard")}
                    title={t("deleteCard")}
                    className="flex size-8 items-center justify-center rounded-full text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">{t("term")}</span>
                  <textarea
                    ref={i === rows.length - 1 ? lastTermRef : undefined}
                    value={r.term}
                    onChange={(e) => update(r.key, { term: e.target.value })}
                    rows={1}
                    maxLength={1000}
                    className={cn("min-h-11 resize-y rounded-xl border-2 border-border bg-bg px-3 py-2 [field-sizing:content] focus:border-primary focus:outline-none")}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">{t("definition")}</span>
                  <textarea
                    value={r.definition}
                    onChange={(e) => update(r.key, { definition: e.target.value })}
                    rows={1}
                    maxLength={2000}
                    className="min-h-11 resize-y rounded-xl border-2 border-border bg-bg px-3 py-2 [field-sizing:content] focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
              {uploading === r.key ? <p className="mt-2 text-sm text-muted">{t("uploading")}</p> : null}
              {r.imageId ? (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/img/${r.imageId}`} alt="" className="h-20 max-w-40 rounded-lg object-contain bg-surface-2" />
                  <button
                    type="button"
                    onClick={() => update(r.key, { imageId: null })}
                    aria-label={t("removeImage")}
                    title={t("removeImage")}
                    className="flex size-8 items-center justify-center rounded-full text-danger hover:bg-danger-soft"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <Button variant="outline" onClick={addRow} block>
          <Plus className="size-4" aria-hidden /> {t("newCard")}
        </Button>
      </section>

      <section className="rounded-2xl border-2 border-danger-soft p-5">
        <h2 className="font-bold text-danger">{t("deleteSet")}</h2>
        <p className="mb-3 mt-1 text-sm text-muted">{t("deleteSetText")}</p>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          {t("deleteSet")}
        </Button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-muted">{dirty ? t("unsaved") : t("allSaved")}</span>
          <Button onClick={save} loading={saving} disabled={!dirty && !saving}>
            {t("save")}
          </Button>
        </div>
      </div>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title={t("bulkImport")} wide>
        <p className="text-sm text-muted">{t("importHelp")}</p>
        <textarea
          aria-label={t("importText")}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          placeholder={"apple\talma\nhouse\tház"}
          className="mt-3 w-full rounded-xl border-2 border-border bg-surface p-3 font-mono text-sm focus:border-primary focus:outline-none"
        />
        <div className="mt-2 text-sm">
          <span className="font-semibold">{t("importRecognized", { count: parsed.cards.length })}</span>
          {parsed.skipped ? <span className="text-learning"> {t("importSkipped", { count: parsed.skipped })}</span> : null}
          {parsed.tooMany ? <span className="text-danger"> {t("importTooManyLines")}</span> : null}
        </div>
        {parsed.cards.length ? (
          <div className="mt-3 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-sm">
            {parsed.cards.slice(0, 5).map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 border-b border-border py-1 last:border-0">
                <span className="truncate">{c.term}</span>
                <span className="truncate text-muted">{c.definition}</span>
              </div>
            ))}
            {parsed.cards.length > 5 ? <div className="pt-1 text-muted">{t("importMore", { count: parsed.cards.length - 5 })}</div> : null}
          </div>
        ) : null}
        <fieldset className="mt-4 flex flex-wrap gap-4">
          <legend className="sr-only">{t("importModeLabel")}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="import-mode" checked={importMode === "append"} onChange={() => setImportMode("append")} /> {t("importAppend")}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="import-mode" checked={importMode === "replace"} onChange={() => setImportMode("replace")} /> {t("importReplace")}
          </label>
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={doImport} disabled={parsed.cards.length === 0 || parsed.tooMany}>
            {t("importButton")}
          </Button>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("deleteSet")}>
        <p>{t("deleteConfirm", { title: material.title })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api(apiUrl, { method: "DELETE" });
                setDirty(false);
                toast(t("deleted"), "success");
                router.push(afterDelete);
              } catch {
                toast(t("deleteError"), "error");
              }
            }}
          >
            {t("delete")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
