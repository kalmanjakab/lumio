import { defineConfig, devices } from "@playwright/test";
import { hashSync } from "@node-rs/argon2";

const PORT = 3100;
export const ADMIN_TEST_PASSWORD = "e2e-admin-jelszo-123456";
const TEST_DB = process.env.E2E_DATABASE_URL || "postgres://flashly:flashly@localhost:5432/flashly_test";

// A tesztszerver saját, eldobható adatbázist és csak tesztre generált admin hash-t kap.
const adminHash = Buffer.from(hashSync(ADMIN_TEST_PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 })).toString("base64");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "hu-HU",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /security|desktop/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /security|desktop/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: TEST_DB,
      SESSION_SECRET: "e2e-test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
      ADMIN_PASSWORD_HASH: adminHash,
      ADMIN_PATH_SLUG: "e2e-titkos-admin",
      FLASHLY_INSECURE_COOKIES: "1",
      NODE_ENV: "production",
    },
  },
});
