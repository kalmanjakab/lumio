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
