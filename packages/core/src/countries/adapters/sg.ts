/**
 * Singapore behind the country-adapter interface. **No behaviour change**: the snapshot is exactly
 * `getSnapshot()` / `buildSnapshot()` from the v1 code (SPEC §7 fields untouched); v2.0 fields are only added.
 */
import { fetchRaw, getSnapshot, type RawResponses } from "../../client.js";
import { psiLabel, isValidReading } from "../../math.js";
import { mergeHours, mergeV1V2, parseHours, parseRegionCoords, PM25_24H_KEY, PM25_KEY, PSI24_KEY, type ApiResponse } from "../../parse.js";
import type { Snapshot } from "../../types.js";
import { classifyPm25, toLocalBand, whoMultiple } from "../scales.js";
import type { Attribution, CountryAdapter, CountrySnapshot, Observation, ObservationSet } from "../types.js";

export const NEA_ATTRIBUTION: Attribution = {
  id: "sg.nea",
  text: "Data: NEA via data.gov.sg",
  url: "https://data.gov.sg/",
  licence: "Singapore Open Data Licence",
};

/** v1 Snapshot → CountrySnapshot. Spreads the original, so every SPEC §7 field is identical. */
export function fromSgSnapshot(s: Snapshot): CountrySnapshot {
  const b = classifyPm25("sg_nea_1h", s.pm25)!;
  const localBand = toLocalBand("sg_nea_1h", b)!;
  const last = s.history[s.history.length - 1];
  const stations = Object.entries(s.regions).map(([name, r]) => ({
    stationId: `sg.nea:${name}`,
    name,
    distanceKm: null,
    grade: "reference" as const,
    pm25_1h: r.pm25,
    official:
      r.psi24h !== null
        ? { scaleId: "sg_psi", name: "24-hr PSI", value: r.psi24h, category: psiLabel(r.psi24h), averaging: "24h" as const, param: null, agency: "NEA" }
        : null,
    periodEnd: s.observedAt,
  }));
  return {
    ...s,
    country: "SG",
    status: "live_direct",
    level: localBand.level,
    localBand,
    bandBasis: "pm25_1h",
    official:
      s.officialPsi24h !== null
        ? { scaleId: "sg_psi", name: "24-hr PSI", value: s.officialPsi24h, category: psiLabel(s.officialPsi24h), averaging: "24h", param: null, agency: "NEA" }
        : null,
    pm25Kind: "official_1h",
    pm25_24h: last?.pm25Avg24h ?? null,
    nearest: stations.find((x) => x.name === s.nearestRegion) ?? null,
    stations,
    range: null, // SG clients keep using experience.ts uncertainty()/stationRange() (SPEC v1.7)
    whoMultiple: whoMultiple(s.pm25),
    hotspots: null,
    attribution: [NEA_ATTRIBUTION],
    notes: [],
  };
}

/** The 5 NEA regions as Observations (for locate() and the proxy's /v1/sg/observations). */
export function sgObservations(raw: RawResponses): Observation[] {
  const pm = [raw.pm25Latest, ...raw.pm25Days];
  const psi = [raw.psi, ...raw.psiDays];
  const coords = parseRegionCoords(...pm, ...psi, ...raw.v1Pm25, ...raw.v1Psi);
  const hoursOf = (v2: (ApiResponse | null)[], v1: (ApiResponse | null)[], key: string) =>
    mergeV1V2(mergeHours(...v1.map((d) => parseHours(d, key))), mergeHours(...v2.map((d) => parseHours(d, key))));
  const pmH = hoursOf(pm, raw.v1Pm25, PM25_KEY);
  const psiH = hoursOf(psi, raw.v1Psi, PSI24_KEY);
  const avgH = hoursOf(psi, raw.v1Psi, PM25_24H_KEY);
  const out: Observation[] = [];
  for (const [region, c] of Object.entries(coords)) {
    const series = pmH.map((h) => ({
      time: h.time,
      pm25: h.values[region] ?? null,
      pm25Avg24h: avgH.find((a) => Date.parse(a.time) === Date.parse(h.time))?.values[region] ?? null,
    }));
    const last = [...series].reverse().find((h) => isValidReading(h.pm25));
    if (!last) continue;
    const psiNow = [...psiH].reverse().find((h) => isValidReading(h.values[region]))?.values[region] ?? null;
    out.push({
      stationId: `sg.nea:${region}`,
      name: region,
      country: "SG",
      lat: c.lat,
      lon: c.lon,
      grade: "reference",
      pm25_1h: last.pm25,
      pm25_24h: last.pm25Avg24h ?? null,
      official:
        psiNow !== null
          ? { scaleId: "sg_psi", name: "24-hr PSI", value: psiNow, category: psiLabel(psiNow), averaging: "24h", param: null, agency: "NEA" }
          : null,
      periodEnd: last.time,
      publishedAt: pmH.find((h) => h.time === last.time)?.published ?? null,
      history: series.slice(-48),
      corrected: "none",
      attributionId: NEA_ATTRIBUTION.id,
    });
  }
  return out;
}

export const sgAdapter: CountryAdapter = {
  id: "sg.nea",
  country: "SG",
  kind: "official",
  transport: "direct",
  scaleId: "sg_nea_1h",
  attribution: [NEA_ATTRIBUTION],
  async fetchObservations(ctx = {}): Promise<ObservationSet> {
    const now = ctx.now ?? Date.now();
    const raw = await fetchRaw({ fetch: ctx.fetch as never, now, signal: ctx.signal });
    return {
      country: "SG",
      adapters: ["sg.nea"],
      fetchedAt: new Date(typeof now === "number" ? now : now.getTime()).toISOString(),
      observations: sgObservations(raw),
      attribution: [NEA_ATTRIBUTION],
    };
  },
  async getSnapshot(query = {}, ctx = {}): Promise<CountrySnapshot> {
    const s = await getSnapshot({
      fetch: ctx.fetch as never,
      now: ctx.now,
      signal: ctx.signal,
      lat: query.lat,
      lon: query.lon,
      region: query.station?.replace(/^sg\.nea:/, ""),
    });
    return fromSgSnapshot(s);
  },
};
