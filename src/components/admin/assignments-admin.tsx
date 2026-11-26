"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { Button, TextField } from "../ui";
import { useToast } from "../toast";
import { ConfirmDialog } from "../sheet";

function errText(e: unknown) {
  if (e instanceof ApiClientError) {
    if (e.status === 401) return "Lejárt az admin munkamenet. Frissítsd az oldalt és lépj be újra.";
    if (e.code === "validation") return "Hibás adat. Ellenőrizd a készletet és a határidőt (nem lehet múltbeli).";
    if (e.code === "too_many") return "Túl sok feladat ebben a csoportban. Törölj régieket.";
    return `Hiba: ${e.code}`;
  }
  return "Ismeretlen hiba.";
}

function defaultDue() {
  const d = new Date(Date.now() + 7 * 86400_000);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewAssignmentForm({ groupId, sets }: { groupId: string; sets: { id: string; title: string; scope: "group" | "public" }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [materialId, setMaterialId] = useState(sets[0]?.id ?? "");
  const [due, setDue] = useState(defaultDue);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!sets.length) return <p className="text-muted">Előbb hozz létre egy készletet ebben a csoportban (vagy nyilvánosat).</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/api/admin/groups/${groupId}/assignments`, { method: "POST", body: { materialId, dueAt: new Date(due).toISOString(), note } });
          setNote("");
          toast("Feladat kiosztva. A csoport tagjai értesítést kapnak.", "success");
          router.refresh();
        } catch (err) {
          toast(errText(err), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Készlet</span>
        <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="h-11 rounded-xl border border-border bg-surface px-3">
          <optgroup label="Ebben a csoportban">
            {sets
              .filter((s) => s.scope === "group")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </optgroup>
          <optgroup label="Nyilvános">
            {sets
              .filter((s) => s.scope === "public")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Határidő</span>
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} required className="h-11 rounded-xl border border-border bg-surface px-3" />
      </label>
      <div className="sm:col-span-2">
        <TextField label="Megjegyzés (nem kötelező)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="pl. A 3. leckéig, a teszt legalább 80% legyen" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>
          Kiosztás
        </Button>
      </div>
    </form>
  );
}

export function DeleteAssignmentButton({ groupId, id, title }: { groupId: string; id: string; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => (e.preventDefault(), setOpen(true))} className="flex size-9 items-center justify-center rounded-full text-danger hover:bg-danger-soft" aria-label={`Feladat törlése: ${title}`}>
        <Trash2 className="size-4" aria-hidden />
      </button>
      <ConfirmDialog
        open={open}
        title="Feladat törlése"
        text={`Biztosan törlöd a(z) „${title}” feladatot? A tanulók haladása megmarad, csak a feladat tűnik el.`}
        confirmLabel="Törlés"
        cancelLabel="Mégse"
        danger
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setOpen(false);
          try {
            await api(`/api/admin/groups/${groupId}/assignments?aid=${id}`, { method: "DELETE" });
            router.refresh();
          } catch (err) {
            toast(errText(err), "error");
          }
        }}
      />
    </>
  );
}
