import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __flashlyPool?: Pool; __flashlyDb?: DB };

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL nincs beállítva");
  }
  return url;
}

function createPool() {
  const url = connectionString();
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: isLocal ? 10 : 5,
    idleTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
  try {
    attachDatabasePool(pool);
  } catch {
    // Vercelen kívül nincs mit csatolni.
  }
  return pool;
}

export function getDb(): DB {
  if (!globalForDb.__flashlyDb) {
    globalForDb.__flashlyPool = createPool();
    globalForDb.__flashlyDb = drizzle(globalForDb.__flashlyPool, { schema });
  }
  return globalForDb.__flashlyDb;
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
