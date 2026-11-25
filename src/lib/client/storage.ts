"use client";

const PREFIX = "flashly:";

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* tárhely tele vagy tiltva */
  }
}

export function removeLocal(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nincs teendő */
  }
}

export function localKeys(prefix: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
    }
  } catch {
    /* nincs teendő */
  }
  return out;
}

export function setCookie(name: string, value: string, days = 365) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${days * 86400}; SameSite=Lax${secure}`;
}
