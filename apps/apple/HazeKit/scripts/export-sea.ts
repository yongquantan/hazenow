/**
 * Exports the SPEC v2.0/v2.1 reference tables (packages/core/src/countries) for the Swift port, and golden
 * outputs the Swift tests compare against. Run from apps/apple/HazeKit:
 *
 *   bun scripts/export-sea.ts
 *
 * Writes:
 *   Sources/HazeKit/Resources/Data/sea-data.json      scales, registry, places, borders, verdict tables (1:1 data)
 *   Tests/HazeKitTests/Fixtures/sea/preview/*.json    the recorded ObservationSets (packages/core/fixtures/sea/preview)
 *   Tests/HazeKitTests/Fixtures/sea/th-*.json         Air4Thai raw responses (adapter + fallback tests)
 *   Tests/HazeKitTests/Fixtures/sea/golden-*.json     TS outputs for every preview place × profile, guesses, search
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as sea from "../../../../packages/core/src/countries/index";

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..");
const CORE = join(ROOT, "../../../packages/core");
const DATA = join(ROOT, "Sources/HazeKit/Resources/Data");
const FX = join(ROOT, "Tests/HazeKitTests/Fixtures/sea");
mkdirSync(join(FX, "preview"), { recursive: true });

// Infinity has no JSON form: write null and read it back as .infinity.
const json = (x: unknown) => JSON.stringify(x, (_, v) => (v === Infinity ? null : v));

/* ------------------------------------------------------------------ data */

const cityRow = (c: sea.CityPlace) => ({ ...c, destination: sea.DESTINATIONS.includes(c) });
const data = {
  generatedFrom: "packages/core/src/countries (bun apps/apple/HazeKit/scripts/export-sea.ts)",
  scales: sea.SCALES,
  chipScale: sea.CHIP_SCALE,
  countries: sea.COUNTRIES,
  pickerCountries: sea.PICKER_COUNTRIES,
  places: sea.PLACES.map(cityRow),
  borders: (await import("../../../../packages/core/src/countries/borders-data")).BORDERS,
  smallIslands: sea.SMALL_ISLANDS,
  thaiVerdicts: sea.THAI_VERDICTS,
  categoryVerdicts: sea.CATEGORY_VERDICTS,
  categorySeverity: sea.CATEGORY_SEVERITY,
  unhealthyFrom: sea.UNHEALTHY_FROM,
  whoVerdictBands: sea.WHO_VERDICT_BANDS,
  emergencyNumber: sea.EMERGENCY_NUMBER,
};
writeFileSync(join(DATA, "sea-data.json"), json(data));

/* ------------------------------------------------------------------ fixtures */

for (const cc of ["th", "my", "id", "vn", "ph", "la", "kh"]) {
  copyFileSync(join(CORE, `fixtures/sea/preview/${cc}.json`), join(FX, `preview/${cc}.json`));
}
copyFileSync(join(CORE, "fixtures/sea/th-air4thai-aqi-2026-09-28T17ICT.json"), join(FX, "th-aqi.json"));
copyFileSync(join(CORE, "fixtures/sea/th-air4thai-history-2026-09-28T17ICT.json"), join(FX, "th-history.json"));

/* ------------------------------------------------------------------ golden: every preview place × profile */

const NOW = Date.parse(sea.PREVIEW_CAPTURED_AT);
const PROFILES = [["general"], ["kids"], ["elderly"], ["exercising"], ["outdoor_worker"], ["kids", "elderly"], ["heart_lung", "exercising"]] as const;
const places: unknown[] = [];
for (const cc of ["th", "my", "id", "vn", "ph", "la", "kh"]) {
  const set: sea.ObservationSet = JSON.parse(readFileSync(join(CORE, `fixtures/sea/preview/${cc}.json`), "utf8"));
  // Also the "official source down" variant: only the community sensors, flagged.
  const down: sea.ObservationSet = { ...set, observations: set.observations.filter((o) => o.grade === "lowcost"), officialUnavailable: "Official source" };
  for (const [variant, s0] of [["live", set], ["down", down]] as const) {
    for (const p of sea.PLACES.filter((x) => x.country === cc.toUpperCase() && sea.cityMode(x, true) === "live")) {
      const q = sea.placeQuery(p);
      let s: sea.CountrySnapshot;
      try {
        s = sea.buildCountrySnapshot(s0, q, NOW);
      } catch (e) {
        places.push({ id: p.id, country: p.country, variant, error: (e as Error).name });
        continue;
      }
      const d = sea.countryDisplay(s, { placeName: p.name, lon: p.lon });
      places.push({
        id: p.id,
        country: p.country,
        variant,
        snapshot: {
          pm25: s.pm25,
          band: s.band,
          level: s.level,
          localBandKey: s.localBand?.key ?? null,
          bandBasis: s.bandBasis,
          bandFromEstimate: !!s.bandFromEstimate,
          pm25Kind: s.pm25Kind,
          officialValue: s.official?.value ?? null,
          pm25_24h: s.pm25_24h,
          range: s.range,
          whoMultiple: s.whoMultiple,
          notes: s.notes,
          observedAt: s.observedAt,
          stale: s.stale,
          nearest: s.nearest?.stationId ?? null,
          stations: s.stations.map((x) => x.stationId),
          history: s.history.map((h) => [h.time, h.pm25, h.pm25Avg24h ?? null]),
          trend: s.trend,
          attribution: s.attribution.map((a) => a.id),
        },
        display: {
          numberSub: d.numberSub,
          kindLabel: d.kindLabel,
          provenance: d.provenance,
          chip: d.chip,
          official: d.official?.text ?? null,
          officialExplainer: d.officialExplainer,
          noNumber: d.noNumber,
          whoLine: d.whoLine,
          sensorLine: d.sensorLine,
          notices: d.notices,
        },
        adviceBand: sea.adviceBand(s),
        verdicts: PROFILES.map((pr) => {
          const v = sea.countryVerdict(s, pr as never);
          return {
            profiles: pr,
            headline: v.headline,
            short: v.short,
            secondLine: v.secondLine,
            headlineLocal: v.headlineLocal,
            estimate: !!v.estimate,
            whoBased: !!v.whoBased,
            hedged: !!v.hedged,
            actions: sea.countryActions(s, pr as never),
          };
        }),
      });
    }
  }
}
writeFileSync(join(FX, "golden-places.json"), JSON.stringify({ now: sea.PREVIEW_CAPTURED_AT, places }, null, 1));

/* ------------------------------------------------------------------ golden: country guess (SPEC v2.1) */

const zones = [...Object.keys(sea.SEA_TIME_ZONES), "Europe/London", "America/New_York", "Asia/Tokyo", "Asia/Hong_Kong", "UTC", "Etc/GMT-7", "", null];
const langs: string[][] = [[], ["en-US"], ["en-US", "en"], ["th-TH"], ["th"], ["vi-VN", "en"], ["vi"], ["lo"], ["km-KH"], ["en-VN"], ["zh-SG"], ["zh-Hans-SG"], ["ms-MY"], ["ms-BN"], ["en-MY"], ["id-ID"], ["in"], ["fil"], ["my"], ["tet"], ["de-DE", "ja"], ["de", "vi", "th"]];
const servers = [undefined, "VN", "SG", "GB", "XX", "t1"];
const guesses: unknown[] = [];
for (const tz of zones) for (const l of langs) for (const sv of servers) {
  const r = sea.guessCountry({ timeZone: tz, languages: l, serverCountry: sv });
  const st = sea.startPlace(r);
  // Compact rows: [tz, languages, server, country, confidence, reason, place, placeFromZone, start place, notCoveredFrom, outside, fromZone]
  guesses.push([tz, l, sv ?? null, r.country, r.confidence, r.reason, r.place, r.placeFromZone, `${st.place.country}:${st.place.id}`, st.notCoveredFrom, st.outside, st.fromZone]);
}
writeFileSync(join(FX, "golden-guess.json"), JSON.stringify(guesses));

/* ------------------------------------------------------------------ golden: place search */

const queries = ["Bali", "bali", "KL", "Saigon", "Penang", "Seminyak", "koh samui", "Ko Samui", "Kuta", "gili", "Phuket", "chiang", "Johor", "Angkor", "manila", "Da Nang", "hua hin", "Pai", "xyz", "", "ub"];
writeFileSync(
  join(FX, "golden-search.json"),
  JSON.stringify({
    search: queries.map((q) => ({ q, ids: sea.searchPlaces(q).map((m) => `${m.place.country}:${m.place.id}:${m.matched ?? ""}`) })),
    find: ["bangkok", "Bangkok", "KL", "saigon", "Bali", "george-town", "kanchanaburi", "nope"].map((q) => ({ q, id: sea.findCity(q)?.id ?? null })),
    groups: sea.PICKER_COUNTRIES.map((cc) => ({ cc, popular: sea.placeGroups(cc).popular.map((c) => c.id), others: sea.placeGroups(cc).others.map((c) => c.id) })),
    borders: [[1.436, 103.786], [1.4655, 103.7578], [1.13, 104.05], [17.88, 102.74], [17.97, 102.63], [20.45, 99.88], [5, 90], [7.74, 98.77], [13.7563, 100.5018], [1.3526, 103.9447]].map(([lat, lon]) => ({ lat, lon, cc: sea.countryAt(lat, lon) })),
  }),
);

console.log(`sea-data.json, ${places.length} golden places, ${guesses.length} guesses`);
