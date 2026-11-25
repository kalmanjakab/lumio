import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db, schema } from "@/lib/db";
import { cookieName, secureCookies, sessionSecret } from "./env";
import { randomToken, sha256 } from "./crypto";
import { ApiError } from "./http";

const SESSION_DAYS = 30;
const SESSION_RENEW_BELOW_DAYS = 20;
const GUEST_DAYS = 90;
const ADMIN_HOURS = 2;

export const SESSION_COOKIE = () => cookieName("flashly_session");
export const GUEST_COOKIE = () => cookieName("flashly_guest");
export const ADMIN_COOKIE = () => cookieName("flashly_admin");

export type SessionUser = {
  id: string;
  username: string;
  avatarPreset: string | null;
  hasAvatarImage: boolean;
  avatarVersion: number;
  mustChangePassword: boolean;
};

export type GuestGrants = Record<string, number>; // groupId -> accessVersion

export type Viewer =
  | { kind: "user"; user: SessionUser; sessionHash: string; sessionExpiresAt: Date }
  | { kind: "guest"; grants: GuestGrants };

// ---------- Felhasználói session ----------

export async function createUserSession(userId: string) {
  const token = randomToken(32);
  const idHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ idHash, userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Ritkán takarítunk lejárt sessionöket.
  if (Math.random() < 0.05) {
    void db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).catch(() => {});
  }
}

export async function destroyUserSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.idHash, sha256(token)));
  }
  jar.delete({ name: SESSION_COOKIE(), path: "/", secure: secureCookies() });
}

const loadSession = cache(async (token: string) => {
  const idHash = sha256(token);
  const rows = await db
    .select({
      expiresAt: schema.sessions.expiresAt,
      id: schema.users.id,
      username: schema.users.username,
      avatarPreset: schema.users.avatarPreset,
      hasAvatarImage: schema.users.hasAvatarImage,
      avatarVersion: schema.users.avatarVersion,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.idHash, idHash), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const { expiresAt, ...user } = row;
  return { user, idHash, expiresAt };
});

// ---------- Vendég hozzáférés (aláírt cookie) ----------

async function readGuestGrants(): Promise<GuestGrants> {
  const jar = await cookies();
  const raw = jar.get(GUEST_COOKIE())?.value;
  if (!raw) return {};
  try {
    const { payload } = await jwtVerify(raw, sessionSecret(), { algorithms: ["HS256"], issuer: "flashly", audience: "guest" });
    const g = payload.g;
    if (!g || typeof g !== "object") return {};
    const out: GuestGrants = {};
    for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
      if (/^[0-9a-f-]{36}$/.test(k) && typeof v === "number") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeGuestGrants(grants: GuestGrants) {
  const jar = await cookies();
  if (Object.keys(grants).length === 0) {
    jar.delete({ name: GUEST_COOKIE(), path: "/", secure: secureCookies() });
    return;
  }
  const token = await new SignJWT({ g: grants })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("flashly")
    .setAudience("guest")
    .setIssuedAt()
    .setExpirationTime(`${GUEST_DAYS}d`)
    .sign(sessionSecret());
  jar.set(GUEST_COOKIE(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_DAYS * 86400,
  });
}

export async function readGuestGrantsForMigration() {
  return readGuestGrants();
}

// ---------- Néző (felhasználó vagy vendég) ----------

export const getViewer = cache(async (): Promise<Viewer> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token && token.length < 200) {
    const s = await loadSession(token);
    if (s) return { kind: "user", user: s.user, sessionHash: s.idHash, sessionExpiresAt: s.expiresAt };
  }
  return { kind: "guest", grants: await readGuestGrants() };
});

/** API-ban: bejelentkezett felhasználót vár, és szükség esetén megújítja a session lejáratát. */
export async function requireUser(): Promise<SessionUser> {
  const v = await getViewer();
  if (v.kind !== "user") throw new ApiError(401, "unauthorized");
  const renewBelow = Date.now() + SESSION_RENEW_BELOW_DAYS * 86400_000;
  if (v.sessionExpiresAt.getTime() < renewBelow) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.idHash, v.sessionHash));
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE())?.value;
    if (token) {
      jar.set(SESSION_COOKIE(), token, { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", expires: expiresAt });
    }
  }
  return v.user;
}

// ---------- Csoport-hozzáférés ----------

/** Azok a csoport-azonosítók, amelyekhez a nézőnek érvényes (verzió-egyező) hozzáférése van. */
export const getAccessibleGroupIds = cache(async (): Promise<Set<string>> => {
  const v = await getViewer();
  if (v.kind === "user") {
    const rows = await db
      .select({ id: schema.groups.id })
      .from(schema.userGroupAccess)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.userGroupAccess.groupId))
      .where(
        and(
          eq(schema.userGroupAccess.userId, v.user.id),
          eq(schema.userGroupAccess.accessVersion, schema.groups.accessVersion),
        ),
      );
    return new Set(rows.map((r) => r.id));
  }
  const ids = Object.keys(v.grants);
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: schema.groups.id, accessVersion: schema.groups.accessVersion })
    .from(schema.groups)
    .where(inArray(schema.groups.id, ids));
  return new Set(rows.filter((r) => v.grants[r.id] === r.accessVersion).map((r) => r.id));
});

export async function canAccessGroup(groupId: string | null): Promise<boolean> {
  if (groupId === null) return true;
  return (await getAccessibleGroupIds()).has(groupId);
}

// ---------- Admin session ----------

export async function createAdminSession() {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ADMIN_HOURS * 3600_000);
  await db.insert(schema.adminSessions).values({ idHash: sha256(token), expiresAt });
  await db.delete(schema.adminSessions).where(lt(schema.adminSessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(ADMIN_COOKIE(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE())?.value;
  if (token) await db.delete(schema.adminSessions).where(eq(schema.adminSessions.idHash, sha256(token)));
  jar.delete({ name: ADMIN_COOKIE(), path: "/", secure: secureCookies() });
}

export const isAdmin = cache(async (): Promise<boolean> => {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE())?.value;
  if (!token || token.length > 200) return false;
  const rows = await db
    .select({ id: schema.adminSessions.idHash })
    .from(schema.adminSessions)
    .where(and(eq(schema.adminSessions.idHash, sha256(token)), gt(schema.adminSessions.expiresAt, new Date())))
    .limit(1);
  return rows.length === 1;
});

export async function requireAdmin() {
  if (!(await isAdmin())) throw new ApiError(401, "unauthorized");
}

export async function deleteSessionsOfUser(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

