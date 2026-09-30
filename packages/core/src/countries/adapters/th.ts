/**
 * Thailand, direct from clients (CORS `*`, no key): PCD Air4Thai. See sources/air4thai.ts for the endpoints.
 * Calls: 1× getAQI_JSON (134 KB, station list + official 24-hr Thai AQI) + 1× getHistoryData for the stations
 * near the user (a few KB). With no location it fetches history for all stations in one call (~390 KB).
 * Poll plan (thailand.md): from hh:02 ICT every 2 min until the newest row is non-null, stop at hh:30, idle.
 *
 * Community sensors (coverage-hunt/th.md, Pai): when a proxy is configured, the adapter also asks it for Thailand's
 * AirGradient / Sensor.Community sensors (`GET {proxy}/v1/th/observations?grade=lowcost`, no location sent), the same
 * crowd path MY/ID/VN/PH/LA/KH use. The builder only uses them where no PCD station is within 25 km, within 10 km of
 * the place. If the proxy is down the Air4Thai stations still work; the crowd layer is just missing (a warning).
 */
import { haversineKm } from "../../math.js";
import { buildCountrySnapshot, OfficialUnavailableError } from "../build.js";
import { withTimeout } from "../../net.js";
import {
  AIR4THAI_ATTRIBUTION,
  AIR4THAI_BASE,
  air4thaiAqiUrl,
  air4thaiHistoryUrl,
  air4thaiObservations,
  parseAir4ThaiHistory,
  parseAir4ThaiStations,
} from "../sources/air4thai.js";
import { num } from "../time.js";
import { isObservationSet } from "./proxied.js";
import type { AdapterContext, Attribution, CountryAdapter, CountrySnapshot, FetchLike, Observation, ObservationSet } from "../types.js";

export const TH_HISTORY_STATIONS = 6;

async function getJson(f: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await f(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** The caller's fetch (or the global one), with the per-request timeout (net.ts, ~8 s). */
function fetchOf(ctx: AdapterContext): FetchLike {
  const f = ctx.fetch ?? (globalThis.fetch ? (globalThis.fetch.bind(globalThis) as unknown as FetchLike) : undefined);
  if (!f) throw new Error("No fetch implementation available");
  return withTimeout(f, ctx.timeoutMs);
}

export const AIR4THAI_SOURCE = "PCD Air4Thai";

/** Thailand's community sensors from the proxy (low-cost rows only; official rows come from Air4Thai directly). */
async function thCrowd(f: FetchLike, proxyBase: string, signal?: AbortSignal): Promise<{ observations: Observation[]; attribution: Attribution[] }> {
  const url = `${proxyBase.replace(/\/$/, "")}/v1/th/observations?grade=lowcost`;
  const body = await getJson(f, url, signal);
  if (!isObservationSet(body, "TH")) throw new Error(`Unexpected response for ${url}`);
  const observations = body.observations.filter((o) => o.grade === "lowcost" && o.country === "TH");
  const ids = new Set(observations.map((o) => o.attributionId));
  return { observations, attribution: body.attribution.filter((a) => ids.has(a.id)) };
}

export function createThAdapter(opts: { base?: string } = {}): CountryAdapter {
  const base = opts.base ?? AIR4THAI_BASE;
  const adapter: CountryAdapter = {
    id: "th.air4thai",
    country: "TH",
    kind: "official",
    transport: "direct",
    scaleId: "th_aqi",
    attribution: [AIR4THAI_ATTRIBUTION],
    async fetchObservations(ctx = {}): Promise<ObservationSet> {
      const f = fetchOf(ctx);
      const nowRaw = ctx.now ?? Date.now();
      const now = typeof nowRaw === "number" ? nowRaw : nowRaw.getTime();
      const crowdP = ctx.proxyBase ? thCrowd(f, ctx.proxyBase, ctx.signal).catch((e: Error) => e) : null;
      const warnings: string[] = [];
      let stations: ReturnType<typeof parseAir4ThaiStations> = [];
      try {
        stations = parseAir4ThaiStations(await getJson(f, air4thaiAqiUrl(base), ctx.signal));
        if (!stations.length) throw new Error("Air4Thai: no stations in getAQI_JSON");
      } catch (e) {
        // Air4Thai down or timed out: in-country community sensors from the proxy stand in, under the usual rules
        // (≤ 10 km, same country), labelled as such. With none (or no proxy), the client shows its cache.
        const c = crowdP ? await crowdP : null;
        if (!c || c instanceof Error || !c.observations.length) throw new OfficialUnavailableError("TH", AIR4THAI_SOURCE);
        return {
          country: "TH",
          adapters: ["crowd.proxy"],
          fetchedAt: new Date(now).toISOString(),
          observations: c.observations,
          attribution: c.attribution,
          warnings: [`th.air4thai: ${(e as Error).message}; PCD stations unavailable`],
          officialUnavailable: AIR4THAI_SOURCE,
        };
      }
      let ids = stations.map((s) => s.stationID);
      if (ctx.near) {
        const p = ctx.near;
        ids = [...stations]
          .sort((a, b) => haversineKm(p, { lat: num(a.lat)!, lon: num(a.long)! }) - haversineKm(p, { lat: num(b.lat)!, lon: num(b.long)! }))
          .slice(0, TH_HISTORY_STATIONS)
          .map((s) => s.stationID);
      }
      let history = {};
      let historyDown = false;
      try {
        history = parseAir4ThaiHistory(await getJson(f, air4thaiHistoryUrl(ids, now, base), ctx.signal));
      } catch (e) {
        historyDown = true;
        warnings.push(`th.air4thai history: ${(e as Error).message}; 1-hr values unavailable`);
      }
      const crowd = crowdP ? await crowdP : null;
      if (crowd instanceof Error) warnings.push(`th.crowd: ${crowd.message}; community sensors unavailable`);
      const extra = crowd && !(crowd instanceof Error) ? crowd : null;
      return {
        country: "TH",
        adapters: ["th.air4thai", ...(extra?.observations.length ? ["crowd.proxy"] : [])],
        fetchedAt: new Date(now).toISOString(),
        observations: [...air4thaiObservations(stations, history), ...(extra?.observations ?? [])],
        attribution: [AIR4THAI_ATTRIBUTION, ...(extra?.attribution ?? [])],
        warnings: warnings.length ? warnings : undefined,
        ...(historyDown ? { officialUnavailable: AIR4THAI_SOURCE } : {}),
      };
    },
    async getSnapshot(query = {}, ctx = {}): Promise<CountrySnapshot> {
      const near = typeof query.lat === "number" && typeof query.lon === "number" ? { lat: query.lat, lon: query.lon } : undefined;
      const set = await adapter.fetchObservations({ ...ctx, near });
      return buildCountrySnapshot(set, query, ctx.now ?? Date.now());
    },
  };
  return adapter;
}

export const thAdapter = createThAdapter();
