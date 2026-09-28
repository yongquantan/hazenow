/** Canonical output model. Field names are shared with the Swift and Kotlin clients (SPEC §7). */

export type RegionName = "north" | "south" | "east" | "west" | "central";
export type Band = "normal" | "elevated" | "high" | "very_high";
export type PsiLabel = "Good" | "Moderate" | "Unhealthy" | "Very Unhealthy" | "Hazardous";
export type TrendDirection = "up" | "down" | "steady";
export type LocationMode = "gps" | "region" | "island";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Trend {
  delta: number;
  direction: TrendDirection;
}

export interface HistoryPoint {
  time: string;
  pm25: number;
  /** Official 24-hr PSI for that hour at the same spot (optional extension, for the lag chart). */
  psi24h?: number | null;
  /** NEA's 24-hr average PM2.5 (µg/m³, `pm25_twenty_four_hourly`) for that hour at the same spot (optional extension, the chart line). */
  pm25Avg24h?: number | null;
}

export interface RegionReading {
  pm25: number | null;
  psi24h: number | null;
  lat: number;
  lon: number;
}

export interface Snapshot {
  pm25: number;
  band: Band;
  instantPsi: number;
  instantPsiLabel: PsiLabel;
  officialPsi24h: number | null;
  trend: Trend;
  history: HistoryPoint[];
  regions: Record<string, RegionReading>;
  nearestRegion: string;
  locationMode: LocationMode;
  observedAt: string;
  publishedAt: string;
  stale: boolean;
  source: "NEA via data.gov.sg";
}

/** One hourly reading, normalised: invalid values (-1, null, negative, missing) are `null`. */
export interface HourReading {
  /** item.timestamp (the hour observed), ISO 8601 with +08:00 */
  time: string;
  /** item.updatedTimestamp (when it was published) */
  published: string;
  values: Record<string, number | null>;
}

/** Where the user wants the reading for. */
export interface LocationQuery {
  lat?: number;
  lon?: number;
  region?: string;
}
