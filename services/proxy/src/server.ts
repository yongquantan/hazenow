/**
 * Entry point. Env:
 *   PORT          (Railway sets it; default 8787)
 *   REDIS_URL     optional; redis:// or rediss:// (Railway Redis plugin). Falls back to memory.
 *   NEA_API_KEY   optional data.gov.sg production key, sent only to api-open.data.gov.sg as x-api-key
 *   WARM          "0" disables the background warmer (default on: keeps rings warm on a fixed schedule)
 *   RATE_LIMIT_PER_MIN  per-IP client limit (default 60)
 * Logs: method, path (never the query string: it can hold a coarse location), status, duration. No IPs.
 */
import http from "node:http";
import zlib from "node:zlib";
import { createApp } from "./app.js";
import { createCache } from "./cache.js";
import { CountryService, SERVED } from "./countries.js";
import { chainFixedFetch } from "./tls-fetch.js";
import { Upstreams, type FetchImpl } from "./upstream.js";

const port = Number(process.env.PORT ?? 8787);
const cache = createCache(process.env.REDIS_URL);
const neaKey = process.env.NEA_API_KEY;
const upstreams = new Upstreams(cache, chainFixedFetch(globalThis.fetch as unknown as FetchImpl), Date.now, undefined, (src): Record<string, string> =>
  neaKey && src.id === "sg.nea.v2" ? { "x-api-key": neaKey } : {},
);
const service = new CountryService(upstreams);
const handle = createApp({ upstreams, service, cache, rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 60) });

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const ip = (String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress) ?? undefined;
  let out;
  try {
    out = await handle({ method: req.method ?? "GET", url: req.url ?? "/", ip });
  } catch {
    out = { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: '{"error":"Internal error","attribution":[]}' };
  }
  let body: string | Buffer = out.body;
  const headers: Record<string, string> = { ...out.headers };
  if (body.length > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    body = zlib.gzipSync(body);
    headers["content-encoding"] = "gzip";
    headers.vary = "accept-encoding";
  }
  res.writeHead(out.status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
  const path = (req.url ?? "/").split("?")[0];
  console.log(`${req.method} ${path} ${out.status} ${Date.now() - t0}ms`);
});

server.listen(port, () => {
  console.log(`hazenow-proxy listening on :${port} · cache ${cache.kind}${neaKey ? " · NEA key set" : ""}`);
});

// Warmer: refresh every served country once a minute. Upstream calls still obey each source's TTL and hourly
// budget, so this fixes the upstream load regardless of traffic, and keeps the history/crowd rings warm.
if (process.env.WARM !== "0") {
  const warm = async () => {
    for (const cc of SERVED) await service.observations(cc).catch(() => undefined);
  };
  setTimeout(warm, 2_000);
  setInterval(warm, 60_000).unref();
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
