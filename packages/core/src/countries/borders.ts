/**
 * Which jurisdiction is a point in? Point-in-polygon over simplified Natural Earth land polygons
 * (borders-data.ts), then a coastal snap: a point in the sea within SNAP_DEG of a coastline gets that country
 * (REGIONAL.md used the same rule, 0.08°). Pure, no I/O.
 *
 * Known limitation (verified against the live station lists 2026-09-28): points within ~1 km of a land
 * border on the Mekong (e.g. Tonpheung, Laos vs Chiang Saen, Thailand) can land on the wrong side. Official
 * stations never use this: their country is the adapter's jurisdiction.
 */
import { BORDERS } from "./borders-data.js";
import type { CountryCode } from "./types.js";

export const SNAP_DEG = 0.1;

interface Ring {
  cc: CountryCode;
  pts: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

let RINGS: Ring[] | null = null;
function rings(): Ring[] {
  if (RINGS) return RINGS;
  RINGS = [];
  for (const [cc, list] of Object.entries(BORDERS) as [CountryCode, number[][]][]) {
    for (const pts of list) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      RINGS.push({ cc, pts, minX, minY, maxX, maxY });
    }
  }
  return RINGS;
}

function inside(x: number, y: number, p: number[]): boolean {
  let c = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Small islands the simplified land polygons leave out and that sit beyond the coastal snap, as [cc, lat, lon, radius°].
 * Only islands well inside one country's waters (verified on a map), so this can't move a point across a border.
 */
export const SMALL_ISLANDS: readonly [CountryCode, number, number, number][] = [
  ["TH", 7.74, 98.77, 0.06], // Ko Phi Phi (Krabi)
  ["TH", 10.09, 99.835, 0.05], // Ko Tao (Surat Thani)
];

/** Country code for a point, or null if it is outside ASEAN + Timor-Leste (and not within the coastal snap). */
export function countryAt(lat: number, lon: number): CountryCode | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rs = rings();
  for (const r of rs) {
    if (lon < r.minX || lon > r.maxX || lat < r.minY || lat > r.maxY) continue;
    if (inside(lon, lat, r.pts)) return r.cc;
  }
  for (const [cc, y, x, rad] of SMALL_ISLANDS) if (Math.hypot(lat - y, lon - x) <= rad) return cc;
  let best = SNAP_DEG;
  let bestCc: CountryCode | null = null;
  for (const r of rs) {
    if (lon < r.minX - SNAP_DEG || lon > r.maxX + SNAP_DEG || lat < r.minY - SNAP_DEG || lat > r.maxY + SNAP_DEG) continue;
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const d = segDist(lon, lat, p[i], p[i + 1], p[i + 2], p[i + 3]);
      if (d < best) {
        best = d;
        bestCc = r.cc;
      }
    }
  }
  return bestCc;
}
