"use client";

import { useState } from "react";
import { argon2id } from "hash-wasm";
import { Copy, Download, ShieldCheck } from "lucide-react";
import { makeZip } from "@/lib/client/zip";
import { Button, PasswordField } from "../ui";
import { LogoMark } from "../logo";

// A hash a böngészőben készül: a jelszó nem megy el sehova (se szerverre, se máshová).
async function makeHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoded = await argon2id({ password, salt, parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: "encoded" });
  // Base64 formában adjuk ki, mert a „$” jeleket a szerver környezete változóként értelmezhetné.
  return btoa(encoded);
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <code className="block select-all break-all rounded-xl bg-surface-2 p-3 text-sm">{value}</code>
      <Button
        variant="soft"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* a mező kijelölhető kézzel is */
          }
        }}
      >
        <Copy className="size-4" aria-hidden /> {copied ? "Kimásolva" : "Másolás"}
      </Button>
    </div>
  );
}

function SkillDownload({ files }: { files: { path: string; content: string }[] }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <h2 className="font-bold">4. Claude skill letöltése (az import API-hoz)</h2>
      <p className="text-sm text-muted">
        Másold be ide ugyanazt a kulcsot, amit a Vercelen az IMPORT_API_KEY-be tettél. A skill a böngésződben áll össze, a kulcs nem megy el a szerverre. A letöltött ZIP-et a Claude appban a Beállítások → Képességek → Skillek részen töltsd fel.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          const k = key.trim();
          if (k.length < 32 || /[\s,]/.test(k)) return setErr("Ez nem tűnik érvényes kulcsnak (legalább 32 karakter, szóköz és vessző nélkül).");
          if (!files.length) return setErr("A skill fájljai nem érhetők el ezen a szerveren.");
          const config = JSON.stringify({ baseUrl: window.location.origin, apiKey: k }, null, 2) + "\n";
          const zip = makeZip([...files, { path: "config.json", content: config }].map((f) => ({ path: `flashly-import/${f.path}`, content: f.content })));
          const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = "flashly-import.zip";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          setKey("");
          setDone(true);
        }}
      >
        <PasswordField label="IMPORT_API_KEY" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        {err ? (
          <p role="alert" className="font-medium text-danger">
            {err}
          </p>
        ) : null}
        <Button type="submit" variant="soft">
          <Download className="size-4" aria-hidden /> Skill letöltése (ZIP)
        </Button>
      </form>
      {done ? <p className="text-sm text-known">Kész. A ZIP-ben benne van a kulcs, ezért ne oszd meg senkivel, feltöltés után törölheted.</p> : null}
    </section>
  );
}

export function HashTool({ skillFiles = [] }: { skillFiles?: { path: string; content: string }[] }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 py-10">
      <div className="flex items-center gap-3">
        <LogoMark className="size-10" />
        <h1 className="text-2xl font-extrabold">Jelszó-hash generátor</h1>
      </div>
      <p className="flex gap-2 rounded-2xl bg-known-soft p-4 text-sm text-known">
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        A hash itt, a te böngésződben készül. A jelszavad nem kerül el sehova: se a szerverre, se máshová.
      </p>

      <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="font-bold">1. Admin jelszó → ADMIN_PASSWORD_HASH</h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            if (pw.length < 12) return setErr("Az admin jelszó legyen legalább 12 karakter.");
            if (pw !== pw2) return setErr("A két jelszó nem egyezik.");
            setBusy(true);
            try {
              setHash(await makeHash(pw));
              setPw("");
              setPw2("");
            } catch {
              setErr("Nem sikerült a hash készítése ebben a böngészőben.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <PasswordField label="Admin jelszó (min. 12 karakter)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <PasswordField label="Admin jelszó újra" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          {err ? (
            <p role="alert" className="font-medium text-danger">
              {err}
            </p>
          ) : null}
          <Button type="submit" loading={busy}>
            Hash készítése
          </Button>
        </form>
        {hash ? <CopyBox label="Ezt másold be a Vercelen az ADMIN_PASSWORD_HASH értékének:" value={hash} /> : null}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="font-bold">2. Véletlen titok → SESSION_SECRET</h2>
        <p className="text-sm text-muted">Egy hosszú, véletlen szöveg, amivel a szerver a vendég-sütiket aláírja. Csak egyszer kell beállítani.</p>
        <Button variant="soft" onClick={() => setSecret(randomSecret())}>
          Titok generálása
        </Button>
        {secret ? <CopyBox label="Ezt másold be a Vercelen a SESSION_SECRET értékének:" value={secret} /> : null}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
        <h2 className="font-bold">3. API-kulcs → IMPORT_API_KEY (nem kötelező)</h2>
        <p className="text-sm text-muted">
          Ezzel a kulccsal tudnak külső AI-agentek kártyakészletet feltölteni (POST /api/v1/sets). Ha nem állítod be, ez a végpont ki van kapcsolva. A kulcsot az agent beállításaiba is be kell másolnod.
        </p>
        <Button variant="soft" onClick={() => setApiKey(randomSecret())}>
          API-kulcs generálása
        </Button>
        {apiKey ? <CopyBox label="Ezt másold be a Vercelen az IMPORT_API_KEY értékének (és az agentnek):" value={apiKey} /> : null}
      </section>

      <SkillDownload files={skillFiles} />
    </main>
  );
}
