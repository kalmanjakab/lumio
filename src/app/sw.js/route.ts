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

// Az offline oldal saját JS/CSS fájljai is kellenek internet nélkül: kiolvassuk őket a HTML-ből.
// Hiba esetén nem akadályozza a telepítést (akkor első online látogatáskor kerülnek a cache-be).
async function precacheOfflineAssets(cache) {
  try {
    const res = await cache.match(OFFLINE_URL);
    if (!res) return;
    const html = await res.text();
    const urls = new Set();
    const BACKSLASH = String.fromCharCode(92);
    for (const part of html.split(/["' <>]/)) {
      if (part.startsWith("/_next/static/") && part.length < 300) urls.add(part.split(BACKSLASH)[0]);
    }
    await Promise.all([...urls].slice(0, 80).map((u) => cache.add(u).catch(() => {})));
  } catch (e) {
    /* nincs teendő */
  }
}

self.addEventListener("install", (event) => {
  // Az új verzió azonnal átveszi az irányítást, nem vár a régi lapok bezárására.
  // Ha az előtöltés nem sikerül, a telepítés elbukik, és a régi (működő) verzió marad.
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache
          .addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))
          .then(() => precacheOfflineAssets(cache)),
      )
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

// ---------- Push értesítések ----------
// A tartalom a szerverről jön (cím, szöveg, megnyitandó oldal). Csak saját oldalra navigálunk.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Flashly", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 120) : "Flashly";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body.slice(0, 300) : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : "flashly",
      renotify: false,
      data: { url: url, id: typeof data.id === "string" ? data.id : null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const path = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      if (d.id) {
        fetch("/api/me/notifications", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [d.id] }) }).catch(() => {});
      }
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) return w.navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
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
