/** Test harness: the proxy wired to a fake upstream that serves the live-recorded fixtures. */
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { MemoryCache } from "../src/cache.js";
import { CountryService } from "../src/countries.js";
import { Upstreams, type FetchImpl } from "../src/upstream.js";

const SEA = new URL("../../../packages/core/fixtures/sea/", import.meta.url).pathname;
const CORE = new URL("../../../packages/core/fixtures/", import.meta.url).pathname;
const read = (p: string) => readFileSync(p, "utf8");

/** 17:30 ICT/WIB, 18:30 SGT/MYT on the recording day. */
export const NOW = Date.parse("2026-09-28T10:30:00Z");

export function fixtureFor(url: string): string | null {
  const u = new URL(url);
  const h = u.hostname;
  const p = u.pathname;
  if (h === "air4thai.pcd.go.th" && p.endsWith("getAQI_JSON.php")) return read(SEA + "th-air4thai-aqi-2026-09-28T17ICT.json");
  if (h === "air4thai.pcd.go.th" && p.endsWith("getHistoryData.php")) return read(SEA + "th-air4thai-history-2026-09-28T17ICT.json");
  if (h === "eqms.doe.gov.my") return read(SEA + "my-doe-apims-2026-09-28T18MYT.json");
  if (h === "www.bmkg.go.id") return read(SEA + "id-bmkg-pm25-2026-09-28T17WIB.html");
  if (h === "ispu.kemenlh.go.id") return read(SEA + "id-klh-ispu-2026-09-28T17WIB.json");
  if (h === "opsroom-sipongi.gakkum.kehutanan.go.id") return read(SEA + "id-sipongi-hotspots-2026-09-28.json");
  if (h === "moitruongthudo.vn" && p === "/api/site") return read(SEA + "vn-hanoi-site-2026-09-28.json");
  let m = /^\/public\/dailystat\/(\d+)$/.exec(p);
  if (h === "moitruongthudo.vn" && m) return safe(SEA + `vn-hanoi-dailystat-${m[1]}-2026-09-28T17ICT.json`);
  m = /^\/public\/dailyaqi\/(\d+)$/.exec(p);
  if (h === "moitruongthudo.vn" && m) return safe(SEA + `vn-hanoi-dailyaqi-${m[1]}-2026-09-28T17ICT.json`);
  if (h === "map-data-int.airgradient.com") return read(SEA + "ag-map-sea-2026-09-28T1027Z.json");
  if (h === "api.airgradient.com") return read(SEA + "ag-world-sea-excerpt-2026-09-28T1034Z.json");
  if (h === "api.data.gov.sg") {
    const kind = p.endsWith("/psi") ? "psi" : "pm25";
    const date = u.searchParams.get("date");
    return safe(CORE + (date ? `v1-${kind}-${date}.json` : `v1-${kind}-latest.json`));
  }
  if (h === "api-open.data.gov.sg") return read(CORE + "pm25-2026-09-28.json");
  return null;
}

function safe(p: string): string | null {
  try {
    return read(p);
  } catch {
    return null;
  }
}

export type Rule = number | "throw" | "hang" | "garbage" | ((url: string) => string | null);

export interface Harness {
  handle: ReturnType<typeof createApp>;
  calls: { url: string; headers: Record<string, string> }[];
  rules: Record<string, Rule>;
  clock: { now: number };
  upstreams: Upstreams;
  service: CountryService;
  cache: MemoryCache;
  get(path: string, ip?: string): Promise<{ status: number; headers: Record<string, string>; body: any }>;
}

/** rules: hostname → HTTP status | "throw" (network error) | "hang" (never answers) | "garbage" (non-JSON) | custom body. */
export function harness(opts: { rules?: Record<string, Rule>; rateLimitPerMin?: number; extraHeaders?: ConstructorParameters<typeof Upstreams>[4] } = {}): Harness {
  const clock = { now: NOW };
  const now = () => clock.now;
  const rules: Record<string, Rule> = { ...opts.rules };
  const calls: Harness["calls"] = [];
  const fetchImpl: FetchImpl = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const rule = rules[new URL(url).hostname];
    if (rule === "throw") throw new TypeError("fetch failed");
    if (rule === "hang")
      return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason ?? new Error("aborted"))));
    if (typeof rule === "number") return { ok: false, status: rule, headers: { get: (n: string) => (n === "retry-after" ? "120" : null) }, text: async () => "error" };
    const body = typeof rule === "function" ? rule(url) : rule === "garbage" ? "<html>maintenance</html>" : fixtureFor(url);
    if (body === null) return { ok: false, status: 404, headers: { get: () => null }, text: async () => "not found" };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => body };
  };
  const cache = new MemoryCache(now);
  const upstreams = new Upstreams(cache, fetchImpl, now, undefined, opts.extraHeaders);
  const service = new CountryService(upstreams, now);
  const handle = createApp({ upstreams, service, cache, clock: now, rateLimitPerMin: opts.rateLimitPerMin ?? 0 });
  return {
    handle,
    calls,
    rules,
    clock,
    upstreams,
    service,
    cache,
    async get(path, ip) {
      const r = await handle({ method: "GET", url: path, ip });
      return { status: r.status, headers: r.headers, body: r.body ? JSON.parse(r.body) : null };
    },
  };
}
