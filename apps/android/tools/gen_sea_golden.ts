/**
 * Cross-language golden vectors for the Kotlin port of packages/core/src/countries (SPEC v2.0/v2.1).
 * Builds every catalogue place from the recorded preview sets exactly as the TS reference does, and records the
 * snapshot fields, verdicts per profile and display strings; plus guessCountry()/startPlace() over a grid of
 * device signals. The Kotlin tests (SeaGoldenTest) must reproduce every value.
 *
 *   cd apps/android && bun tools/gen_sea_golden.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { sea } from "../../../packages/core/src/index";

const FX = new URL("../../../packages/core/fixtures/sea/preview/", import.meta.url).pathname;
const NOW = Date.parse(sea.PREVIEW_CAPTURED_AT);
const PROFILES = [["general"], ["kids"], ["elderly"], ["exercising"], ["outdoor_worker"], ["kids", "elderly"], ["heart_lung", "exercising"]] as const;

const places: unknown[] = [];
for (const cc of ["th", "my", "id", "vn", "ph", "la", "kh"]) {
  const set = JSON.parse(readFileSync(FX + `${cc}.json`, "utf8"));
  for (const p of sea.PLACES.filter((x) => x.country === cc.toUpperCase())) {
    const q = sea.placeQuery(p);
    try {
      const s = sea.buildCountrySnapshot(set, q, NOW);
      const d = sea.countryDisplay(s, { placeName: p.name, viewerOffsetHours: 8, lon: p.lon });
      places.push({
        country: p.country, id: p.id, name: p.name,
        pm25: s.pm25, band: s.band, level: s.level, pm25Kind: s.pm25Kind, bandBasis: s.bandBasis, bandFromEstimate: !!s.bandFromEstimate,
        localBand: s.localBand?.key ?? null, observedAt: s.observedAt, stale: s.stale, range: s.range, whoMultiple: s.whoMultiple,
        trendDelta: s.trend.delta, historyLen: s.history.length, historyLast: s.history.at(-1) ?? null, nearest: s.nearest?.stationId ?? null,
        stations: s.stations.map((x) => x.stationId), official: s.official ? `${s.official.agency} ${s.official.value}` : null,
        pm25_24h: s.pm25_24h, notes: s.notes, attribution: s.attribution.map((a) => a.id),
        verdicts: PROFILES.map((pr) => {
          const v = sea.countryVerdict(s, [...pr]);
          return { profile: pr, headline: v.headline, short: v.short, secondLine: v.secondLine, forWhom: v.forWhom, headlineLocal: v.headlineLocal };
        }),
        actions: sea.countryActions(s, ["general"]),
        actionsKids: sea.countryActions(s, ["kids"]),
        display: {
          numberSub: d.numberSub, kindLabel: d.kindLabel, provenance: d.provenance, official: d.official?.text ?? null,
          explainer: d.officialExplainer, noNumber: d.noNumber, whoLine: d.whoLine, sensorLine: d.sensorLine, notices: d.notices,
          chip: d.chip ? { en: d.chip.en, local: d.chip.local, basisNote: d.chip.basisNote, estimate: d.chip.estimate, color: d.chip.color } : null,
        },
        share: sea.countryShareText(s, p.name, "hazenow.pages.dev", p.lon),
      });
    } catch (e) {
      places.push({ country: p.country, id: p.id, name: p.name, error: (e as Error).name });
    }
  }
}

const zones = [null, "", "UTC", "Etc/GMT-7", "Asia/Singapore", "Singapore", "Asia/Bangkok", "Asia/Kuala_Lumpur", "Asia/Kuching", "Asia/Jakarta",
  "Asia/Pontianak", "Asia/Makassar", "Asia/Ujung_Pandang", "Asia/Jayapura", "Asia/Ho_Chi_Minh", "Asia/Saigon", "Asia/Manila", "Asia/Vientiane",
  "Asia/Phnom_Penh", "Asia/Yangon", "Asia/Rangoon", "Asia/Brunei", "Asia/Dili", "Europe/London", "Asia/Tokyo", "America/New_York"];
const langs = [[], ["en-US"], ["th-TH"], ["vi-VN"], ["en-VN"], ["lo"], ["km-KH"], ["ms-MY"], ["id-ID"], ["in"], ["fil-PH"], ["tl"], ["my"], ["tet"],
  ["zh-Hans-SG"], ["ms-BN"], ["en_GB", "th"], ["de-DE", "vi"]];
const servers = [null, "VN", "US"];
const guesses: unknown[] = [];
for (const tz of zones) for (const l of langs) for (const sv of servers) {
  const g = sea.guessCountry({ timeZone: tz, languages: l, serverCountry: sv });
  const sp = sea.startPlace(g);
  guesses.push({ tz, langs: l, server: sv, country: g.country, confidence: g.confidence, place: g.place, placeFromZone: g.placeFromZone,
    start: sp.place.id, startCountry: sp.place.country, notCoveredFrom: sp.notCoveredFrom, outside: sp.outside, fromZone: sp.fromZone });
}

const searches = ["Bali", "KL", "Saigon", "Penang", "koh samui", "Ko Samui", "chiang", "pai", "Seminyak", "george town", "Angkor", "hoi"].map((q) => ({
  q, hits: sea.searchPlaces(q, 12).map((m) => `${m.place.country}:${m.place.id}:${m.matched ?? ""}`),
}));
const groups = sea.PICKER_COUNTRIES.map((cc) => {
  const g = sea.placeGroups(cc);
  return { cc, popular: g.popular.map((p) => p.id), others: g.others.map((p) => p.id) };
});
const borders = [[1.436, 103.786], [1.4655, 103.7578], [1.13, 104.05], [17.88, 102.74], [17.97, 102.63], [20.45, 99.88], [5, 90], [13.7563, 100.5018],
  [19.3587, 98.44], [7.74, 98.77], [10.09, 99.835], [1.354, 103.944], [-8.6705, 115.2126]].map(([lat, lon]) => ({ lat, lon, cc: sea.countryAt(lat, lon) }));

writeFileSync(new URL("../core/src/test/resources/sea-golden.json", import.meta.url).pathname,
  JSON.stringify({ generatedFrom: "packages/core/src/countries", now: sea.PREVIEW_CAPTURED_AT, places, guesses, searches, groups, borders }) + "\n");
console.log(`places ${places.length}, guesses ${guesses.length}`);
