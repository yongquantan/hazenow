/**
 * The allow-list. Every upstream the proxy may ever call is here, with its host, freshness TTL (from the cadence
 * measured in docs/sea/*.md) and a hard hourly call budget. There is no user-supplied URL anywhere: routes pick
 * a source id, and URLs are built from constants.
 *
 * Budget total (sum of budgetPerHour) is the most the proxy can call upstream in any hour, whatever the traffic.
 */
import {
  AG_WORLD_URL,
  AIR4THAI_BASE,
  BMKG_URL,
  BROWSER_UA,
  DOE_URL,
  HANOI_BASE,
  ISPU_URL,
  SIPONGI_URL,
  agAreaUrl,
} from "../../../packages/core/src/countries/index.js";

export const MIN = 60_000;

export interface SourceDef {
  id: string;
  hosts: readonly string[];
  /** Hard cap on upstream calls in any rolling hour. */
  budgetPerHour: number;
  /** Freshness: serve from cache while younger than this. Depends on where we are in the publication cycle. */
  ttlMs(now: number): number;
  /** How long to keep a payload for stale-if-error serving. */
  keepMs: number;
  body: "json" | "text" | "lenient-json";
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Shrink a payload before caching (e.g. Hanoi's 2.3 MB 30-day series → last 50 h). */
  reduce?(data: unknown): unknown;
  /** Documented cadence, shown in /health. */
  cadence: string;
}

/** Minute of the hour. All SEA zones are whole-hour offsets except Myanmar (not polled), so UTC minutes = local minutes. */
export const minuteOf = (now: number) => new Date(now).getUTCMinutes();
const burst = (from: number, to: number, fast: number, slow: number) => (now: number) => {
  const m = minuteOf(now);
  return (m >= from && m <= to ? fast : slow) * MIN;
};

export const SOURCES: Record<string, SourceDef> = {
  "sg.nea.v1": {
    id: "sg.nea.v1",
    hosts: ["api.data.gov.sg"],
    budgetPerHour: 40,
    ttlMs: burst(0, 10, 1, 5),
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "NEA v1 posts ~1 min after the hour (SPEC v1.3): 1/min until :10, then every 5 min",
  },
  "sg.nea.v2": {
    id: "sg.nea.v2",
    hosts: ["api-open.data.gov.sg"],
    budgetPerHour: 30,
    ttlMs: () => 1 * MIN,
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "NEA v2 back-fills at ~:30/:45; 6 req/10 s keyless, 30 with NEA_API_KEY",
  },
  "th.air4thai.aqi": {
    id: "th.air4thai.aqi",
    hosts: ["air4thai.pcd.go.th"],
    budgetPerHour: 12,
    ttlMs: burst(2, 25, 3, 15),
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "hourly; BMA stations by hh:03, PCD by hh:09, tail by hh:20 ICT",
  },
  "th.air4thai.history": {
    id: "th.air4thai.history",
    hosts: ["air4thai.pcd.go.th"],
    budgetPerHour: 12,
    ttlMs: burst(2, 25, 3, 20),
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "hourly, hour-ending; newest row null until its value arrives (hh:03–hh:20 ICT)",
  },
  "my.doe": {
    id: "my.doe",
    hosts: ["eqms.doe.gov.my"],
    budgetPerHour: 10,
    ttlMs: burst(7, 17, 3, 20),
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "hourly; rewritten in place hh:01–hh:13 MYT, 65/68 stations by hh:08",
  },
  "id.bmkg": {
    id: "id.bmkg",
    hosts: ["www.bmkg.go.id"],
    budgetPerHour: 12,
    ttlMs: burst(12, 35, 3, 20),
    keepMs: 6 * 60 * MIN,
    body: "text",
    headers: { "user-agent": BROWSER_UA, accept: "text/html" },
    cadence: "hourly; JAM N appears at ~(N+1):17 WIB",
  },
  "id.klh.ispu": {
    id: "id.klh.ispu",
    hosts: ["ispu.kemenlh.go.id"],
    budgetPerHour: 12,
    ttlMs: burst(0, 10, 2, 15),
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "hourly, live 30–90 s after the hour; INTEGRASI rows ~1 h late",
  },
  "id.sipongi": {
    id: "id.sipongi",
    hosts: ["opsroom-sipongi.gakkum.kehutanan.go.id"],
    budgetPerHour: 3,
    ttlMs: () => 30 * MIN,
    keepMs: 12 * 60 * MIN,
    body: "json",
    cadence: "per satellite pass, ~2 h behind",
  },
  "vn.hanoi.site": {
    id: "vn.hanoi.site",
    hosts: ["moitruongthudo.vn"],
    budgetPerHour: 2,
    ttlMs: () => 60 * MIN,
    keepMs: 24 * 60 * MIN,
    body: "json",
    cadence: "station registry; changes rarely",
  },
  "vn.hanoi.stat": {
    id: "vn.hanoi.stat",
    hosts: ["moitruongthudo.vn"],
    budgetPerHour: 12,
    ttlMs: burst(3, 15, 5, 30),
    keepMs: 6 * 60 * MIN,
    body: "json",
    timeoutMs: 30_000,
    // 30 days × 6 pollutants of 5-min data (~2.3 MB): keep PM2.5, last 50 h.
    reduce: (d) => ({ "PM2.5": ((d as Record<string, unknown[]>)?.["PM2.5"] ?? []).slice(-600) }),
    cadence: "5-min samples, ~3 min latency; we need each complete hour",
  },
  "vn.hanoi.aqi": {
    id: "vn.hanoi.aqi",
    hosts: ["moitruongthudo.vn"],
    budgetPerHour: 10,
    ttlMs: burst(15, 30, 5, 30),
    keepMs: 6 * 60 * MIN,
    body: "json",
    cadence: "hourly VN_AQI, present by ~hh:18 ICT",
  },
  "crowd.airgradient": {
    id: "crowd.airgradient",
    hosts: ["map-data-int.airgradient.com"],
    budgetPerHour: 15,
    ttlMs: () => 5 * MIN,
    keepMs: 2 * 60 * MIN,
    body: "json",
    cadence: "~1-min sensor data; one SEA bbox call every 5 min covers every country",
  },
  "crowd.airgradient.world": {
    id: "crowd.airgradient.world",
    hosts: ["api.airgradient.com"],
    budgetPerHour: 6,
    ttlMs: () => 10 * MIN,
    keepMs: 2 * 60 * MIN,
    body: "lenient-json",
    timeoutMs: 30_000,
    cadence: "fallback only (map API down): raw pm02 + RH, EPA-extended applied by us",
  },
};

export const TOTAL_BUDGET_PER_HOUR = Object.values(SOURCES).reduce((s, x) => s + x.budgetPerHour, 0);

/** URL builders: the only way a URL is formed. */
export const URLS = {
  neaV1: (kind: "pm25" | "psi", date?: string) => `https://api.data.gov.sg/v1/environment/${kind}${date ? `?date=${date}` : ""}`,
  neaV2: (kind: "pm25" | "psi", date?: string) => `https://api-open.data.gov.sg/v2/real-time/api/${kind}${date ? `?date=${date}` : ""}`,
  thAqi: () => `${AIR4THAI_BASE}/getAQI_JSON.php`,
  myDoe: () => DOE_URL,
  idBmkg: () => BMKG_URL,
  idIspu: () => ISPU_URL,
  idSipongi: () => SIPONGI_URL,
  vnSite: () => `${HANOI_BASE}/api/site`,
  vnStat: (id: number) => `${HANOI_BASE}/public/dailystat/${Math.trunc(id)}`,
  vnAqi: (id: number) => `${HANOI_BASE}/public/dailyaqi/${Math.trunc(id)}`,
  agMap: () => agAreaUrl(),
  agWorld: () => AG_WORLD_URL,
};
