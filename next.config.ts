import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { readFileSync } from "node:fs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Build-azonosító: minden deploymentnél új (commit + build ideje). Ebből lesz a kijelzett
// verziószám és a service worker verziója is. A process.env-be írjuk, hogy a build
// minden részfolyamata ugyanazt az értéket lássa.
if (!process.env.FLASHLY_BUILD_ID) {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
  const now = new Date();
  process.env.FLASHLY_BUILD_TIME = now.toISOString();
  process.env.FLASHLY_COMMIT = sha;
  process.env.FLASHLY_BUILD_ID = `${sha || "local"}-${now.getTime().toString(36)}`;
}
const appVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;

// Biztonsági fejlécek minden válaszra. A CSP-t (nonce-szal) a proxy.ts teszi a HTML oldalakra.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Ennél az appnál szinte minden oldal személyre szabott és jogosultsághoz kötött,
  // ezért a régi (kérésenként dinamikus) modellt használjuk: semmi védett nem kerülhet statikus gyorsítótárba.
  cacheComponents: false,
  poweredByHeader: false,
  generateBuildId: async () => process.env.FLASHLY_BUILD_ID!,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_ID: process.env.FLASHLY_BUILD_ID!,
    NEXT_PUBLIC_BUILD_TIME: process.env.FLASHLY_BUILD_TIME || "",
    NEXT_PUBLIC_COMMIT: process.env.FLASHLY_COMMIT || "",
  },
  reactStrictMode: true,
  // A hash-oldal ebből a mappából rakja össze a letölthető Claude skillt.
  outputFileTracingIncludes: { "/adm-internal/**": ["./skills/flashly-import/**/*"] },
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
