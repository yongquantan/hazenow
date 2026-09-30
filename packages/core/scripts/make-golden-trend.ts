/**
 * Generates fixtures/golden/trend.json from the TS reference trend logic (COPY §4).
 * Every platform (TS, Kotlin, Swift) reads this same file in its tests, so the trend phrase can't drift.
 * Run: bun scripts/make-golden-trend.ts
 */
import { writeFileSync } from "node:fs";
import { trendWord, trendWords } from "../src/experience.ts";
import type { HistoryPoint } from "../src/types.ts";

const DAY = "2026-09-30";
/** Hourly points ending at 16:00 SGT; `null` leaves that hour out (a gap). */
function hours(values: (number | null)[], endHour = 16): HistoryPoint[] {
  const n = values.length;
  return values.flatMap((v, i) => {
    if (v === null) return [];
    const h = endHour - (n - 1 - i);
    return [{ time: `${DAY}T${String(h).padStart(2, "0")}:00:00+08:00`, pm25: v } as HistoryPoint];
  });
}

const cases: { name: string; history: HistoryPoint[] }[] = [
  { name: "tampines-2026-09-30-4pm (live: down 8 in 1 h, down 10 in 2 h)", history: hours([56, 49, 47, 39]) },
  { name: "single point", history: hours([100]) },
  { name: "empty", history: [] },
  { name: "steady +2", history: hours([100, 102]) },
  { name: "steady 0", history: hours([90, 90, 90]) },
  { name: "steady +4 boundary", history: hours([100, 104]) },
  { name: "steady -4 boundary", history: hours([104, 100]) },
  { name: "rising +5 boundary", history: hours([100, 105]) },
  { name: "rising +19", history: hours([100, 119]) },
  { name: "rising fast +20 boundary", history: hours([100, 120]) },
  { name: "rising fast +30 1h", history: hours([100, 130]) },
  { name: "easing -5 boundary", history: hours([105, 100]) },
  { name: "easing -19", history: hours([119, 100]) },
  { name: "clearing fast -20 boundary", history: hours([120, 100]) },
  { name: "clearing fast -30 1h", history: hours([130, 100]) },
  { name: "rising 2h bigger (rising fast in 2 hours)", history: hours([79, 103, 117]) },
  { name: "steady 1h (+4) even though 2h is +10", history: hours([90, 96, 100]) },
  { name: "rising 2h bigger (rising in 2 hours)", history: hours([90, 96, 102]) },
  { name: "easing 2h bigger", history: hours([120, 112, 105]) },
  { name: "clearing fast 2h", history: hours([150, 130, 118]) },
  { name: "back to 2h-ago level (d2 = 0) -> last hour", history: hours([100, 110, 100]) },
  { name: "2h same magnitude as 1h -> last hour", history: hours([100, 100, 90]) },
  { name: "sign flip (down 1h, up 2h) -> last hour", history: hours([80, 110, 100]) },
  { name: "2h smaller than 1h -> last hour", history: hours([95, 90, 100]) },
  { name: "steady 1h even though 2h is big", history: hours([60, 98, 100]) },
  { name: "gap: previous hour missing", history: hours([100, null, 120]) },
  { name: "gap: 2 hours ago missing -> last hour only", history: hours([50, null, 100, 110]) },
  { name: "long history, latest easing", history: hours([30, 40, 60, 90, 120, 140, 130, 122]) },
];

const out = cases.map((c) => ({
  name: c.name,
  history: c.history,
  expected: { words: trendWords(c.history), word: c.history.length ? trendWord(c.history) : null },
}));
writeFileSync(new URL("../fixtures/golden/trend.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} cases`);
