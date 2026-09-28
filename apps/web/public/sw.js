/* HazeNow service worker: app shell offline. Air-quality data is NOT cached here;
   the page keeps the last snapshot on-device and marks it stale, so offline is always honest. */
const VERSION = "hazenow-v3";
const SHELL = ["/", "/how.html", "/manifest.webmanifest", "/icons/favicon.svg", "/icons/icon-192.png", "/fonts/instrument-sans.woff2", "/fonts/instrument-serif.woff2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL);
      // Also precache the hashed JS/CSS referenced by the pages.
      for (const page of ["/", "/how.html"]) {
        try {
          const html = await (await fetch(page, { cache: "no-cache" })).text();
          const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
          await cache.addAll([...new Set(assets)]);
        } catch {}
      }
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

  // Pages: network first, fall back to the cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put(url.pathname === "/how.html" ? "/how.html" : "/", res.clone());
          return res;
        } catch {
          return (await caches.match(url.pathname.startsWith("/how") ? "/how.html" : "/")) || Response.error();
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
