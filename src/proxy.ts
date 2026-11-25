import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_ADMIN_SLUG = "jakab-admin-page-do-not-touch";
const INTERNAL_ADMIN = "/adm-internal";

function adminSlug() {
  const raw = (process.env.ADMIN_PATH_SLUG || "").trim();
  return /^[a-z0-9][a-z0-9-]{7,79}$/.test(raw) ? raw : DEFAULT_ADMIN_SLUG;
}

function buildCsp(nonce: string, allowWasm = false) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${allowWasm ? " 'wasm-unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob: data:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A belső admin útvonal közvetlenül nem érhető el, csak a titkos slugon keresztül.
  if (pathname === INTERNAL_ADMIN || pathname.startsWith(`${INTERNAL_ADMIN}/`)) {
    return new NextResponse("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const slug = adminSlug();
  const isAdmin = pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
  // A jelszó-hash generátor a böngészőben futó WebAssemblyt használ, csak ott engedjük.
  const isHashTool = pathname === `/${slug}/hash`;

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = buildCsp(nonce, isHashTool);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response: NextResponse;
  if (isAdmin) {
    const rest = pathname.slice(slug.length + 1);
    const url = request.nextUrl.clone();
    url.pathname = `${INTERNAL_ADMIN}${rest}`;
    requestHeaders.set("x-flashly-admin", "1");
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|icons/|avatars/|favicon.ico|sw.js|manifest.webmanifest|robots.txt).*)",
    },
  ],
};
