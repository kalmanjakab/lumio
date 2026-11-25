import "server-only";

export const DEFAULT_ADMIN_SLUG = "jakab-admin-page-do-not-touch";

export function adminSlug(): string {
  const raw = (process.env.ADMIN_PATH_SLUG || "").trim();
  return /^[a-z0-9][a-z0-9-]{7,79}$/.test(raw) ? raw : DEFAULT_ADMIN_SLUG;
}

export function adminBase(): string {
  return `/${adminSlug()}`;
}

export function isProd() {
  return process.env.NODE_ENV === "production";
}

// Helyi e2e tesztekhez (http://localhost) kikapcsolható a Secure/__Host- előtag. Élesben soha.
export function secureCookies(): boolean {
  return process.env.FLASHLY_INSECURE_COOKIES !== "1";
}

export function cookieName(base: string): string {
  return secureCookies() ? `__Host-${base}` : base;
}

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET || "";
  if (s.length < 32) {
    if (isProd() && process.env.FLASHLY_ALLOW_WEAK_SECRET !== "1") {
      throw new Error("SESSION_SECRET hiányzik vagy túl rövid (min. 32 karakter)");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789");
  }
  return new TextEncoder().encode(s);
}

/**
 * Az admin jelszó argon2id hash-e. A generátor base64 formában adja ki (abban nincs „$” jel),
 * mert a „$” jeleket a futtatókörnyezet változóként értelmezheti és kivághatja.
 * A nyers „$argon2id$…” formát is elfogadjuk.
 */
export function adminPasswordHash(): string | null {
  const raw = (process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (!raw) return null;
  if (raw.startsWith("$argon2")) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    if (decoded.startsWith("$argon2")) return decoded;
  } catch {
    /* érvénytelen érték */
  }
  return null;
}
