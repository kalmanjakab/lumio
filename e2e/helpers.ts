import { readFileSync } from "node:fs";
import type { Page, APIRequestContext } from "@playwright/test";
export { SEED } from "./global-setup";

export type Seed = {
  groupId: string;
  otherGroupId: string;
  protectedSetId: string;
  publicSetId: string;
  otherSetId: string;
  protectedCardIds: string[];
  publicCardIds: string[];
  otherCardIds: string[];
};

export function seed(): Seed {
  return JSON.parse(readFileSync("e2e/.auth/seed.json", "utf8"));
}

export const ADMIN_SLUG = "e2e-titkos-admin";
export const ADMIN_PASSWORD = "e2e-admin-jelszo-123456";

let counter = 0;
export function uniqueName(prefix = "u") {
  counter++;
  return `${prefix}_${Date.now().toString(36).slice(-5)}${counter}`;
}

export async function registerViaUi(page: Page, username: string, password = "jelszo12345") {
  await page.goto("/login?mode=register");
  await page.getByLabel("Felhasználónév").fill(username);
  await page.getByLabel("Jelszó", { exact: true }).fill(password);
  await page.getByLabel("Jelszó újra").fill(password);
  await page.getByRole("button", { name: "Fiók létrehozása" }).click();
  await page.waitForURL("/");
}

/** API-hívás a böngésző sütijeivel, helyes Origin fejléccel. */
export async function apiPost(req: APIRequestContext, baseURL: string, path: string, body: unknown, method = "POST") {
  return req.fetch(path, { method, data: body, headers: { Origin: baseURL, "Content-Type": "application/json" } });
}

import { test as base } from "@playwright/test";

export function randomIp() {
  return `198.51.100.${Math.floor(Math.random() * 250) + 2}`;
}

/** Minden teszt saját (kitalált) IP-címmel fut, hogy a próbálkozás-korlátok ne akadjanak össze a tesztek között. */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ "x-real-ip": randomIp() });
    await use(context);
  },
});
export { expect } from "@playwright/test";
