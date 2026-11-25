"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, TextField, PasswordField } from "../ui";
import { Sheet } from "../sheet";
import { useToast } from "../toast";
import { api, ApiClientError } from "@/lib/client/api";
import type { GradeThresholds } from "@/lib/db/schema";

function errText(e: unknown) {
  if (e instanceof ApiClientError) {
    if (e.status === 401) return "Lejárt az admin munkamenet. Frissítsd az oldalt és lépj be újra.";
    if (e.code === "validation") return "Hibás adat. Ellenőrizd a mezőket.";
    return `Hiba: ${e.code}`;
  }
  return "Ismeretlen hiba.";
}

export function NewGroupForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/admin/groups", { method: "POST", body: { name, password } });
          setName("");
          setPassword("");
          toast("Csoport létrehozva.", "success");
          router.refresh();
        } catch (e) {
          toast(errText(e), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <TextField label="Csoport neve" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="pl. Angol" />
      <PasswordField label="Csoport jelszava (min. 4 karakter)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required autoComplete="new-password" />
      <Button type="submit" loading={busy}>
        Létrehozás
      </Button>
    </form>
  );
}

export function NewSetForm({ groups, base, defaultGroupId = null }: { groups: { id: string; name: string }[]; base: string; defaultGroupId?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState<string>(defaultGroupId ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ id: string }>("/api/admin/materials", { method: "POST", body: { title, groupId: groupId || null } });
          router.push(`${base}/sets/${r.id}`);
        } catch (e) {
          toast(errText(e), "error");
          setBusy(false);
        }
      }}
    >
      <TextField label="Új készlet címe" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="pl. Unit 3 szavak" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-set-group" className="text-sm font-semibold">
          Hová kerüljön
        </label>
        <select
          id="new-set-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="h-12 rounded-xl border-2 border-border bg-surface px-3"
        >
          <option value="">Nyilvános (jelszó nélkül)</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" loading={busy}>
        Létrehozás
      </Button>
    </form>
  );
}

export function GroupActions({ id, name, base }: { id: string; name: string; base: string }) {
  const router = useRouter();
  const toast = useToast();
  const [newName, setNewName] = useState(name);
  const [pw, setPw] = useState("");
  const [confirmKick, setConfirmKick] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok, "success");
      router.refresh();
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-3 font-bold">Átnevezés</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("rename", () => api(`/api/admin/groups/${id}`, { method: "PATCH", body: { name: newName } }), "Átnevezve.");
          }}
        >
          <TextField label="Név" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} required />
          <Button type="submit" variant="soft" loading={busy === "rename"}>
            Mentés
          </Button>
        </form>
      </section>
      <section className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-1 font-bold">Új jelszó beállítása</h2>
        <p className="mb-3 text-sm text-muted">
          A régi jelszót nem lehet visszanézni, csak újat beállítani. Jelszócsere után mindenkinek újra be kell írnia a jelszót.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "pw",
              async () => {
                await api(`/api/admin/groups/${id}/password`, { method: "POST", body: { password: pw } });
                setPw("");
              },
              "Új jelszó beállítva, a korábbi feloldások érvénytelenek.",
            );
          }}
        >
          <PasswordField label="Új jelszó (min. 4 karakter)" value={pw} onChange={(e) => setPw(e.target.value)} minLength={4} required autoComplete="new-password" />
          <Button type="submit" variant="soft" loading={busy === "pw"}>
            Jelszó cseréje
          </Button>
        </form>
      </section>
      <section className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-1 font-bold">Mindenki kizárása a csoportból</h2>
        <p className="mb-3 text-sm text-muted">A jelszó marad, de minden felhasználónak és vendégnek újra be kell írnia.</p>
        <Button variant="outline" onClick={() => setConfirmKick(true)} loading={busy === "kick"}>
          Mindenki kizárása
        </Button>
      </section>
      <section className="rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="mb-1 font-bold text-danger">Csoport törlése</h2>
        <p className="mb-3 text-sm text-muted">A csoport és az összes benne lévő készlet (kártyákkal, haladással) véglegesen törlődik.</p>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Csoport törlése
        </Button>
      </section>

      <Sheet open={confirmKick} onClose={() => setConfirmKick(false)} title="Mindenki kizárása?">
        <p>Mindenki elveszíti a hozzáférést a(z) „{name}” csoporthoz, amíg újra be nem írja a jelszót.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmKick(false)}>
            Mégse
          </Button>
          <Button
            onClick={() => {
              setConfirmKick(false);
              void run("kick", () => api(`/api/admin/groups/${id}/revoke`, { method: "POST", body: {} }), "Mindenki kizárva.");
            }}
          >
            Kizárás
          </Button>
        </div>
      </Sheet>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Csoport végleges törlése">
        <p className="mb-3">
          Írd be a csoport nevét a megerősítéshez: <strong>{name}</strong>
        </p>
        <TextField label="Csoport neve" hideLabel value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Mégse
          </Button>
          <Button
            variant="danger"
            disabled={typed.trim() !== name.trim()}
            loading={busy === "del"}
            onClick={async () => {
              setBusy("del");
              try {
                await api(`/api/admin/groups/${id}`, { method: "DELETE" });
                toast("Csoport törölve.", "success");
                router.push(base);
              } catch (e) {
                toast(errText(e), "error");
                setBusy(null);
              }
            }}
          >
            Végleges törlés
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

export function UserActions({ id, username }: { id: string; username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<"pw" | "del" | null>(null);
  const [pw, setPw] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        size="sm"
        variant="soft"
        onClick={() => {
          setPw(randomPassword());
          setShown(null);
          setOpen("pw");
        }}
      >
        Ideiglenes jelszó
      </Button>
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen("del")}>
        Törlés
      </Button>
      <Sheet open={open === "pw"} onClose={() => setOpen(null)} title={`Ideiglenes jelszó: ${username}`}>
        {shown ? (
          <div className="flex flex-col gap-3">
            <p>Add át ezt a jelszót a felhasználónak. Belépés után újat kell megadnia. Ez a jelszó többé nem jelenik meg.</p>
            <code className="select-all rounded-xl bg-surface-2 px-4 py-3 text-lg font-bold tracking-wide">{shown}</code>
            <Button onClick={() => setOpen(null)}>Kész</Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/api/admin/users/${id}`, { method: "PATCH", body: { tempPassword: pw } });
                setShown(pw);
                toast("Ideiglenes jelszó beállítva.", "success");
              } catch (e) {
                toast(errText(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <TextField label="Ideiglenes jelszó (min. 8 karakter)" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
            <p className="text-sm text-muted">A felhasználó minden eszközről kijelentkezik.</p>
            <Button type="submit" loading={busy}>
              Beállítás
            </Button>
          </form>
        )}
      </Sheet>
      <Sheet open={open === "del"} onClose={() => setOpen(null)} title="Felhasználó törlése">
        <p>
          Biztosan törlöd <strong>{username}</strong> fiókját és minden adatát? Ez nem vonható vissza.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(null)}>
            Mégse
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/admin/users/${id}`, { method: "DELETE" });
                toast("Felhasználó törölve.", "success");
                setOpen(null);
                router.refresh();
              } catch (e) {
                toast(errText(e), "error");
              } finally {
                setBusy(false);
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

export function ThresholdInputs({ value, onChange }: { value: GradeThresholds; onChange: (v: GradeThresholds) => void }) {
  const fields: [keyof GradeThresholds, string][] = [
    ["g5", "5-ös, legalább (%)"],
    ["g4", "4-es, legalább (%)"],
    ["g3", "3-as, legalább (%)"],
    ["g2", "2-es, legalább (%)"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {fields.map(([k, label]) => (
        <TextField
          key={k}
          label={label}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={String(value[k])}
          onChange={(e) => onChange({ ...value, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
        />
      ))}
    </div>
  );
}

export function GlobalThresholdsForm({ initial }: { initial: GradeThresholds }) {
  const toast = useToast();
  const [t, setT] = useState(initial);
  const [busy, setBusy] = useState(false);
  const valid = t.g5 <= 100 && t.g5 > t.g4 && t.g4 > t.g3 && t.g3 > t.g2 && t.g2 >= 1;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/admin/settings", { method: "PUT", body: { gradeThresholds: t } });
          toast("Mentve.", "success");
        } catch (e) {
          toast(errText(e), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <ThresholdInputs value={t} onChange={setT} />
      {!valid ? <p className="text-sm font-medium text-danger">A küszöböknek csökkenő sorrendben kell lenniük (5-ös &gt; 4-es &gt; 3-as &gt; 2-es).</p> : null}
      <p className="text-sm text-muted">Az ennél kisebb eredmény 1-es.</p>
      <div>
        <Button type="submit" loading={busy} disabled={!valid}>
          Mentés
        </Button>
      </div>
    </form>
  );
}
