// A service worker szkript. Route handlerként szolgáljuk ki, hogy minden deploymentnél
// más legyen a tartalma (benne a build-azonosító): a böngésző ebből veszi észre a frissítést.
export const dynamic = "force-dynamic";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const BUILD_TIME = Date.parse(process.env.NEXT_PUBLIC_BUILD_TIME || "") || 0;

function script() {
  // A cache nevében a build ideje is benne van, így a cache-ek időrendbe rendezhetők.
  const cacheName = `flashly-static-${String(BUILD_TIME).padStart(15, "0")}-${BUILD_ID}`;
  return `/* Flashly service worker – build ${BUILD_ID}
   Csak a nyilvános statikus fájlokat (JS, CSS, ikonok) és az offline oldalt tárolja.
   HTML oldalt, API-választ, fiók- és profiladatot SOHA nem tesz gyorsítótárba. */
const BUILD_ID = ${JSON.stringify(BUILD_ID)};
const STATIC_CACHE = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = "flashly-static-";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // Az új verzió azonnal átveszi az irányítást, nem vár a régi lapok bezárására.
  // Ha az előtöltés nem sikerül, a telepítés elbukik, és a régi (működő) verzió marad.
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // A legutóbbi előző cache-t megtartjuk, hogy a még régi kódot futtató, újratöltésre váró lap
  // be tudja tölteni a hiányzó darabjait. Minden régebbit és minden ismeretlent törlünk.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const ours = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== STATIC_CACHE).sort().reverse();
        const keepPrev = ours.find((k) => k < STATIC_CACHE);
        return Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== keepPrev).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "flashly:skip-waiting") self.skipWaiting();
  if (event.data === "flashly:version" && event.ports && event.ports[0]) event.ports[0].postMessage(BUILD_ID);
});

function isPublicStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/avatars/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  );
}

async function fromCaches(req) {
  const own = await caches.open(STATIC_CACHE);
  const hit = await own.match(req);
  if (hit) return { hit, own };
  // Az előző verzió cache-éből is kiszolgálunk (a /_next/static fájlok tartalom szerint vannak elnevezve).
  const any = await caches.match(req);
  return { hit: any, own };
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API és minden más dinamikus kérés: mindig hálózat, semmi tárolás.
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (isPublicStatic(url)) {
    const immutable = url.pathname.startsWith("/_next/static/");
    event.respondWith(
      (async () => {
        const { hit, own } = await fromCaches(req);
        if (hit && immutable) return hit;
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic") own.put(req, res.clone());
          return res;
        } catch (err) {
          if (hit) return hit;
          throw err;
        }
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    // Oldalak: mindig hálózatról (így mindig a legfrissebb HTML és JS jön).
    // Ha nincs net, az offline oldal jön (abban nincs személyes adat).
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
`;
}

export function GET() {
  return new Response(script(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // A böngésző minden frissítés-ellenőrzésnél újra lekéri, sosem használ régi példányt.
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
      "X-Robots-Tag": "noindex",
    },
  });
}
