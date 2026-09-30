/**
 * SPEC v2.0 (Southeast Asia) data model. Additive: nothing here changes the SG v1 `Snapshot`.
 *
 * Pipeline: adapter (per source) → Observation[] (normalised, per station/sensor)
 *           → buildCountrySnapshot() on the device → CountrySnapshot (SPEC §7 field names + v2.0 fields).
 */
import type { Band, HistoryPoint, LocationMode, RegionReading, Snapshot, Trend } from "../types.js";

export type CountryCode = "SG" | "MY" | "ID" | "TH" | "VN" | "PH" | "LA" | "KH" | "MM" | "BN" | "TL";

/** Internal advice level (REGIONAL §3.3): 0 none · 1 sensitive reduce · 2 everyone reduce, sensitive avoid · 3 everyone minimise. */
export type Level = 0 | 1 | 2 | 3;

export type CoverageStatus = "live_direct" | "needs_proxy" | "needs_permission" | "not_feasible";

export interface Attribution {
  id: string;
  /** Human text clients must render, e.g. "Data: PCD Air4Thai (Thailand)". */
  text: string;
  url: string;
  licence: string;
  shareAlike?: boolean;
}

/** An authority's own index, verbatim. Never computed by HazeNow (SPEC v1.2 §1, REGIONAL §3.3 rule 1). */
export interface OfficialIndex {
  /** Scale that gives this index's category words, e.g. "th_aqi". */
  scaleId: string;
  /** "Thai AQI", "API", "ISPU", "VN_AQI", "24-hr PSI" */
  name: string;
  value: number;
  /** Authority's category word, verbatim where published, else looked up in the scale. */
  category: string | null;
  averaging: "24h" | "1h" | "nowcast";
  /** Dominant pollutant when the authority reports it ("PM2.5", "O3"). */
  param: string | null;
  agency: string;
}

export interface ObservationHour {
  /** Hour-ending timestamp, ISO 8601 with the station's offset. */
  time: string;
  pm25: number | null;
  /** 24-h mean PM2.5 at that hour (the chart line), µg/m³. */
  pm25Avg24h?: number | null;
}

/** One station or sensor, normalised (REGIONAL §4.2). */
export interface Observation {
  /** "<adapter>:<native id>" */
  stationId: string;
  name: string;
  /** Jurisdiction the reading was measured in (adapter's country for official data, polygon lookup for crowd). */
  country: CountryCode;
  lat: number;
  lon: number;
  grade: "reference" | "lowcost";
  indoor?: boolean;
  /** 1-hr mean PM2.5, µg/m³, for the hour ending `periodEnd`. */
  pm25_1h?: number | null;
  /** Latest instantaneous PM2.5 (crowd, minute data), µg/m³, after correction and `k`. */
  pm25_now?: number | null;
  /** Authority's 24-h mean PM2.5 at `periodEnd` (published, or inverted from a PM2.5-driven index). */
  pm25_24h?: number | null;
  official?: OfficialIndex | null;
  /** End of the averaging window of the newest value, ISO 8601 with offset. */
  periodEnd: string;
  publishedAt?: string | null;
  /** Hourly series, oldest → newest (optional). */
  history?: ObservationHour[];
  corrected?: "source" | "epa_ext" | "none";
  /** Crowd bias factor vs the jurisdiction's anchor (ARCHITECTURE_V2 §3), null = uncalibrated. */
  k?: number | null;
  qc?: "ok" | "stale" | "erratic" | "indoor" | "dup" | "outlier" | "uncalibrated";
  attributionId: string;
}

export interface HotspotContext {
  count: number;
  radiusKm: number;
  hours: number;
  confidence: "high";
  source: string;
}

export interface ObservationSet {
  country: CountryCode;
  /** Adapters that contributed, e.g. ["id.bmkg", "id.klh", "crowd.airgradient"]. */
  adapters: string[];
  fetchedAt: string;
  observations: Observation[];
  attribution: Attribution[];
  /** Fire hotspots (ID: SiPongi), as points so the device can count near itself. */
  hotspots?: { lat: number; lon: number }[];
  hotspotSource?: string;
  /** Upstream problems, stated plainly ("id.bmkg: HTTP 403, serving 14:00 data"). */
  warnings?: string[];
  /**
   * The country's official source failed or timed out ("PCD Air4Thai"). The set then carries only what still answered
   * (usually community sensors); the builder notes "official_unavailable", and with nothing in range throws
   * OfficialUnavailableError so the client shows its last cached reading or a calm "Can't reach … official data" state.
   */
  officialUnavailable?: string;
}

export interface LocalBand {
  scaleId: string;
  key: string;
  labelEn: string;
  /** Authority's own word in the local language (verbatim). */
  labelLocal: string;
  lang: string;
  /** Authority's colour. Clients may mute it (SPEC v1.2 §11) but keep the hue family. */
  color: string;
  shape: "circle" | "half" | "triangle" | "octagon";
  level: Level;
  agency: string;
}

export interface StationSummary {
  stationId: string;
  name: string;
  /** km from the query point; null when no point was used (SG region lists). */
  distanceKm: number | null;
  grade: "reference" | "lowcost";
  pm25_1h: number | null;
  official: OfficialIndex | null;
  periodEnd: string;
}

/**
 * The v2.0 snapshot. Every SPEC §7 field keeps its name and meaning; `pm25`/`band` become nullable because some
 * countries publish no 1-hr PM2.5 and some have no official band. SG adds nothing it didn't have (see sgAdapter).
 */
export interface CountrySnapshot extends Omit<Snapshot, "pm25" | "band" | "instantPsi" | "instantPsiLabel" | "source"> {
  /** Big number, µg/m³: the freshest 1-hr PM2.5 at your spot, or a crowd estimate (`pm25Kind`), or null. */
  pm25: number | null;
  /** Shared 4-level band (from `level`): drives COPY.md verdict matrix, actions, notifications. Null = no band. */
  band: Band | null;
  /** SG only (API users; never shown, SPEC v1.2 §1). */
  instantPsi?: number;
  instantPsiLabel?: Snapshot["instantPsiLabel"];
  source: string;

  country: CountryCode;
  status: CoverageStatus;
  level: Level | null;
  /** Chip: the authority's own category for the number it describes. */
  localBand: LocalBand | null;
  /** What the chip describes: the 1-hr number itself, or the authority's (24-h / NowCast) index. */
  bandBasis: "pm25_1h" | "official_index" | "none";
  /** The chip classifies a community-sensor estimate, not an official number: show it with an "estimate" tag. */
  bandFromEstimate?: boolean;
  official: OfficialIndex | null;
  pm25Kind: "official_1h" | "crowd_estimate" | null;
  /** Authority's 24-h mean PM2.5 at your spot (chart line). */
  pm25_24h: number | null;
  nearest: StationSummary | null;
  /** Nearest stations used (same country only, never across a border). */
  stations: StationSummary[];
  /** SPEC v1.7 range: always contains `pm25`. Null when exact. */
  range: [number, number] | null;
  /** pm25 / WHO 2021 24-h guideline (15), 1 dp. Cross-border neutral reference. */
  whoMultiple: number | null;
  hotspots?: HotspotContext | null;
  attribution: Attribution[];
  /**
   * Machine-readable flags: "no_official_1h", "crowd_only", "nearest_far", "official_far", "stale_stations_dropped",
   * "offline_dropped" (a station ≤ 25 km silent for > 24 h), "implausible_dropped" (a reading ≤ 60 km failed the
   * plausibility guard, quality.ts).
   */
  notes: string[];
}

export interface CountryQuery {
  lat?: number;
  lon?: number;
  /** Station id to pin (region mode). */
  station?: string;
  /**
   * Hard radius (km) for a catalogue destination: nothing farther away is used, not even the 60 km "nearest_far"
   * fallback, so a far station is never stretched to cover a place (docs/sea/COVERAGE.md, Popular destinations).
   * Freshness is then judged among the stations inside the radius. Unset = the SPEC v2.0 defaults.
   */
  withinKm?: number;
}

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text?(): Promise<string>;
}>;

export interface AdapterContext {
  fetch?: FetchLike;
  now?: Date | number;
  /** Base URL of services/proxy (HAZENOW_EDGE), e.g. "https://edge.hazenow.app". Required for proxied adapters. */
  proxyBase?: string;
  signal?: AbortSignal;
  /** Per-request upstream timeout, ms (default 8 s, net.ts). */
  timeoutMs?: number;
  /** Point of interest; direct adapters use it to fetch only the nearest stations' history. Never sent to the proxy. */
  near?: { lat: number; lon: number };
}

/** A country adapter normalises one jurisdiction's sources into Observations (and, for SG, the v1 Snapshot). */
export interface CountryAdapter {
  id: string;
  country: CountryCode;
  kind: "official" | "crowd" | "mixed";
  /** "direct": clients call upstream (CORS *, no key). "proxy": via services/proxy. */
  transport: "direct" | "proxy";
  /** Scale for the band chip. */
  scaleId: string | null;
  attribution: Attribution[];
  fetchObservations(ctx?: AdapterContext): Promise<ObservationSet>;
  /** Full snapshot for a location (fetch + build). */
  getSnapshot(query?: CountryQuery, ctx?: AdapterContext): Promise<CountrySnapshot>;
}

export type { Band, HistoryPoint, LocationMode, RegionReading, Trend };
