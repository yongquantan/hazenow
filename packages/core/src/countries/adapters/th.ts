/**
 * Thailand, direct from clients (CORS `*`, no key): PCD Air4Thai. See sources/air4thai.ts for the endpoints.
 * Calls: 1× getAQI_JSON (134 KB, station list + official 24-hr Thai AQI) + 1× getHistoryData for the stations
 * near the user (a few KB). With no location it fetches history for all stations in one call (~390 KB).
 * Poll plan (thailand.md): from hh:02 ICT every 2 min until the newest row is non-null, stop at hh:30, idle.
 */
import { haversineKm } from "../../math.js";
import { buildCountrySnapshot } from "../build.js";
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
import type { AdapterContext, CountryAdapter, CountrySnapshot, FetchLike, ObservationSet } from "../types.js";

export const TH_HISTORY_STATIONS = 6;

async function getJson(f: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await f(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function fetchOf(ctx: AdapterContext): FetchLike {
  const f = ctx.fetch ?? (globalThis.fetch ? (globalThis.fetch.bind(globalThis) as unknown as FetchLike) : undefined);
  if (!f) throw new Error("No fetch implementation available");
  return f;
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
      const stations = parseAir4ThaiStations(await getJson(f, air4thaiAqiUrl(base), ctx.signal));
      if (!stations.length) throw new Error("Air4Thai: no stations in getAQI_JSON");
      let ids = stations.map((s) => s.stationID);
      if (ctx.near) {
        const p = ctx.near;
        ids = [...stations]
          .sort((a, b) => haversineKm(p, { lat: num(a.lat)!, lon: num(a.long)! }) - haversineKm(p, { lat: num(b.lat)!, lon: num(b.long)! }))
          .slice(0, TH_HISTORY_STATIONS)
          .map((s) => s.stationID);
      }
      const warnings: string[] = [];
      let history = {};
      try {
        history = parseAir4ThaiHistory(await getJson(f, air4thaiHistoryUrl(ids, now, base), ctx.signal));
      } catch (e) {
        warnings.push(`th.air4thai history: ${(e as Error).message}; 1-hr values unavailable`);
      }
      return {
        country: "TH",
        adapters: ["th.air4thai"],
        fetchedAt: new Date(now).toISOString(),
        observations: air4thaiObservations(stations, history),
        attribution: [AIR4THAI_ATTRIBUTION],
        warnings: warnings.length ? warnings : undefined,
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
