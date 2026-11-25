// Adatbázis-migrációk futtatása. A Vercel build előtt fut (npm run build).
// Ha nincs adatbázis beállítva, kihagyja, hogy az első build ne bukjon el.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.warn("[migrate] Nincs DATABASE_URL, a migráció kimarad.");
  process.exit(0);
}
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
const pool = new pg.Pool({ connectionString: url, max: 1, ssl: isLocal ? undefined : { rejectUnauthorized: true } });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Kész.");
} catch (err) {
  console.error("[migrate] Hiba:", err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
