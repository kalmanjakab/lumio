import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { hashSync } from "@node-rs/argon2";

const TEST_DB = process.env.E2E_DATABASE_URL || "postgres://flashly:flashly@localhost:5432/flashly_test";
const H = (p: string) => hashSync(p, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });

export const SEED = {
  groupPassword: "angol123",
  otherGroupPassword: "biosz123",
  protectedTerms: [
    ["apple", "alma"],
    ["house", "ház"],
    ["to give up", "feladni, abbahagyni"],
    ["abundant", "bőséges"],
    ["careful", "óvatos, gondos"],
    ["journey", "utazás"],
    ["weather", "időjárás"],
    ["borrow", "kölcsönkér"],
  ],
  publicTerms: [
    ["dog", "kutya"],
    ["cat", "macska"],
    ["good", "jó"],
    ["red", "piros"],
    ["book", "könyv"],
    ["water", "víz"],
    ["friend", "barát"],
  ],
};

export default async function globalSetup() {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await pool.end();
  execSync("node scripts/migrate.mjs", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "inherit" });

  const db = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];
  const g1 = await one("insert into groups (name, password_hash) values ($1, $2) returning id", ["Angol", H(SEED.groupPassword)]);
  const g2 = await one("insert into groups (name, password_hash) values ($1, $2) returning id", ["Biosz", H(SEED.otherGroupPassword)]);
  const m1 = await one("insert into materials (title, group_id) values ($1, $2) returning id", ["Titkos Unit 3", g1.id]);
  const m2 = await one("insert into materials (title, group_id) values ($1, null) returning id", ["Kezdő angol"]);
  const m3 = await one("insert into materials (title, group_id) values ($1, $2) returning id", ["Sejtbiológia", g2.id]);
  const ins = async (mid: string, list: string[][]) => {
    const ids: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const r = await one("insert into cards (material_id, term, definition, position) values ($1, $2, $3, $4) returning id", [mid, list[i]![0], list[i]![1], i]);
      ids.push(r.id);
    }
    return ids;
  };
  const c1 = await ins(m1.id, SEED.protectedTerms);
  const c2 = await ins(m2.id, SEED.publicTerms);
  const c3 = await ins(m3.id, [
    ["mitokondrium", "a sejt energiatermelő sejtszervecskéje"],
    ["riboszóma", "fehérjeszintézis helye"],
  ]);
  await db.end();
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(
    "e2e/.auth/seed.json",
    JSON.stringify({ groupId: g1.id, otherGroupId: g2.id, protectedSetId: m1.id, publicSetId: m2.id, otherSetId: m3.id, protectedCardIds: c1, publicCardIds: c2, otherCardIds: c3 }, null, 2),
  );
}
