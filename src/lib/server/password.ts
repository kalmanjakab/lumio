import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP ajánlás argon2id-re: 19 MiB memória, 2 iteráció, 1 szál.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { ...OPTS, algorithm: 2 /* Argon2id */ });
}

export async function verifyPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored || !stored.startsWith("$argon2")) {
    // Időzítés kiegyenlítése, hogy ne lehessen mérni, létezik-e a fiók.
    await hash(password, { ...OPTS, algorithm: 2 }).catch(() => null);
    return false;
  }
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// Egy előre kiszámolt hash az időzítés kiegyenlítéséhez, ha a felhasználó nem létezik.
let dummy: string | null = null;
export async function dummyHash(): Promise<string> {
  if (!dummy) dummy = await hashPassword("flashly-dummy-password-for-timing");
  return dummy;
}
