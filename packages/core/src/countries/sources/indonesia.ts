/**
 * Indonesia (docs/sea/indonesia.md). All via proxy.
 *
 * - BMKG hourly PM2.5 (the "now"): server-rendered `__NUXT_DATA__` in https://www.bmkg.go.id/kualitas-udara/pm25
 *   (the JSON API returns 401). Rows {nama_file, LOKASI, JAM, PM25, KONDISI, LAT, LON}; `JAM` is the WIB hour.
 *   JAM N goes live at ~(N+1):17 WIB, so it is read as the hour **beginning** at N (period end N+1:00, unverified
 *   by BMKG). Needs a full browser User-Agent. KONDISI = ISPU category applied to the 1-hr value (BMKG practice).
 * - KLH ISPU (the official 24-hr line): https://ispu.kemenlh.go.id/apimobile/v1/getStations. `a_pm25` is a 24-h
 *   rolling mean (µg/m³), `t_pm25` the PM2.5 ISPU sub-index. `a_pm25 "0"` = missing (INTEGRASI stations).
 *   `waktu` is local wall time in the PROVINCE's zone; `time_z` is sometimes wrong (E. Kalimantan tagged WIB).
 * - SiPongi hotspots (context): GeoJSON, CORS *, ~2 h behind the overpass.
 */
import { classifyIndex } from "../scales.js";
import { HOUR_MS, localDate, msToIso, num, wallToIso } from "../time.js";
import type { Attribution, Observation } from "../types.js";

export const WIB = 7;
export const BMKG_URL = "https://www.bmkg.go.id/kualitas-udara/pm25";
export const ISPU_URL = "https://ispu.kemenlh.go.id/apimobile/v1/getStations";
export const SIPONGI_URL =
  "https://opsroom-sipongi.gakkum.kehutanan.go.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&late=24" +
  "&satelit%5B%5D=NASA-MODIS&satelit%5B%5D=NASA-SNPP&satelit%5B%5D=NASA-NOAA20&confidence%5B%5D=high";
/** BMKG's Cloudflare returns 403 to a bare "Mozilla/5.0"; a full browser UA string works (indonesia.md). */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const BMKG_ATTRIBUTION: Attribution = {
  id: "id.bmkg",
  text: "Data: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika), hourly PM2.5",
  url: "https://www.bmkg.go.id/kualitas-udara/pm25",
  licence: "No licence published; BMKG requires naming BMKG as the source. Permission requested",
};
export const KLH_ATTRIBUTION: Attribution = {
  id: "id.klh",
  text: "Data: ISPU, Kementerian Lingkungan Hidup / BPLH",
  url: "https://ispu.kemenlh.go.id/",
  licence: "Government public information; no licence published",
};
export const SIPONGI_ATTRIBUTION: Attribution = {
  id: "id.sipongi",
  text: "Hotspots: SiPongi, Kementerian Kehutanan (from NASA MODIS/VIIRS)",
  url: "https://sipongi.gakkum.kehutanan.go.id/",
  licence: "No licence published; underlying NASA FIRMS data is public domain",
};

/* ------------------------------------------------------------------ BMKG */

export interface BmkgRow {
  nama_file: string;
  LOKASI: string;
  JAM: number;
  PM25: number | null;
  KONDISI?: string;
  LAT: string | number;
  LON: string | number;
}

/** Devalue-style Nuxt payload: a flat array where objects/arrays hold indices into the array. */
export function parseNuxtRows(html: string): BmkgRow[] {
  const m = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  let arr: unknown[];
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const deref = (i: unknown, depth = 0): unknown => {
    if (typeof i !== "number" || depth > 20) return i;
    const v = arr[i];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = deref(x, depth + 1);
      return o;
    }
    return v;
  };
  const rows: BmkgRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!v || typeof v !== "object" || Array.isArray(v) || !("LOKASI" in v) || !("PM25" in v)) continue;
    const o = deref(i) as Record<string, unknown>;
    if (typeof o.nama_file !== "string" || typeof o.LOKASI !== "string") continue;
    rows.push({
      nama_file: o.nama_file,
      LOKASI: o.LOKASI.trim(),
      JAM: Number(o.JAM),
      PM25: num(o.PM25),
      KONDISI: typeof o.KONDISI === "string" ? o.KONDISI : undefined,
      LAT: o.LAT as string,
      LON: o.LON as string,
    });
  }
  return rows;
}

/**
 * The list carries only `JAM` (WIB hour), no date. Resolve against the fetch time: the newest JAM that is not in
 * the future. Period end = JAM + 1 h (hour-beginning label, see header).
 */
export function bmkgPeriodEnd(jam: number, fetchedAt: number): string | null {
  if (!Number.isInteger(jam) || jam < 0 || jam > 23) return null;
  const today = localDate(fetchedAt, WIB);
  let start = Date.parse(wallToIso(`${today} ${String(jam).padStart(2, "0")}:00`, WIB)!);
  if (start + HOUR_MS > fetchedAt + 10 * 60_000) start -= 24 * HOUR_MS; // e.g. JAM 23 fetched at 00:20 → yesterday
  return msToIso(start + HOUR_MS, WIB);
}

export function bmkgObservations(html: string, fetchedAt: number): Observation[] {
  const out: Observation[] = [];
  for (const r of parseNuxtRows(html)) {
    const lat = Number(r.LAT);
    const lon = Number(r.LON);
    const periodEnd = bmkgPeriodEnd(r.JAM, fetchedAt);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !periodEnd || r.PM25 === null) continue;
    out.push({
      stationId: `id.bmkg:${r.nama_file.replace(/\.xml$/, "")}`,
      name: r.LOKASI,
      country: "ID",
      lat,
      lon,
      grade: "reference",
      pm25_1h: r.PM25,
      periodEnd,
      publishedAt: new Date(fetchedAt).toISOString(),
      corrected: "none",
      attributionId: BMKG_ATTRIBUTION.id,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ KLH ISPU */

const WITA_PROVINCES = [
  "bali", "nusa tenggara", "kalimantan selatan", "kalimantan timur", "kalimantan utara", "sulawesi", "gorontalo",
];
const WIT_PROVINCES = ["maluku", "papua"];

/** UTC offset for an Indonesian province (the feed's own `time_z` is unreliable). */
export function provinceOffset(provinsi: string | undefined, timeZ?: string): number {
  const p = (provinsi ?? "").toLowerCase();
  if (WIT_PROVINCES.some((x) => p.includes(x))) return 9;
  if (WITA_PROVINCES.some((x) => p.includes(x))) return 8;
  if (p) return 7;
  return timeZ === "WIT" ? 9 : timeZ === "WITA" ? 8 : 7;
}

interface IspuRow {
  id_stasiun?: string;
  nama?: string;
  waktu?: string;
  lat?: string;
  lon?: string;
  a_pm25?: string | number | null;
  t_pm25?: string | number | null;
  provinsi?: string;
  time_z?: string;
  is_maintenance?: string;
}

export function ispuObservations(raw: unknown, now: number): Observation[] {
  const rows = (raw as { rows?: IspuRow[] })?.rows;
  if (!Array.isArray(rows)) return [];
  const out: Observation[] = [];
  for (const r of rows) {
    if (!r?.id_stasiun || r.is_maintenance === "1") continue;
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const off = provinceOffset(r.provinsi, r.time_z);
    const periodEnd = r.waktu ? wallToIso(r.waktu, off) : null;
    if (!periodEnd || Date.parse(periodEnd) > now + 10 * 60_000) continue; // future stamp = mis-tagged zone
    // `a_pm25 "0"` means missing (header), and so does the PM2.5 sub-index computed from it (`t_pm25 "0"`): a real
    // 24-h ISPU of 0 would need perfectly clean air for a day (DLH Medan 01/02, coverage-hunt/id.md).
    const a = num(r.a_pm25);
    const idx = a && a > 0 && num(r.t_pm25) !== 0 ? num(r.t_pm25) : null;
    out.push({
      stationId: `id.klh:${r.id_stasiun}`,
      name: (r.nama ?? r.id_stasiun).trim(),
      country: "ID",
      lat,
      lon,
      grade: "reference",
      pm25_1h: null,
      pm25_24h: a && a > 0 ? a : null,
      official:
        idx !== null
          ? { scaleId: "id_ispu", name: "ISPU", value: idx, category: classifyIndex("id_ispu", idx)?.labelLocal ?? null, averaging: "24h", param: "PM2.5", agency: "KLH" }
          : null,
      periodEnd,
      corrected: "none",
      attributionId: KLH_ATTRIBUTION.id,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ SiPongi */

export function sipongiHotspots(raw: unknown): { lat: number; lon: number }[] {
  const f = (raw as { features?: { geometry?: { coordinates?: number[] }; properties?: { confidence_level?: string } }[] })?.features;
  if (!Array.isArray(f)) return [];
  const out: { lat: number; lon: number }[] = [];
  for (const x of f) {
    const c = x?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    if (x.properties?.confidence_level && x.properties.confidence_level !== "high") continue;
    out.push({ lat: Math.round(c[1] * 1000) / 1000, lon: Math.round(c[0] * 1000) / 1000 });
  }
  return out;
}

