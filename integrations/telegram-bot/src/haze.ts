// (Identical copy of integrations/raycast/src/haze.ts. Keep them in sync.)
// HazeNow SPEC maths + data.gov.sg fetch + docs/COPY.md strings. Self-contained (no dependency on packages/core).
// MIT licensed. Keep in sync with SPEC.md (incl. v1.2 amendments) and docs/COPY.md.
// NOTE: user-facing text never shows Instant PSI (SPEC v1.2 #1); `instantPsi` stays in the data model for JSON users only.

export const API = "https://api-open.data.gov.sg/v2/real-time/api"; // v2: rate-limited (429 after ~4 rapid calls)
export const API_V1 = "https://api.data.gov.sg/v1/environment"; // v1: primary (SPEC v1.3), stable first-publish stamp
export const SOURCE = "NEA via data.gov.sg";
export const FORECAST_URL = "https://www.haze.gov.sg/";

export type Band = "normal" | "elevated" | "high" | "very_high";
export type Profile = "general" | "kids" | "elderly" | "pregnant" | "heart_lung" | "exercising" | "outdoor_worker";
export type LatLon = { lat: number; lon: number };
export type Readings = Record<string, number | null | undefined>;

export const REGIONS = ["central", "north", "south", "east", "west"] as const;
export const PROFILES: Profile[] = ["general", "kids", "elderly", "pregnant", "heart_lung", "exercising", "outdoor_worker"];
export const FALLBACK_COORDS: Record<string, LatLon> = {
  north: { lat: 1.41803, lon: 103.82 },
  south: { lat: 1.29587, lon: 103.82 },
  east: { lat: 1.35735, lon: 103.94 },
  west: { lat: 1.35735, lon: 103.7 },
  central: { lat: 1.35735, lon: 103.82 },
};

// COPY §3: chip text + a shape glyph (never colour alone; never ▲/▼ in the chip, those mean trend).
export const BANDS: Record<Band, { label: string; color: string; glyph: string; emoji: string }> = {
  normal: { label: "Normal", color: "#2E9E5B", glyph: "●", emoji: "🟢" },
  elevated: { label: "Elevated", color: "#E8A317", glyph: "◐", emoji: "🟠" },
  high: { label: "High", color: "#E4572E", glyph: "△", emoji: "🔴" },
  very_high: { label: "Very High", color: "#7B2D8E", glyph: "⬣", emoji: "🟣" },
};

const BP: [number, number, number, number][] = [
  [0, 12, 0, 50],
  [12, 55, 50, 100],
  [55, 150, 100, 200],
  [150, 250, 200, 300],
  [250, 350, 300, 400],
  [350, 500, 400, 500],
];

export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);
export const isValid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function bandOf(pm25: number): Band {
  if (pm25 <= 55) return "normal";
  if (pm25 <= 150) return "elevated";
  if (pm25 <= 250) return "high";
  return "very_high";
}
const BAND_ORDER: Band[] = ["normal", "elevated", "high", "very_high"];
export const bandRank = (b: Band): number => BAND_ORDER.indexOf(b);

/** Data-model only (SPEC v1.2 #1): never render this in UI text. */
export function instantPsi(c: number): number {
  if (c >= 500) return 500;
  for (const [clo, chi, ilo, ihi] of BP) {
    if (c <= chi) return Math.min(500, roundHalfUp(ilo + ((c - clo) * (ihi - ilo)) / (chi - clo)));
  }
  return 500;
}

/** NEA's own 24-hr PSI descriptors (quoting NEA is the only allowed use of "Hazardous"). */
export function psiDescriptor(psi: number): string {
  if (psi <= 50) return "Good";
  if (psi <= 100) return "Moderate";
  if (psi <= 200) return "Unhealthy";
  if (psi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(h));
}

export type Spot = {
  value: number | null;
  mode: "gps" | "region" | "island";
  nearest: string | null;
  nearestKm?: number;
  blended?: boolean;
  fellBack: boolean;
  nearby?: [number, number]; // two nearest stations' readings (lo, hi), GPS only
};

/** SPEC §1: reading "at your spot". `region` may be a region name or "island". */
export function atSpot(readings: Readings, coords: Record<string, LatLon>, region = "central", loc?: LatLon): Spot {
  const ok = Object.entries(readings).filter(
    (e): e is [string, number] => isValid(e[1]) && coords[e[0]] !== undefined,
  );
  if (ok.length === 0) return { value: null, mode: "island", nearest: null, fellBack: true };
  if (loc) {
    const d = ok.map(([k, v]) => ({ k, v, d: haversineKm(loc, coords[k]) })).sort((a, b) => a.d - b.d);
    const nearby: [number, number] | undefined =
      d.length >= 2 ? [Math.min(d[0].v, d[1].v), Math.max(d[0].v, d[1].v)] : undefined;
    if (d[0].d < 0.5) return { value: roundHalfUp(d[0].v), mode: "gps", nearest: d[0].k, nearestKm: d[0].d, blended: false, fellBack: false, nearby };
    let num = 0;
    let den = 0;
    for (const x of d) {
      num += x.v / x.d ** 2;
      den += 1 / x.d ** 2;
    }
    return { value: roundHalfUp(num / den), mode: "gps", nearest: d[0].k, nearestKm: d[0].d, blended: true, fellBack: false, nearby };
  }
  const hit = ok.find(([k]) => k === region);
  if (hit) return { value: roundHalfUp(hit[1]), mode: "region", nearest: region, fellBack: false };
  const mean = ok.reduce((s, [, v]) => s + v, 0) / ok.length;
  return { value: roundHalfUp(mean), mode: "island", nearest: region === "island" ? null : region, fellBack: region !== "island" };
}

export function trendOf(delta: number): { delta: number; direction: "up" | "down" | "steady"; arrow: string } {
  if (delta >= 5) return { delta, direction: "up", arrow: "▲" };
  if (delta <= -5) return { delta, direction: "down", arrow: "▼" };
  return { delta, direction: "steady", arrow: "▶" };
}
export const arrowOf = (d: "up" | "down" | "steady"): string => (d === "up" ? "▲" : d === "down" ? "▼" : "▶");

// ------------------------------------------------------------------ data
type Item = { timestamp: string; updatedTimestamp?: string; readings: Record<string, Readings> };
export type ApiData = {
  regionMetadata?: { name: string; labelLocation: { latitude: number; longitude: number } }[];
  items: Item[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** v2 GET with backoff: the keyless API returns HTTP 429 ("try again in 10 seconds") under bursts. */
export async function fetchData(path: string, fetchImpl: typeof fetch = fetch, retries = 2): Promise<ApiData> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${API}/${path}`, { headers: { accept: "application/json" } });
    if (res.status === 429 && attempt < retries) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`data.gov.sg ${res.status}`);
    const body = (await res.json()) as { code: number; data: ApiData | null; errorMsg?: string };
    if (body.code !== 0 || !body.data) throw new Error(body.errorMsg || "bad response");
    return body.data;
  }
}

type V1 = {
  region_metadata?: { name: string; label_location: { latitude: number; longitude: number } }[];
  items?: { timestamp: string; update_timestamp?: string; readings: Record<string, Readings> }[];
};
/** v1 (snake_case) → v2 shape. */
export function fromV1(d: V1): ApiData {
  return {
    regionMetadata: (d.region_metadata ?? []).map((m) => ({ name: m.name, labelLocation: m.label_location })),
    items: (d.items ?? []).map((it) => ({ timestamp: it.timestamp, updatedTimestamp: it.update_timestamp, readings: it.readings })),
  };
}

/** SPEC v1.3: v1 first (fresh, no observed rate limit), v2 as fallback. kind = "pm25" | "psi". */
export async function fetchKind(kind: "pm25" | "psi", date: string | null, fetchImpl: typeof fetch = fetch): Promise<ApiData> {
  try {
    const res = await fetchImpl(`${API_V1}/${kind}${date ? `?date=${date}` : ""}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`v1 ${res.status}`);
    const d = fromV1((await res.json()) as V1);
    if (d.items.length || date) return d;
    throw new Error("v1 empty");
  } catch {
    return fetchData(`${kind}${date ? `?date=${date}` : ""}`, fetchImpl);
  }
}

export function coordsFrom(meta: ApiData["regionMetadata"]): Record<string, LatLon> {
  const c: Record<string, LatLon> = { ...FALLBACK_COORDS };
  for (const m of meta ?? []) c[m.name] = { lat: m.labelLocation.latitude, lon: m.labelLocation.longitude };
  return c;
}

export const sgtDate = (offsetDays: number, now = new Date()): string =>
  new Date(now.getTime() + 8 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10);

/** pm: hourly PM2.5 day lists (today first). psi: /psi day lists (today first) → 24-hr PSI + 24-hr PM2.5 history. */
export type RawData = { pm: ApiData[]; psi: ApiData[] };

/**
 * Sequential fetches: today's lists already contain the latest hour. `yesterday` lets callers supply
 * cached past-day payloads (past days don't change). `backfill` = extra v2 lists to merge (SPEC v1.3 #2).
 */
export async function fetchRaw(
  opts: { fetchImpl?: typeof fetch; now?: Date; yesterday?: { pm?: ApiData; psi?: ApiData } } = {},
): Promise<RawData> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  let pmToday = await fetchKind("pm25", sgtDate(0, now), f);
  if (!pmToday.items?.length) pmToday = await fetchKind("pm25", null, f); // just after midnight
  const pm = [pmToday];
  const psi: ApiData[] = [];
  try {
    psi.push(await fetchKind("psi", sgtDate(0, now), f));
  } catch {
    /* official figure is best-effort */
  }
  for (const [list, kind, cached] of [
    [pm, "pm25", opts.yesterday?.pm],
    [psi, "psi", opts.yesterday?.psi],
  ] as const) {
    try {
      list.push(cached ?? (await fetchKind(kind, sgtDate(1, now), f)));
    } catch {
      /* history is best-effort */
    }
  }
  return { pm, psi };
}

/** Merge items for the same hour: earlier lists win per region when valid; later lists fill gaps (SPEC v1.3 #2). */
function mergeItems(lists: ApiData[]): Map<string, Item> {
  const byTs = new Map<string, Item>();
  for (const d of lists)
    for (const it of d.items ?? []) {
      const have = byTs.get(it.timestamp);
      if (!have) {
        byTs.set(it.timestamp, { ...it, readings: Object.fromEntries(Object.entries(it.readings).map(([k, v]) => [k, { ...v }])) });
        continue;
      }
      for (const [field, vals] of Object.entries(it.readings)) {
        const tgt = (have.readings[field] ??= {});
        for (const [k, v] of Object.entries(vals ?? {})) if (!isValid(tgt[k]) && isValid(v)) tgt[k] = v;
      }
    }
  return byTs;
}

export type Snapshot = {
  pm25: number;
  band: Band;
  instantPsi: number; // data model only, never displayed
  officialPsi24h: number | null;
  trend: { delta: number; direction: "up" | "down" | "steady" };
  history: { time: string; pm25: number; pm25_24h: number | null; psi24h: number | null }[];
  regions: Record<string, { pm25: number | null; psi24h: number | null; lat: number; lon: number }>;
  nearestRegion: string;
  nearestKm: number | null;
  blended: boolean;
  fellBack: boolean;
  nearby: [number, number] | null;
  locationMode: "gps" | "region" | "island";
  observedAt: string;
  publishedAt: string;
  stale: boolean;
  source: string;
};

/** Pure: build a SPEC Snapshot from raw API payloads. */
export function buildSnapshot(raw: RawData, region = "central", loc?: LatLon, now = new Date()): Snapshot {
  const coords = coordsFrom(raw.pm.find((d) => d.regionMetadata?.length)?.regionMetadata);
  const ordered = [...mergeItems(raw.pm).values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const psiByTs = new Map<string, Record<string, Readings>>();
  for (const [ts, it] of mergeItems(raw.psi)) psiByTs.set(ts, it.readings);

  const pmOf = (it: Item): Readings => it.readings.pm25_one_hourly ?? {};
  const idx = ordered.findIndex((it) => Object.values(pmOf(it)).some(isValid));
  if (idx < 0) throw new Error("No valid PM2.5 readings");
  const cur = ordered[idx];
  const spot = atSpot(pmOf(cur), coords, region, loc);
  const pm25 = spot.value as number;

  // Official series at the same place: nearest/selected region, else island mean.
  const officialAt = (ts: string, key: string): number | null => {
    const r = psiByTs.get(ts)?.[key];
    if (!r) return null;
    const k = spot.mode === "island" ? null : spot.nearest;
    if (k && isValid(r[k])) return r[k] as number;
    const vs = Object.values(r).filter(isValid);
    return vs.length ? roundHalfUp(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
  };

  const prev = idx + 1 < ordered.length ? atSpot(pmOf(ordered[idx + 1]), coords, region, loc).value : null;
  const t = trendOf(prev == null ? 0 : pm25 - prev);
  const history: Snapshot["history"] = [];
  for (const it of ordered.slice(idx, idx + 24).reverse()) {
    const v = atSpot(pmOf(it), coords, region, loc).value;
    if (v != null)
      history.push({
        time: it.timestamp,
        pm25: v,
        pm25_24h: officialAt(it.timestamp, "pm25_twenty_four_hourly"),
        psi24h: officialAt(it.timestamp, "psi_twenty_four_hourly"),
      });
  }
  const psiLatestTs = [...psiByTs.keys()].sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const latestPsi: Readings = (psiLatestTs && psiByTs.get(psiLatestTs)?.psi_twenty_four_hourly) || {};
  const regions: Snapshot["regions"] = {};
  const r = pmOf(cur);
  for (const k of REGIONS) {
    if (!coords[k]) continue;
    regions[k] = {
      pm25: isValid(r[k]) ? (r[k] as number) : null,
      psi24h: isValid(latestPsi[k]) ? (latestPsi[k] as number) : null,
      lat: coords[k].lat,
      lon: coords[k].lon,
    };
  }
  return {
    pm25,
    band: bandOf(pm25),
    instantPsi: instantPsi(pm25),
    officialPsi24h: officialAt(cur.timestamp, "psi_twenty_four_hourly") ?? officialAtLatest(latestPsi, spot),
    trend: { delta: t.delta, direction: t.direction },
    history,
    regions,
    nearestRegion: spot.nearest ?? "island",
    nearestKm: spot.nearestKm ?? null,
    blended: !!spot.blended,
    fellBack: spot.fellBack,
    nearby: spot.nearby ?? null,
    locationMode: spot.mode,
    observedAt: cur.timestamp,
    publishedAt: cur.updatedTimestamp ?? cur.timestamp,
    stale: now.getTime() - Date.parse(cur.timestamp) > (2 * 60 + 15) * 60_000,
    source: SOURCE,
  };
}

function officialAtLatest(latest: Readings, spot: Spot): number | null {
  if (spot.mode !== "island" && spot.nearest && isValid(latest[spot.nearest])) return latest[spot.nearest] as number;
  const vs = Object.values(latest).filter(isValid);
  return vs.length ? roundHalfUp(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
}

export async function getSnapshot(region = "central", loc?: LatLon, fetchImpl?: typeof fetch): Promise<Snapshot> {
  return buildSnapshot(await fetchRaw({ fetchImpl }), region, loc);
}

// ------------------------------------------------------------------ docs/COPY.md strings (verbatim)
export const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function timeLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3600_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}

/** COPY §6 age format: "just now" (<5 min), "{n} min ago", "1 h 10 min ago". */
export function ageText(iso: string, now = new Date()): string {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (m < 5) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

export const FOR_LABEL: Record<Profile, string> = {
  general: "For you",
  kids: "For kids",
  elderly: "For older adults",
  pregnant: "For pregnancy",
  heart_lung: "For asthma, COPD & heart",
  exercising: "For your workout",
  outdoor_worker: "For outdoor work", // COPY §17
};

// COPY §2: [long, short]
export const VERDICTS: Record<Band, Record<Profile, [string, string]>> = {
  normal: {
    general: ["Fine to be out.", "Fine to be out"],
    kids: ["Fine for outdoor play.", "Fine for outdoor play"],
    elderly: ["Fine to be out.", "Fine to be out"],
    pregnant: ["Fine to be out.", "Fine to be out"],
    heart_lung: ["Fine to be out.", "Fine to be out"],
    exercising: ["Fine to exercise outside.", "Fine to exercise outside"],
    outdoor_worker: ["Fine to be out.", "Fine to be out"],
  },
  elevated: {
    general: ["OK to be out. Go easy on hard exercise.", "Go easy outdoors"],
    kids: ["Calm play outside is OK. Skip running games for now.", "Calm play only"],
    elderly: ["A gentle walk is OK. Skip hard exercise for now.", "Gentle activity only"],
    pregnant: ["Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only"],
    heart_lung: ["Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only"],
    exercising: ["Keep your workout light, or move it indoors.", "Light workout or go indoors"],
    outdoor_worker: ["OK to work outside. Take breaks indoors if you can.", "Take breaks indoors"],
  },
  high: {
    general: ["Short trips out are OK. Exercise indoors.", "No outdoor exercise"],
    kids: ["Indoor play for now. Keep trips out short.", "Indoor play for now"],
    elderly: ["Stay indoors for now if you can.", "Stay indoors for now"],
    pregnant: ["Stay indoors for now if you can.", "Stay indoors for now"],
    heart_lung: ["Stay indoors for now if you can.", "Stay indoors for now"],
    exercising: ["Move your workout indoors.", "Work out indoors"],
    outdoor_worker: ["Take regular breaks indoors. Ask about lighter outdoor tasks.", "Take regular indoor breaks"],
  },
  very_high: {
    general: ["Stay indoors for now. Go out only if you need to.", "Stay indoors for now"],
    kids: ["Keep kids indoors for now.", "Kids indoors for now"],
    elderly: ["Stay indoors for now.", "Stay indoors for now"],
    pregnant: ["Stay indoors for now.", "Stay indoors for now"],
    heart_lung: ["Stay indoors for now.", "Stay indoors for now"],
    exercising: ["Skip outdoor exercise for now.", "No outdoor exercise"],
    outdoor_worker: ["Limit time outside for now. Ask about indoor work.", "Limit time outside"],
  },
};
export const verdictLong = (b: Band, p: Profile = "general"): string => VERDICTS[b][p][0];
export const verdictShort = (b: Band, p: Profile = "general"): string => VERDICTS[b][p][1];

/** COPY §3 harm anchor, shown under the big number. */
export const ANCHOR: Record<Band, string> = {
  normal: "Normal is up to 55.",
  elevated: "Elevated band (56–150). High starts at 151.",
  high: "High band (151–250). Very High starts at 251.",
  very_high: "Very High band (251 and above).",
};

/** COPY §4 trend phrase + accessibility trend word. */
export function trendPhrase(history: { pm25: number }[]): { words: string; word: string } {
  const n = history.length;
  if (n < 2) return { words: "Trend not available yet", word: "" };
  const d1 = history[n - 1].pm25 - history[n - 2].pm25;
  const d2 = n >= 3 ? history[n - 1].pm25 - history[n - 3].pm25 : d1;
  const word = d1 >= 20 ? "rising fast" : d1 >= 5 ? "rising" : d1 <= -20 ? "clearing fast" : d1 <= -5 ? "easing" : "steady";
  if (Math.sign(d2) === Math.sign(d1) && Math.abs(d2) > Math.abs(d1) && Math.abs(d2) >= 20) {
    return { words: d2 > 0 ? `Rising fast: up ${d2} in 2 hours` : `Clearing fast: down ${-d2} in 2 hours`, word };
  }
  if (d1 >= 20) return { words: `Rising fast: up ${d1} in the last hour`, word };
  if (d1 >= 5) return { words: `Rising: up ${d1} in the last hour`, word };
  if (d1 <= -20) return { words: `Clearing fast: down ${-d1} in the last hour`, word };
  if (d1 <= -5) return { words: `Easing: down ${-d1} in the last hour`, word };
  return { words: "Steady over the last hour", word };
}

/** COPY §2 second line (at most one), or null. */
export function secondLine(s: Snapshot): string | null {
  if (s.stale) return `Reading is from ${timeLabel(s.observedAt)}. It may not match the air now.`;
  const h = s.history;
  const d = s.trend.delta;
  const elevatedPlus = s.band !== "normal";
  if (d >= 20 && elevatedPlus) return "Getting worse. Check again in an hour.";
  if (d >= 20) return "Rising quickly. Check again in an hour.";
  if (d <= -20 && elevatedPlus) return "Getting better. Check again in an hour.";
  const n = h.length;
  if (elevatedPlus && n >= 3 && h[n - 1].pm25 < h[n - 2].pm25 && h[n - 2].pm25 < h[n - 3].pm25) {
    let i = n - 3;
    while (i > 0 && h[i - 1].pm25 > h[i].pm25) i--;
    return `Easing since ${timeLabel(h[i].time)}.`;
  }
  return null;
}

const SENSITIVE: Profile[] = ["kids", "elderly", "pregnant", "heart_lung"];

/** COPY §5: pick by band, then filter by profile; 1–3, most useful first. Masks never lead. */
export function actionsFor(s: Pick<Snapshot, "band" | "history">, p: Profile = "general"): string[] {
  const sensitive = SENSITIVE.includes(p);
  if (s.band === "normal") {
    const recent = s.history.slice(-4, -1);
    return recent.some((h) => h.pm25 > 55) ? ["Air's cleared. Good time to open the windows."] : ["Enjoy the fresh air."];
  }
  if (p === "outdoor_worker") {
    // COPY §17 (Elevated+), then the existing High/Very High lines; masks never lead.
    const w = ["Take breaks in the shade or indoors, and drink water.", "Ask your supervisor about indoor breaks and lighter tasks."];
    if (s.band === "elevated") return w;
    if (s.band === "high") return [...w, "Out for hours? An N95 mask helps. Not needed for short trips."];
    return [...w, "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995."];
  }
  if (s.band === "elevated") {
    const out: string[] = [];
    if (p === "heart_lung") out.push("Asthma or COPD? Keep your inhaler with you.");
    if (p === "exercising") out.push("Shorten or slow your run, or move it indoors.");
    if (p === "kids") out.push("Swap running games for calm play for now.");
    if (sensitive) out.push("At home? Close the windows. Use a fan or aircon to keep cool.");
    if (p === "general") out.push("Haze isn't always easy to see. Check here before a long run.");
    return out.slice(0, 3);
  }
  const high: string[] = ["Close windows. Use aircon or a fan to keep cool.", "Run a purifier in the room you're in, if you have one."];
  if (p === "exercising" || p === "general") high.push("Move exercise indoors, or try later.");
  if (p === "heart_lung") high.push("Keep your inhaler or medicine close. Follow your doctor's plan.");
  if (p === "kids") high.push("Plan indoor play. Keep trips out short.");
  if (p === "kids") high.push("N95 masks aren't made for children. Keeping kids indoors works better.");
  else if (p === "pregnant") high.push("Pregnant? Wear an N95 only for short periods, and take it off if it feels hard to breathe.");
  else if (p === "heart_lung") high.push("Heart or lung condition? Ask your doctor before using an N95.");
  else high.push("Out for hours? An N95 mask helps. Not needed for short trips.");
  if (s.band === "high") return high.slice(0, 3);
  // Very High: all High actions plus two more; keep the 995 line within the top 3.
  return [high[0], "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995.", "Check on older family and neighbours."];
}

/** COPY §6 provenance line (with the always-on age suffix). */
export function provenance(s: Snapshot, now = new Date()): string {
  const obs = timeLabel(s.observedAt);
  const age = ` · ${ageText(s.observedAt, now)}`;
  const R = title(s.nearestRegion);
  if (s.locationMode === "gps") {
    const km = (s.nearestKm ?? 0).toFixed(1);
    if (!s.blended) return `NEA ${R} station · ${km} km away · measured ${obs}${age}`;
    return `Estimated for your spot from NEA stations · nearest: ${R}, ${km} km · measured ${obs}${age}`;
  }
  if (s.locationMode === "island") {
    if (s.fellBack && s.nearestRegion !== "island") return `${R} station is offline. Showing the average of NEA's other stations.${age}`;
    return `Average of NEA stations islandwide · measured ${obs}${age}`;
  }
  return `NEA ${R} station · measured ${obs}${age}`;
}

/** COPY §6 uncertainty: "~" prefix when blended; range line when far or stations disagree. */
export const displayNumber = (s: Snapshot): string => `${s.blended ? "~" : ""}${s.pm25}`;
export function uncertaintyLine(s: Snapshot): string | null {
  if (s.locationMode !== "gps" || !s.nearby) return null;
  const [lo, hi] = s.nearby;
  return (s.nearestKm ?? 0) > 5 || hi - lo > 30 ? `Nearby stations read ${lo}–${hi}.` : null;
}

/** COPY §6 official figure. */
export function officialLine(s: Snapshot): string {
  return s.officialPsi24h == null
    ? "NEA 24-hr PSI: not available right now"
    : `NEA 24-hr PSI: ${s.officialPsi24h} (${psiDescriptor(s.officialPsi24h)})`;
}
export const OFFICIAL_CAPTION = "24-hour average";
export const WHY_SHORT = "Both are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour.";
export const WHY_LONG =
  "NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now.";
export const FORECAST_TIP = "Planning for tomorrow? Use NEA's 24-hr PSI forecast. Schools and events plan with it.";
export const FOOTER = "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account";
export const PRIVACY = "Your location stays on your device. We never send it anywhere.";

/** COPY §8 chart as text: same-scale sparklines, both µg/m³. */
export const CHART_TITLE = "Last 24 hours";
export const CHART_CAPTION = "The line moves slowly because it averages a whole day. The bars show each hour.";
const SPARK = "▁▂▃▄▅▆▇█";
export function sparkPair(s: Snapshot, n = 24): { hourly: string; daily: string } {
  const h = s.history.slice(-n);
  const all = [...h.map((x) => x.pm25), ...h.map((x) => x.pm25_24h ?? 0)];
  const max = Math.max(1, ...all);
  const g = (v: number | null) => (v == null ? " " : SPARK[Math.min(7, Math.floor((v / max) * 7.999))]);
  return { hourly: h.map((x) => g(x.pm25)).join(""), daily: h.map((x) => g(x.pm25_24h)).join("") };
}

/** COPY §14 regions list. */
export const REGIONS_HEADING = "Across Singapore";
export function regionRow(s: Snapshot, k: string): string {
  const v = s.regions[k]?.pm25;
  if (v == null) return `${title(k)} · offline`;
  const mine = s.locationMode === "region" && s.nearestRegion === k ? " (your area)" : s.locationMode === "gps" && s.nearestRegion === k ? " (nearest)" : "";
  return `${title(k)} · ${v} · ${BANDS[bandOf(v)].label}${mine}`;
}

/** COPY §15 share text (no verdict). */
export function shareText(s: Snapshot, shareUrl = "https://hazenow.app"): string {
  const w = trendPhrase(s.history).word || "steady";
  return `Air near me right now: ${BANDS[s.band].label} (PM2.5 ${s.pm25}), ${w}. NEA 24-hr PSI: ${s.officialPsi24h ?? "not available"}. Data: NEA via data.gov.sg. ${shareUrl}`;
}

/** COPY §2/§16 accessibility. */
export function a11y(s: Snapshot, p: Profile = "general"): string {
  const w = trendPhrase(s.history).word;
  return `${verdictLong(s.band, p)} ${FOR_LABEL[p]}. PM2.5 ${s.pm25}, ${BANDS[s.band].label}${w ? `, ${w}` : ""}.`;
}

// ------------------------------------------------------------------ COPY §11 notifications
export const areaOf = (mode: "gps" | "region" | "island", region?: string): string =>
  mode === "gps" ? "near you" : mode === "island" || !region || region === "island" ? "across Singapore" : `in the ${title(region)}`;

export function notifyRise(band: Band, area: string, pm25: number, p: Profile = "general"): { title: string; body: string } {
  const v = verdictLong(band, p);
  if (band === "elevated") return { title: `Haze rising ${area}`, body: `Now Elevated (PM2.5 ${pm25}). ${v}` };
  if (band === "high") return { title: `Haze now High ${area}`, body: `PM2.5 ${pm25}. ${v} Close windows and keep cool with aircon or a fan.` };
  return { title: `Haze now Very High ${area}`, body: `PM2.5 ${pm25}. ${v} Check on older family.` };
}
export function notifyEase(band: Band, area: string, pm25: number, p: Profile = "general"): { title: string; body: string } {
  return { title: `Haze easing ${area}`, body: `Down to ${BANDS[band].label} (PM2.5 ${pm25}). ${verdictLong(band, p)}` };
}
export function notifyClear(area: string, pm25: number, p: Profile = "general"): { title: string; body: string } {
  const body =
    p === "kids"
      ? `Air's back to Normal (PM2.5 ${pm25}). Fine for outdoor play again.`
      : p === "exercising"
        ? `Air's back to Normal (PM2.5 ${pm25}). Fine for your run.`
        : `Air's back to Normal (PM2.5 ${pm25}). Fine to be out. Good time to open the windows.`;
  return { title: `All clear ${area}`, body };
}
export function notifyMorning(peak: Band, s: Snapshot, p: Profile = "general"): { title: string; body: string } {
  const w = trendPhrase(s.history).word || "steady";
  return {
    title: "Overnight air update",
    body: `The haze reached ${BANDS[peak].label} overnight. Now: ${BANDS[s.band].label}, PM2.5 ${s.pm25}, ${w}. ${verdictLong(s.band, p)}`,
  };
}
