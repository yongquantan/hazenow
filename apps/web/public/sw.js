/* HazeNow service worker: app shell offline. Air-quality data is NOT cached here;
   the page keeps the last snapshot on-device and marks it stale, so offline is always honest. */
// Both values are filled in at build time (vite.config.ts → precacheManifest): every emitted file,
// including the hashed JS/CSS, so the very first offline launch has everything it needs.
const VERSION = "hazenow-__BUILD__";
const PRECACHE = /*__PRECACHE__*/ ["/", "/how.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // cache: "reload" bypasses the HTTP cache so we never precache a stale index.html.
      await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live data: always network (the page handles offline).
  if (url.hostname === "api-open.data.gov.sg" || url.hostname === "api.data.gov.sg") return;
  // Our own Pages Functions (/api/where): always network, never cached (it answers no-store anyway).
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Pages: network first, fall back to the cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(VERSION);
            cache.put(url.pathname.startsWith("/how") ? "/how.html" : "/", res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(VERSION);
          return (await cache.match(url.pathname.startsWith("/how") ? "/how.html" : "/")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Third-party fonts (none by default; fonts are self-hosted): stale-while-revalidate.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const hit = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })(),
    );
    return;
  }

  // Same-origin static files: cache first (hashed assets are immutable).
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fonts/"))) {
          (await caches.open(VERSION)).put(req, res.clone());
        }
        return res;
      })(),
    );
  }
});
