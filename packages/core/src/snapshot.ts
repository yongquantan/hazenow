/** Pure Snapshot builder: parsed API responses + location + clock → Snapshot. No I/O. */
import { HISTORY_HOURS, SOURCE, STALE_AFTER_MS } from "./constants.js";
import { bandFor, instantPsi, isValidReading, locate, psiLabel, trend } from "./math.js";
import {
  mergeHours,
  mergeV1V2,
  parseHours,
  parseRegionCoords,
  PM25_KEY,
  PSI24_KEY,
  PM25_24H_KEY,
  type ApiResponse,
} from "./parse.js";
import type { HistoryPoint, HourReading, LocationQuery, RegionReading, Snapshot } from "./types.js";

export class NoDataError extends Error {
  constructor(message = "No valid PM2.5 readings available") {
    super(message);
    this.name = "NoDataError";
  }
}

export interface SnapshotInputs {
  /** GET /pm25 (latest) */
  pm25Latest?: ApiResponse | null;
  /** GET /pm25?date=… for today and yesterday (any order) */
  pm25Days?: (ApiResponse | null | undefined)[];
  /** GET /psi (latest) */
  psi?: ApiResponse | null;
  /** GET /psi?date=… for today and yesterday (any order); enables psi24h in history */
  psiDays?: (ApiResponse | null | undefined)[];
  /** v1 PM2.5 responses (latest and/or ?date=), already normalised with fromV1(). Primary for freshness (SPEC v1.3). */
  v1Pm25?: (ApiResponse | null | undefined)[];
  /** v1 PSI responses (latest and/or ?date=), normalised with fromV1(). */
  v1Psi?: (ApiResponse | null | undefined)[];
}

const HOUR_MS = 3600_000;

function hasAnyValid(h: HourReading): boolean {
  return Object.values(h.values).some(isValidReading);
}

/** True if the reading observed at `observedAt` is older than 2h15m at `now`. */
export function isStale(observedAt: string, now: Date | number = Date.now()): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  return t - Date.parse(observedAt) > STALE_AFTER_MS;
}

export function buildSnapshot(inputs: SnapshotInputs, query: LocationQuery = {}, now: Date | number = Date.now()): Snapshot {
  const days = inputs.pm25Days ?? [];
  const psiDays = inputs.psiDays ?? [];
  const v1Pm25 = inputs.v1Pm25 ?? [];
  const v1Psi = inputs.v1Psi ?? [];
  const coords = parseRegionCoords(inputs.pm25Latest, ...days, inputs.psi, ...psiDays, ...v1Pm25, ...v1Psi);
  const hoursOf = (v2: (ApiResponse | null | undefined)[], v1: (ApiResponse | null | undefined)[], key: string) =>
    mergeV1V2(mergeHours(...v1.map((d) => parseHours(d, key))), mergeHours(...v2.map((d) => parseHours(d, key))));
  const hours = hoursOf([inputs.pm25Latest, ...days], v1Pm25, PM25_KEY);
  if (hours.length === 0) throw new NoDataError("No PM2.5 readings in response");

  // Walk back from the newest hour to the most recent one with any valid data.
  let idx = hours.length - 1;
  while (idx >= 0 && !hasAnyValid(hours[idx])) idx--;
  if (idx < 0) throw new NoDataError();
  const walkedBack = idx !== hours.length - 1;
  const observed = hours[idx];

  const here = locate(observed.values, coords, query);
  if (here.value === null) throw new NoDataError();
  const pm25 = here.value;

  // Official 24-hr PSI, hour by hour.
  const psiHours = hoursOf([inputs.psi, ...psiDays], v1Psi, PSI24_KEY);
  const psiByHour = new Map(psiHours.map((h) => [Date.parse(h.time), h]));
  const psiAt = (time: string) => {
    const h = psiByHour.get(Date.parse(time));
    return h ? locate(h.values, coords, query).value : null;
  };
  const avgHours = hoursOf([inputs.psi, ...psiDays], v1Psi, PM25_24H_KEY);
  const avgByHour = new Map(avgHours.map((h) => [Date.parse(h.time), h]));
  const avgAt = (time: string) => {
    const h = avgByHour.get(Date.parse(time));
    return h ? locate(h.values, coords, query).value : null;
  };

  // History at the same spot, oldest → newest, ending at the observed hour.
  const history: HistoryPoint[] = [];
  const minT = Date.parse(observed.time) - (HISTORY_HOURS - 1) * HOUR_MS;
  for (let i = 0; i <= idx; i++) {
    const h = hours[i];
    if (Date.parse(h.time) < minT) continue;
    const v = i === idx ? pm25 : locate(h.values, coords, query).value;
    if (v !== null) history.push({ time: h.time, pm25: v, psi24h: psiAt(h.time), pm25Avg24h: avgAt(h.time) });
  }

  // Trend: vs the reading exactly one hour earlier (same location method).
  const prevT = Date.parse(observed.time) - HOUR_MS;
  const prevHour = hours.find((h) => Date.parse(h.time) === prevT);
  const prev = prevHour ? locate(prevHour.values, coords, query).value : null;

  // Official 24-hr PSI now: prefer the item for the same hour, else the newest.
  const psiHour =
    psiHours.find((h) => h.time && Date.parse(h.time) === Date.parse(observed.time)) ?? psiHours[psiHours.length - 1];
  const psiValues = psiHour?.values ?? {};
  const officialPsi24h = psiHour ? locate(psiValues, coords, query).value : null;

  const regions: Record<string, RegionReading> = {};
  for (const [name, c] of Object.entries(coords)) {
    const v = observed.values[name];
    const p = psiValues[name];
    regions[name] = {
      pm25: isValidReading(v) ? v : null,
      psi24h: isValidReading(p) ? p : null,
      lat: c.lat,
      lon: c.lon,
    };
  }

  const ip = instantPsi(pm25);
  return {
    pm25,
    band: bandFor(pm25),
    instantPsi: ip,
    instantPsiLabel: psiLabel(ip),
    officialPsi24h,
    trend: trend(pm25, prev),
    history,
    regions,
    nearestRegion: here.nearestRegion,
    locationMode: here.locationMode,
    observedAt: observed.time,
    publishedAt: observed.published,
    stale: walkedBack || isStale(observed.time, now),
    source: SOURCE,
  };
}

/** Re-evaluate staleness of a cached snapshot (e.g. when shown offline). */
export function refreshStale(s: Snapshot, now: Date | number = Date.now()): Snapshot {
  return { ...s, stale: s.stale || isStale(s.observedAt, now) };
}
