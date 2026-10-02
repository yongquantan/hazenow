/**
 * Thailand, PCD Air4Thai (docs/sea/thailand.md). Both endpoints are CORS `*`, keyless → direct from clients.
 *
 *  - Station list + official index: GET https://air4thai.pcd.go.th/forweb/getAQI_JSON.php
 *    `AQILast.PM25.value` is the **24-hr rolling mean**, NOT the 1-hr value. `AQILast.AQI` is the overall Thai AQI.
 *  - 1-hr PM2.5: GET …/forweb/getHistoryData.php?stationID=a,b&param=PM25&type=hr&sdate=D-1&edate=D&stime=00&etime=23
 *    Hour-ENDING labels, 1 dp, ICT (UTC+7) with no offset in the string. The newest row appears as `null` before
 *    its value arrives (~hh:03 BMA, ~hh:09 PCD, tail ~hh:20).
 * Numbers are strings in getAQI_JSON; "-1"/"-999"/"-9999" = missing. History uses JSON null.
 */
import { classifyIndex } from "../scales.js";
import { HOUR_MS, localDate, num, wallToIso } from "../time.js";
import type { Attribution, Observation, ObservationHour } from "../types.js";

export const ICT = 7;
export const AIR4THAI_BASE = "https://air4thai.pcd.go.th/forweb";

export const AIR4THAI_ATTRIBUTION: Attribution = {
  id: "th.pcd",
  text: "Data: Pollution Control Department (PCD) Air4Thai, Thailand",
  url: "https://air4thai.pcd.go.th/",
  licence: "Thai government public data; redistribution terms unconfirmed (licence request pending)",
};

export interface Air4ThaiStation {
  stationID: string;
  nameEN?: string;
  nameTH?: string;
  areaEN?: string;
  stationType?: string;
  lat: string | number;
  long: string | number;
  AQILast?: {
    date?: string;
    time?: string;
    PM25?: { color_id?: string; aqi?: string; value?: string };
    AQI?: { color_id?: string; aqi?: string; param?: string };
  };
}

export interface Air4ThaiHistoryResponse {
  result?: string;
  stations?: { stationID: string; data?: { DATETIMEDATA: string; PM25: number | null }[] }[];
}

export function air4thaiAqiUrl(base = AIR4THAI_BASE): string {
  return `${base}/getAQI_JSON.php`;
}

/** History URL for stations, yesterday → today in ICT (≥24 h for the rolling mean and the chart). */
export function air4thaiHistoryUrl(stationIds: readonly string[], now: number, base = AIR4THAI_BASE): string {
  const d = localDate(now, ICT);
  const y = localDate(now - 24 * HOUR_MS, ICT);
  const ids = stationIds.map(encodeURIComponent).join(",");
  return `${base}/getHistoryData.php?stationID=${ids}&param=PM25&type=hr&sdate=${y}&edate=${d}&stime=00&etime=23`;
}

export function parseAir4ThaiStations(raw: unknown): Air4ThaiStation[] {
  const list = (raw as { stations?: unknown })?.stations;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (s): s is Air4ThaiStation =>
      !!s && typeof s === "object" && typeof (s as Air4ThaiStation).stationID === "string" && num((s as Air4ThaiStation).lat) !== null,
  );
}

/** stationID → hourly series (hour-ending ISO +07:00), oldest → newest. */
export function parseAir4ThaiHistory(raw: unknown): Record<string, { time: string; pm25: number | null }[]> {
  const out: Record<string, { time: string; pm25: number | null }[]> = {};
  const stations = (raw as Air4ThaiHistoryResponse)?.stations;
  if (!Array.isArray(stations)) return out;
  for (const st of stations) {
    if (!st?.stationID || !Array.isArray(st.data)) continue;
    const rows: { time: string; pm25: number | null }[] = [];
    for (const d of st.data) {
      const t = typeof d?.DATETIMEDATA === "string" ? wallToIso(d.DATETIMEDATA, ICT) : null;
      if (!t) continue;
      rows.push({ time: t, pm25: num(d.PM25) });
    }
    const ts = new Map(rows.map((r) => [r, Date.parse(r.time)]));
    rows.sort((a, b) => ts.get(a)! - ts.get(b)!);
    out[st.stationID] = rows;
  }
  return out;
}

/**
 * PCD's rolling 24-h mean over the available hours ending at index i (reproduces AQILast exactly; thailand.md).
 * `ts` holds the rows' times as epoch ms (parsed once per station: this runs on a 10 ms-CPU edge worker).
 */
function rolling24(rows: { time: string; pm25: number | null }[], ts: readonly number[], i: number): number | null {
  const end = ts[i];
  let sum = 0;
  let n = 0;
  for (let j = 0; j < rows.length; j++) {
    const t = ts[j];
    const v = rows[j].pm25;
    if (t <= end && t > end - 24 * HOUR_MS && v !== null) {
      sum += v;
      n++;
    }
  }
  if (n < 12) return null;
  return Math.round((sum / n) * 10) / 10;
}

/**
 * Stations (+ optional history) → Observations. Without history for a station, it still carries the official
 * index and 24-h PM2.5, but `pm25_1h` is null (AQILast is never used as the 1-hr value).
 */
export function air4thaiObservations(
  stations: readonly Air4ThaiStation[],
  history: Record<string, { time: string; pm25: number | null }[]> = {},
  /** Hours of history kept per station (the rolling mean is computed on the full series first). */
  keepHours = 26,
): Observation[] {
  const out: Observation[] = [];
  for (const s of stations) {
    const lat = num(s.lat);
    const lon = num(s.long);
    if (lat === null || lon === null) continue;
    const last = s.AQILast ?? {};
    const lastTime = last.date && last.time ? wallToIso(`${last.date} ${last.time}`, ICT) : null;
    const aqi = num(last.AQI?.aqi);
    const official =
      aqi !== null
        ? {
            scaleId: "th_aqi",
            name: "Thai AQI",
            value: aqi,
            category: classifyIndex("th_aqi", aqi)?.labelLocal ?? null,
            averaging: "24h" as const,
            param: last.AQI?.param && last.AQI.param !== "-1" ? last.AQI.param : null,
            agency: "PCD",
          }
        : null;
    const pm25_24h = num(last.PM25?.value);
    const rows = history[s.stationID] ?? [];
    const ts = rows.map((r) => Date.parse(r.time));
    const from = Math.max(0, rows.length - keepHours);
    const hist: ObservationHour[] = [];
    for (let i = from; i < rows.length; i++) hist.push({ time: rows[i].time, pm25: rows[i].pm25, pm25Avg24h: rolling24(rows, ts, i) });
    // The chart line at the AQILast hour is PCD's own published value.
    if (lastTime && pm25_24h !== null) {
      const h = hist.find((x) => Date.parse(x.time) === Date.parse(lastTime));
      if (h) h.pm25Avg24h = pm25_24h;
    }
    const lastValid = [...rows].reverse().find((r) => r.pm25 !== null);
    const periodEnd = lastValid?.time ?? lastTime ?? null;
    if (!periodEnd) continue;
    const name = (s.nameEN ?? s.nameTH ?? s.stationID).trim();
    out.push({
      stationId: `th.pcd:${s.stationID}`,
      name,
      country: "TH",
      lat,
      lon,
      grade: "reference",
      pm25_1h: lastValid?.pm25 ?? null,
      pm25_24h,
      official,
      periodEnd,
      history: hist.length ? hist : undefined,
      corrected: "none",
      attributionId: AIR4THAI_ATTRIBUTION.id,
    });
  }
  return out;
}
