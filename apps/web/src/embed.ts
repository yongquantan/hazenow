/**
 * Links and words for the embed and share links, as pure functions so they can be tested without a browser.
 */
import { formatSgtTime, nearestArea, STALE_HEADLINE, verdict, type LatLon, type Snapshot } from "hazenow";
import type { Place } from "./start";

/**
 * The query that reopens the same place the visitor sees: ?area=, ?region= or ?region=island (the island average).
 * A GPS point is shared as its nearest planning area, never as coordinates. Another country uses ?country=&area=.
 */
export function placeQuery(w: Place, areaNear: (pt: LatLon) => string = (pt) => nearestArea(pt).name): string {
  switch (w.kind) {
    case "area":
      return `area=${encodeURIComponent(w.name)}`;
    case "gps":
      return `area=${encodeURIComponent(areaNear(w.point))}`;
    case "region":
      return `region=${w.region}`;
    case "island":
      return "region=island";
    case "city":
      return `country=${w.country.toLowerCase()}${w.id ? `&area=${encodeURIComponent(w.id)}` : ""}`;
  }
}

export interface EmbedWords {
  /** The big line. Stale (COPY §19): "Latest NEA reading is delayed." instead of guidance for an hour that's gone. */
  headline: string;
  /** The footer's time: "4pm · NEA", or "reading from 3pm" when stale (the headline already names NEA). */
  when: string;
  /** For the link's aria-label: COPY §10's stale second line, or null. */
  staleLine: string | null;
}

/** What the Singapore embed card says (general profile). */
export function embedWords(s: Pick<Snapshot, "band" | "trend" | "stale" | "observedAt">): EmbedWords {
  const time = formatSgtTime(s.observedAt);
  if (s.stale) {
    const v = verdict(s.band, ["general"], s.trend, { stale: true, observedAt: s.observedAt });
    return { headline: STALE_HEADLINE, when: `reading from ${time}`, staleLine: v.secondLine };
  }
  return { headline: verdict(s.band, ["general"], s.trend).short, when: `${time} · NEA`, staleLine: null };
}
