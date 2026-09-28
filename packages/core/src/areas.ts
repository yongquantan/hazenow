/**
 * Offline area search (SPEC v1.4): the 55 URA planning areas with representative points,
 * plus common estate names as aliases. Typing an area never touches the network.
 */
import { SG_AREAS } from "./areas-data.js";

export interface Area {
  name: string;
  aliases: string[];
  lat: number;
  lon: number;
}

export interface AreaMatch extends Area {
  /** The alias that matched, when the match wasn't on the area name itself. */
  matched: string | null;
}

export { SG_AREAS };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function score(q: string, candidate: string): number {
  const c = norm(candidate);
  if (!q || !c) return Infinity;
  if (c === q) return 0;
  if (c.startsWith(q)) return 1;
  if (c.split(" ").some((w) => w.startsWith(q))) return 2;
  if (c.replace(/ /g, "").startsWith(q.replace(/ /g, ""))) return 2.5; // "angmo" → "Ang Mo Kio"
  if (c.includes(q)) return 3;
  return Infinity;
}

/**
 * Search planning areas and estate aliases. Empty query → every area A–Z.
 * Ranking: exact > prefix > word prefix > substring; area names beat aliases on ties.
 */
export function searchAreas(query: string, limit = 8, areas: readonly Area[] = SG_AREAS): AreaMatch[] {
  const q = norm(query);
  if (!q) return areas.map((a) => ({ ...a, matched: null }));
  const hits: { a: Area; s: number; matched: string | null }[] = [];
  for (const a of areas) {
    let best = score(q, a.name);
    let matched: string | null = null;
    for (const al of a.aliases) {
      const s = score(q, al) + 0.1;
      if (s < best) {
        best = s;
        matched = al;
      }
    }
    if (best < Infinity) hits.push({ a, s: best, matched });
  }
  hits.sort((x, y) => x.s - y.s || x.a.name.localeCompare(y.a.name));
  return hits.slice(0, limit).map((h) => ({ ...h.a, matched: h.matched }));
}

/** Exact lookup by area name or alias (case-insensitive). */
export function findArea(name: string, areas: readonly Area[] = SG_AREAS): Area | null {
  const q = norm(name);
  return areas.find((a) => norm(a.name) === q || a.aliases.some((al) => norm(al) === q)) ?? null;
}

/** Round a coordinate to 2 decimals (~1 km) before storing it (SPEC v1.4 §5). */
export function roundCoord(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Nearest planning area to a point (by its representative point), for naming a GPS spot on share cards. */
export function nearestArea(point: { lat: number; lon: number }, areas: readonly Area[] = SG_AREAS): Area {
  let best = areas[0];
  let bestD = Infinity;
  for (const a of areas) {
    const d = (a.lat - point.lat) ** 2 + ((a.lon - point.lon) * Math.cos((point.lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
