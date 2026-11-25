"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import { Button, Switch, TextField, cn } from "../ui";
import { Sheet } from "../sheet";
import { useToast } from "../toast";
import { ThresholdInputs } from "./admin-forms";
import { api, ApiClientError } from "@/lib/client/api";
import type { GradeThresholds } from "@/lib/db/schema";
import { DEFAULT_THRESHOLDS } from "@/lib/grading-scale";
import { parseImport } from "@/lib/import-parser";
import { useAutoReloadBlocker } from "@/lib/client/app-update";

type Row = { key: string; id?: string; term: string; definition: string };

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
  cards: { id: string; term: string; definition: string }[];
};

function LangSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const known = LANGS.some(([v]) => v === value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select id={id} value={known ? value : "__custom"} onChange={(e) => onChange(e.target.value === "__custom" ? "" : e.target.value)} className="h-12 rounded-xl border-2 border-border bg-surface px-3">
        {LANGS.map(([v, l]) => (
          <option key={v} value={v}>
            {l} ({v})
          </option>
        ))}
        <option value="__custom">Egyéb (kód megadása)</option>
      </select>
      {!known ? (
        <input
          aria-label={`${label}: nyelvkód`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="pl. sv-SE"
          className="h-11 rounded-xl border-2 border-border bg-surface px-3"
        />
      ) : null}
    </div>
  );
}

export function SetEditor({ material, groups, base, globalThresholds }: { material: EditorMaterial; groups: { id: string; name: string }[]; base: string; globalThresholds: GradeThresholds }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description);
  const [groupId, setGroupId] = useState<string>(material.groupId ?? "");
  const [termLang, setTermLang] = useState(material.termLang);
  const [definitionLang, setDefinitionLang] = useState(material.definitionLang);
  const [override, setOverride] = useState(material.gradeThresholds !== null);
  const [thresholds, setThresholds] = useState<GradeThresholds>(material.gradeThresholds ?? globalThresholds ?? DEFAULT_THRESHOLDS);
  const [rows, setRows] = useState<Row[]>(() => material.cards.map((c) => ({ key: c.id, id: c.id, term: c.term, definition: c.definition })));
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
    setRows((rs) => [...rs, { key: newKey(), term: "", definition: "" }]);
    mark();
    setTimeout(() => lastTermRef.current?.focus(), 30);
  };

  const save = async () => {
    if (!title.trim()) return toast("A cím nem lehet üres.", "error");
    if (override && !thresholdsValid) return toast("Az osztályzat-küszöbök sorrendje hibás.", "error");
    if (!termLang.trim() || !definitionLang.trim()) return toast("Add meg a nyelvkódokat.", "error");
    setSaving(true);
    try {
      const r = await api<{ cards: { id: string; term: string; definition: string }[] }>(`/api/admin/materials/${material.id}`, {
        method: "PUT",
        body: {
          title,
          description,
          groupId: groupId || null,
          termLang,
          definitionLang,
          gradeThresholds: override ? thresholds : null,
          cards: filled.map((r) => ({ id: r.id, term: r.term, definition: r.definition })),
        },
      });
      setRows(r.cards.map((c) => ({ key: c.id, id: c.id, term: c.term, definition: c.definition })));
      setDirty(false);
      toast(`Mentve (${r.cards.length} kártya).`, "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiClientError ? (e.status === 401 ? "Lejárt az admin munkamenet. Lépj be újra (a változások ebben a lapban megmaradnak)." : `Hiba: ${e.code}`) : "Hiba a mentésnél.", "error");
    } finally {
      setSaving(false);
    }
  };

  const doImport = () => {
    if (parsed.cards.length === 0) return;
    if (parsed.tooMany) return toast("Egyszerre legfeljebb 1000 kártyát importálhatsz.", "error");
    const imported = parsed.cards.map((c) => ({ key: newKey(), term: c.term, definition: c.definition }));
    setRows((rs) => (importMode === "replace" ? imported : [...rs.filter((r) => r.term.trim() || r.definition.trim()), ...imported]));
    setImportOpen(false);
    setImportText("");
    mark();
    toast(`${imported.length} kártya hozzáadva. Ne felejts el menteni!`, "success");
  };

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Készlet szerkesztése</h1>
        <Link href={`/sets/${material.id}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          Megnyitás az appban <ExternalLink className="size-4" aria-hidden />
        </Link>
      </div>

      <section className="grid gap-4 rounded-2xl bg-surface p-5 shadow-card md:grid-cols-2">
        <TextField label="Cím" value={title} onChange={(e) => (setTitle(e.target.value), mark())} maxLength={120} required />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-group" className="text-sm font-semibold">
            Csoport
          </label>
          <select id="set-group" value={groupId} onChange={(e) => (setGroupId(e.target.value), mark())} className="h-12 rounded-xl border-2 border-border bg-surface px-3">
            <option value="">Nyilvános (bárki látja, jelszó nélkül)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <TextField className="md:col-span-2" label="Leírás (nem kötelező)" value={description} onChange={(e) => (setDescription(e.target.value), mark())} maxLength={500} />
        <LangSelect id="term-lang" label="Szó nyelve (felolvasáshoz)" value={termLang} onChange={(v) => (setTermLang(v), mark())} />
        <LangSelect id="def-lang" label="Jelentés nyelve (felolvasáshoz)" value={definitionLang} onChange={(v) => (setDefinitionLang(v), mark())} />
        <div className="md:col-span-2">
          <Switch
            label="Saját osztályzat-küszöbök ehhez a készlethez"
            description={`Kikapcsolva a globális küszöbök érvényesek (5: ${globalThresholds.g5}%, 4: ${globalThresholds.g4}%, 3: ${globalThresholds.g3}%, 2: ${globalThresholds.g2}%).`}
            checked={override}
            onChange={(v) => (setOverride(v), mark())}
          />
          {override ? (
            <>
              <ThresholdInputs value={thresholds} onChange={(v) => (setThresholds(v), mark())} />
              {!thresholdsValid ? <p className="mt-2 text-sm font-medium text-danger">A küszöböknek csökkenő sorrendben kell lenniük.</p> : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            Kártyák <span className="text-muted">({filled.length})</span>
          </h2>
          <div className="flex gap-2">
            <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" aria-hidden /> Tömeges import
            </Button>
            <Button variant="soft" size="sm" onClick={addRow}>
              <Plus className="size-4" aria-hidden /> Új kártya
            </Button>
          </div>
        </div>
        {incomplete ? <p className="text-sm font-medium text-learning">{incomplete} kártyának hiányzik a szava vagy a jelentése, ezeket mentéskor kihagyom.</p> : null}
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-2xl bg-surface p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-muted">{i + 1}.</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Feljebb" title="Feljebb" className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Lejjebb" title="Lejjebb" className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30">
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => (setRows((rs) => rs.filter((x) => x.key !== r.key)), mark())}
                    aria-label="Kártya törlése"
                    title="Kártya törlése"
                    className="flex size-8 items-center justify-center rounded-full text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Szó</span>
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
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Jelentés</span>
                  <textarea
                    value={r.definition}
                    onChange={(e) => update(r.key, { definition: e.target.value })}
                    rows={1}
                    maxLength={2000}
                    className="min-h-11 resize-y rounded-xl border-2 border-border bg-bg px-3 py-2 [field-sizing:content] focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="outline" onClick={addRow} block>
          <Plus className="size-4" aria-hidden /> Új kártya
        </Button>
      </section>

      <section className="rounded-2xl border-2 border-danger-soft p-5">
        <h2 className="font-bold text-danger">Készlet törlése</h2>
        <p className="mb-3 mt-1 text-sm text-muted">A készlet, a kártyái és a hozzá tartozó haladás véglegesen törlődik.</p>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          Készlet törlése
        </Button>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-muted">{dirty ? "Nem mentett változások" : "Minden mentve"}</span>
          <Button onClick={save} loading={saving} disabled={!dirty && !saving}>
            Mentés
          </Button>
        </div>
      </div>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Tömeges import" wide>
        <p className="text-sm text-muted">
          Másold be a kártyákat: soronként egy kártya, a szó és a jelentés között <strong>tabulátor</strong> legyen (például Excelből vagy Google Táblázatból
          két oszlopot kimásolva pont így jön). Egyszerre legfeljebb 1000 sor.
        </p>
        <textarea
          aria-label="Importálandó szöveg"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          placeholder={"apple\talma\nhouse\tház"}
          className="mt-3 w-full rounded-xl border-2 border-border bg-surface p-3 font-mono text-sm focus:border-primary focus:outline-none"
        />
        <div className="mt-2 text-sm">
          <span className="font-semibold">{parsed.cards.length} kártya felismerve.</span>
          {parsed.skipped ? <span className="text-learning"> {parsed.skipped} sort kihagyok (nincs benne tabulátor, vagy üres valamelyik oldal).</span> : null}
          {parsed.tooMany ? <span className="text-danger"> Több mint 1000 sor, ez túl sok egyszerre.</span> : null}
        </div>
        {parsed.cards.length ? (
          <div className="mt-3 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-sm">
            {parsed.cards.slice(0, 5).map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 border-b border-border py-1 last:border-0">
                <span className="truncate">{c.term}</span>
                <span className="truncate text-muted">{c.definition}</span>
              </div>
            ))}
            {parsed.cards.length > 5 ? <div className="pt-1 text-muted">… és még {parsed.cards.length - 5}</div> : null}
          </div>
        ) : null}
        <fieldset className="mt-4 flex flex-wrap gap-4">
          <legend className="sr-only">Import módja</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="import-mode" checked={importMode === "append"} onChange={() => setImportMode("append")} /> Hozzáadás a végére
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="import-mode" checked={importMode === "replace"} onChange={() => setImportMode("replace")} /> Meglévő kártyák cseréje
          </label>
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(false)}>
            Mégse
          </Button>
          <Button onClick={doImport} disabled={parsed.cards.length === 0 || parsed.tooMany}>
            Importálás
          </Button>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Készlet törlése">
        <p>
          Biztosan törlöd a(z) <strong>{material.title}</strong> készletet? Ez nem vonható vissza.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Mégse
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api(`/api/admin/materials/${material.id}`, { method: "DELETE" });
                setDirty(false);
                toast("Készlet törölve.", "success");
                router.push(base);
              } catch {
                toast("Nem sikerült törölni.", "error");
              }
            }}
          >
            Törlés
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
