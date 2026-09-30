/**
 * SPEC v2.0 client model: the city catalogue (docs/sea/COVERAGE.md) and the pure per-country display model
 * (countries/ui.ts), checked against the recorded 2026-09-28 fixtures and the preview sets in fixtures/sea/preview/.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { actions } from "../src/experience";
import {
  AIR4THAI_ATTRIBUTION,
  CATEGORY_SEVERITY,
  CATEGORY_VERDICTS,
  CHIP_SCALE,
  CITIES,
  GROUP_BASIS,
  SCALES,
  THAI_CELL_SEVERITY,
  THAI_VERDICTS,
  UNHEALTHY_FROM,
  adviceBand,
  atOrAboveUnhealthy,
  countryActions,
  severityBand,
  nearbySensorLine,
  toLocalBand,
  PICKER_COUNTRIES,
  PREVIEW_CAPTURED_AT,
  air4thaiObservations,
  buildCountrySnapshot,
  cityMode,
  citiesOf,
  countryDisplay,
  countryNowCard,
  countryPreviewCard,
  countryShareText,
  countryVerdict,
  whoVerdictBand,
  defaultCity,
  findCity,
  isObservationSet,
  locate,
  localOffsetHours,
  notAvailable,
  officialRow,
  parseAir4ThaiHistory,
  parseAir4ThaiStations,
  previewRibbon,
  stationDateTime,
  stationTime,
  toLocalIso,
  zoneLabel,
  type CountryCode,
  type ObservationSet,
} from "../src/countries/index";

const FX = new URL("../fixtures/sea/", import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(FX + f, "utf8"));
const NOW = Date.parse(PREVIEW_CAPTURED_AT);

const thSet = (): ObservationSet => ({
  country: "TH",
  adapters: [],
  fetchedAt: new Date(NOW).toISOString(),
  observations: air4thaiObservations(
    parseAir4ThaiStations(json("th-air4thai-aqi-2026-09-28T17ICT.json")),
    parseAir4ThaiHistory(json("th-air4thai-history-2026-09-28T17ICT.json")),
  ),
  attribution: [AIR4THAI_ATTRIBUTION],
});
const preview = (cc: string): ObservationSet => json(`preview/${cc}.json`);
const snapAt = (cc: CountryCode, city: string) => {
  const c = findCity(city, cc)!;
  const set = cc === "TH" ? thSet() : preview(cc.toLowerCase());
  return { c, s: buildCountrySnapshot(set, { lat: c.lat, lon: c.lon }, NOW) };
};

/* ================================================================== places */

describe("places (COVERAGE.md)", () => {
  test("46 cities, the same status totals as COVERAGE.md", () => {
    expect(CITIES.length).toBe(46);
    const n = (st: string) => CITIES.filter((c) => c.status === st).length;
    expect(n("live_direct")).toBe(10);
    expect(n("needs_proxy")).toBe(27); // + Pangkalan Bun (BMKG), Siem Reap (community sensors)
    expect(n("needs_permission")).toBe(4);
    expect(n("not_feasible")).toBe(5);
  });

  test("every blocked city carries a reason; every covered city doesn't need one", () => {
    for (const c of CITIES) {
      if (c.status === "needs_permission" || c.status === "not_feasible") expect(c.reason?.length).toBeGreaterThan(20);
      else expect(c.reason).toBeUndefined();
    }
  });

  test("slugs are unique per country and match ?area= deep links", () => {
    for (const cc of PICKER_COUNTRIES) {
      const ids = citiesOf(cc).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(0);
    }
    expect(findCity("bangkok", "TH")?.name).toBe("Bangkok");
    expect(findCity("chiang-mai", "TH")?.name).toBe("Chiang Mai");
    expect(findCity("Chiang Mai")?.id).toBe("chiang-mai");
    expect(findCity("chiangmai", "TH")?.id).toBe("chiang-mai");
    expect(findCity("johor-bahru", "MY")?.lat).toBeCloseTo(1.4927, 3);
    expect(findCity("bangkok", "MY")).toBeNull();
    expect(findCity("nowhere")).toBeNull();
  });

  test("each city point is inside its own country (locate never crosses a border)", () => {
    for (const c of CITIES) {
      if (c.country === "SG") continue;
      expect(`${c.name}:${locate(c.lat, c.lon).country}`).toBe(`${c.name}:${c.country}`);
    }
    // Johor Bahru sits 2 km from Woodlands, but is Malaysia.
    expect(locate(1.4927, 103.7414).country).toBe("MY");
    expect(locate(1.436, 103.786).country).toBe("SG");
  });

  test("defaultCity follows the registry", () => {
    expect(defaultCity("TH").name).toBe("Bangkok");
    expect(defaultCity("MY").name).toBe("Kuala Lumpur");
    expect(defaultCity("KH").name).toBe("Siem Reap");
  });

  test("data mode: TH live; proxied countries preview without a proxy, live with one; blocked cities unavailable", () => {
    expect(cityMode(findCity("bangkok")!, false)).toBe("live");
    expect(cityMode(findCity("kuala-lumpur")!, false)).toBe("preview");
    expect(cityMode(findCity("kuala-lumpur")!, true)).toBe("live");
    expect(cityMode(findCity("ho-chi-minh-city")!, true)).toBe("unavailable");
    expect(cityMode(findCity("phnom-penh")!, true)).toBe("unavailable");
    const na = notAvailable(findCity("phnom-penh")!);
    expect(na.headline).toBe("Not available yet");
    expect(na.reason).toContain("Cambodia");
  });

  test("preview sets are valid ObservationSets for their own country", () => {
    for (const cc of ["th", "my", "id", "vn", "ph", "la", "kh"]) {
      const s = preview(cc);
      expect(isObservationSet(s, cc.toUpperCase() as CountryCode)).toBe(true);
      expect(s.warnings?.[0]).toContain("Preview");
    }
  });
});

/* ================================================================== time */

describe("station times", () => {
  test("zones", () => {
    expect(zoneLabel(7, "TH")).toBe("ICT");
    expect(zoneLabel(8, "ID")).toBe("WITA");
    expect(zoneLabel(8, "MY")).toBe("MYT");
    expect(zoneLabel(0, "MY")).toBe("UTC+0");
    expect(localOffsetHours("ID", 104.77)).toBe(7);
    expect(localOffsetHours("ID", 115.2)).toBe(8);
    expect(localOffsetHours("ID", 140.7)).toBe(9);
  });

  test("UTC crowd timestamps are shown in the place's local time", () => {
    expect(toLocalIso("2026-09-28T10:26:00Z", "MY")).toBe("2026-09-28T18:26:00+08:00");
    expect(stationTime("2026-09-28T10:26:00Z", "MY", 8)).toBe("6:26pm");
    expect(stationTime("2026-09-28T10:26:00Z", "ID", 8, 115.2)).toBe("6:26pm");
    expect(stationTime("2026-09-28T10:26:00Z", "LA", 8)).toBe("5:26pm ICT");
    expect(stationTime("2026-09-28T17:00:00+07:00", "TH", 8)).toBe("5pm ICT");
    expect(stationTime("2026-09-28T17:00:00+07:00", "TH", 7)).toBe("5pm");
    expect(stationDateTime("2026-09-28T17:00:00+07:00", "TH")).toBe("Mon 28 Sep, 5pm ICT");
  });
});

/* ================================================================== display model */

describe("countryDisplay", () => {
  test("Bangkok: official 1-hr number, chip from the 24-hr Thai AQI in English with the Thai word beside it", () => {
    const { c, s } = snapAt("TH", "bangkok");
    const d = countryDisplay(s, { placeName: c.name, viewerOffsetHours: 8 });
    expect(s.pm25).toBe(14);
    expect(d.kindLabel).toBe("Official reading");
    expect(d.provenance).toMatch(/^Measured at .+ station · 0\.9 km · 5pm ICT$/);
    expect(d.chip).toMatchObject({ en: "Excellent", local: "ดีมาก", agency: "PCD" });
    expect(d.chip!.basisNote).toBe("PCD category for the 24-hr Thai AQI");
    expect(d.official).toMatchObject({ label: "PCD Thai AQI (24-hr)", value: 19, en: "Excellent", local: "ดีมาก" });
    expect(d.official!.text).toBe("PCD Thai AQI (24-hr): 19 · Excellent");
    expect(d.officialExplainer).toContain("latest hour");
    expect(d.noNumber).toBeNull();
    expect(d.attribution[0].text).toContain("Air4Thai");
  });

  test("Bangkok verdict uses the Thai table (PCD-derived)", () => {
    const { s } = snapAt("TH", "bangkok");
    const v = countryVerdict(s, ["general"]);
    expect(v.headline).toBe("Fine to be out.");
    expect(v.headlineLocal).toBe("ออกไปข้างนอกได้ตามปกติ");
  });

  test("Kuala Lumpur: community-sensor estimate, labelled as such, DOE API chip", () => {
    const { c, s } = snapAt("MY", "kuala-lumpur");
    const d = countryDisplay(s, { placeName: c.name, viewerOffsetHours: 8 });
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(d.kindLabel).toBe("Community sensors · estimate");
    expect(d.numberSub).toBe("PM2.5 · community sensors");
    expect(d.provenance).toMatch(/^Estimate from \d community sensors · not a government reading · range \d+–\d+ · 6:\d\dpm$/);
    expect(d.chip).toMatchObject({ en: "Moderate", local: "Sederhana", agency: "DOE Malaysia" });
    expect(d.official!.text).toMatch(/^DOE Malaysia API \(24-hr\): \d+ · Moderate$/);
  });

  test("Johor Bahru: no official hourly reading, 24-hr index explained in one line, nearest DOE station named", () => {
    const { c, s } = snapAt("MY", "johor-bahru");
    const d = countryDisplay(s, { placeName: c.name, viewerOffsetHours: 8 });
    expect(s.pm25).toBeNull();
    expect(d.noNumber?.title).toBe("No official hourly reading here");
    expect(d.noNumber?.line).toContain("24-hr index");
    expect(d.official?.text).toBe("DOE Malaysia API (24-hr): 97 · Moderate");
    expect(d.kindLabel).toBeNull();
    expect(d.provenance).toMatch(/^Nearest DOE Malaysia station: Larkin, JOHOR · 0\.6 km · 6pm$/);
    // No NEA station is ever used across the causeway.
    expect(s.stations.every((x) => !x.stationId.startsWith("sg"))).toBe(true);
  });

  test("Palembang: BMKG 1-hr with an ISPU chip; the official ISPU row gets its English word", () => {
    const { s } = snapAt("ID", "palembang");
    const d = countryDisplay(s, { placeName: "Palembang", viewerOffsetHours: 8 });
    expect(s.pm25Kind).toBe("official_1h");
    expect(d.chip).toMatchObject({ en: "Unhealthy", local: "Tidak Sehat" });
    expect(d.chip!.basisNote).toBe("ISPU category for this hour's PM2.5");
    expect(d.official).toMatchObject({ en: "Unhealthy", local: "Tidak Sehat" });
    expect(d.official!.text).toMatch(/^KLH ISPU \(24-hr\): 142 · Unhealthy$/);
  });

  test("Vientiane: no national scale → WHO-guide chip (estimate), WHO verdict, WHO line", () => {
    const { s } = snapAt("LA", "vientiane");
    const d = countryDisplay(s, { placeName: "Vientiane", viewerOffsetHours: 8 });
    expect(d.chip?.en).toMatch(/^WHO guide: (low|moderate|high|very high)$/);
    expect(d.chip?.estimate).toBe(true);
    expect(d.official).toBeNull();
    expect(d.whoLine).toMatch(/× the WHO daily guideline\.$/);
    expect(d.numberSub).toBe("There's no official air-quality scale here · community sensors estimate");
    expect(countryVerdict(s).headline).toBe(whoVerdictBand(s.pm25!).en);
  });

  test("officialRow keeps a verbatim word when the scale doesn't know it", () => {
    const r = officialRow({
      official: { scaleId: "nope", name: "X", value: 3, category: "Bagus", averaging: "24h", param: null, agency: "A" },
      localBand: null,
      bandBasis: "pm25_1h",
    });
    expect(r?.text).toBe("A X (24-hr): 3 · Bagus");
  });

  test("preview ribbon names the recorded time, never 'live'", () => {
    const { s } = snapAt("ID", "jakarta");
    expect(previewRibbon(s, 7)).toBe("Preview · recorded data from 28 Sep, 5pm. Live once our server is up.");
    expect(previewRibbon(s, 8)).toBe("Preview · recorded data from 28 Sep, 5pm WIB. Live once our server is up.");
    // Crowd-only KL: still the recorded publication hour, in Malaysian time (not the sensors' minute).
    expect(previewRibbon(snapAt("MY", "kuala-lumpur").s, 8)).toBe("Preview · recorded data from 28 Sep, 6pm. Live once our server is up.");
  });
});

/* ================================================================== share */

describe("country share cards", () => {
  test("Bangkok Now card: place line, English band words, PCD colour and attribution", () => {
    const { s } = snapAt("TH", "bangkok");
    const n = countryNowCard(s, "Bangkok");
    expect(n.hook).toBe("Air near Bangkok · Mon 28 Sep, 5pm ICT");
    expect(n.pm25).toBe(14);
    expect(n.psiLine).toBe("PCD Thai AQI (24-hr): 19 · Excellent. The 24-hr index averages the last 24 hours. The number above is the latest hour.");
    expect(n.psiLine).not.toMatch(/[฀-๿]/); // no Thai glyphs on the card
    expect(n.dotColor).toBe(s.localBand!.color);
    expect(n.dataLine).toContain("Air4Thai");
    expect(n.adviceLabel).toBe("Advice for now, from PCD’s guidance");
    expect(n.headline).toBe("Fine to be out.");
  });

  test("Chiang Mai Now card", () => {
    const { s } = snapAt("TH", "chiang-mai");
    const n = countryNowCard(s, "Chiang Mai");
    expect(n.hook).toMatch(/^Air near Chiang Mai · Mon 28 Sep, \d+(am|pm) ICT$/);
    expect(n.station).toMatch(/^Measured at .+ station · 0\.\d km$/);
    expect(n.psiLine).toMatch(/^PCD Thai AQI \(24-hr\): \d+ · \w+/);
  });

  test("link preview card carries the local band in English and the official short line", () => {
    const { s } = snapAt("TH", "bangkok");
    const p = countryPreviewCard(s, "Bangkok");
    expect(p.bandLabel).toBe("Excellent");
    expect(p.officialShort).toBe("PCD Thai AQI 19");
    expect(p.dotColor).toBe(s.localBand!.color);
  });

  test("share text names the scale and the authority", () => {
    const { s } = snapAt("TH", "bangkok");
    const t = countryShareText(s, "Bangkok");
    expect(t).toStartWith("PM2.5 14 µg/m³ in Bangkok at 5pm ICT · PCD Thai AQI (24-hr): 19 · Excellent");
    expect(t).toEndWith("via HazeNow hazenow.pages.dev");
  });
});

/* ================================================================== verdict parity (no SG bands outside SG) */

describe("verdicts follow each authority's own category", () => {
  const chipScales = (Object.entries(CHIP_SCALE) as [CountryCode, string | null][]).filter(
    ([cc, id]) => cc !== "SG" && id && SCALES[id].role === "chip",
  );
  const GROUPS = ["general", "kids", "sensitive", "exercising", "outdoor_worker"] as const;
  const PROFILES = ["general", "kids", "elderly", "pregnant", "heart_lung", "exercising", "outdoor_worker"] as const;
  const FORBIDDEN = /\bFine\b|OK to be out/i;
  const cellsFor = (id: string, key: string) =>
    id === "th_aqi"
      ? Object.fromEntries(GROUPS.map((g) => [g, { en: THAI_VERDICTS[key][g].en, sev: THAI_CELL_SEVERITY[key][g] }]))
      : Object.fromEntries(GROUPS.map((g) => [g, { en: CATEGORY_VERDICTS[id][key][g].en, sev: CATEGORY_VERDICTS[id][key][g].sev }]));

  test("every chip scale has severities, verdict rows and an 'Unhealthy' threshold for every category", () => {
    expect(chipScales.map(([cc]) => cc).sort()).toEqual(["ID", "MY", "PH", "TH", "VN"]);
    for (const [, id] of chipScales) {
      expect(UNHEALTHY_FROM[id!]).toBeDefined();
      for (const b of SCALES[id!].bands) {
        expect(`${id}.${b.key}:${!!CATEGORY_SEVERITY[id!]?.[b.key]}`).toBe(`${id}.${b.key}:true`);
        const cells = cellsFor(id!, b.key);
        for (const g of GROUPS) expect(cells[g].en.length).toBeGreaterThan(5);
      }
    }
  });

  test("for every country, category and group: verdict severity ≥ the authority's advice severity", () => {
    for (const [, id] of chipScales) {
      for (const b of SCALES[id!].bands) {
        const need = CATEGORY_SEVERITY[id!][b.key];
        const cells = cellsFor(id!, b.key);
        for (const g of GROUPS) expect(`${id}.${b.key}.${g}:${cells[g].sev >= need[GROUP_BASIS[g]]}`).toBe(`${id}.${b.key}.${g}:true`);
      }
    }
  });

  test("severity never goes down as the category gets worse", () => {
    for (const [, id] of chipScales) {
      const bands = SCALES[id!].bands;
      for (let i = 1; i < bands.length; i++) {
        const a = CATEGORY_SEVERITY[id!][bands[i - 1].key];
        const b = CATEGORY_SEVERITY[id!][bands[i].key];
        expect(b.general).toBeGreaterThanOrEqual(a.general);
        expect(b.sensitive).toBeGreaterThanOrEqual(a.sensitive);
      }
    }
  });

  test("at or above the Unhealthy equivalent, no headline says 'Fine' or 'OK to be out' (every profile, end to end)", () => {
    const { s: base } = snapAt("TH", "bangkok");
    for (const [cc, id] of chipScales) {
      const bands = SCALES[id!].bands;
      const from = bands.findIndex((b) => b.key === UNHEALTHY_FROM[id!]);
      expect(from).toBeGreaterThan(0);
      bands.forEach((b, i) => {
        const lb = toLocalBand(id!, b)!;
        for (const hedgedCase of [false, true]) {
          const snap = {
            ...base,
            country: cc,
            localBand: lb,
            level: lb.level,
            bandBasis: SCALES[id!].basis,
            pm25Kind: hedgedCase ? null : ("official_1h" as const),
            pm25: hedgedCase ? null : base.pm25,
            official: hedgedCase ? { scaleId: id!, name: "X", value: 1, category: null, averaging: "24h" as const, param: null, agency: "A" } : base.official,
          };
          for (const p of PROFILES) {
            const v = countryVerdict(snap, [p]);
            if (i >= from) expect(`${id}.${b.key}.${p}: ${v.headline}`).not.toMatch(FORBIDDEN);
            // SG's own rows never leak out of SG.
            expect(v.headline).not.toBe("OK to be out. Go easy on hard exercise.");
          }
        }
      });
    }
  });

  test("'What helps now' tips match each category's severity, for every country, category and profile", () => {
    const { s: base } = snapAt("TH", "bangkok");
    const RANK = { normal: 0, elevated: 1, high: 2, very_high: 3 } as const;
    const CHECK_HERE = "Haze isn't always easy to see. Check here before a long run.";
    for (const [cc, id] of chipScales) {
      for (const b of SCALES[id!].bands) {
        const lb = toLocalBand(id!, b)!;
        const snap = { ...base, country: cc, localBand: lb, level: lb.level };
        const band = adviceBand(snap)!;
        const need = CATEGORY_SEVERITY[id!][b.key];
        // Tips are at least as strict as the authority's advice for the general public.
        expect(`${id}.${b.key}:${RANK[band] >= RANK[severityBand(need.general)]}`).toBe(`${id}.${b.key}:true`);
        const unhealthy = atOrAboveUnhealthy(id!, b.key);
        if (unhealthy) expect(`${id}.${b.key}:${band}`).toMatch(/:(high|very_high)$/);
        for (const p of PROFILES) {
          const acts = countryActions(snap, [p]);
          if (b.level === 0 && band === "normal") continue;
          expect(acts.length).toBeGreaterThan(0);
          expect(acts).toEqual(actions(band, [p]).map((a) => a.replace("call 995", `call ${acts.join(" ").match(/call (\d+)/)?.[1] ?? "995"}`)));
          if (unhealthy) {
            expect(acts).not.toContain(CHECK_HERE);
            expect(acts[0]).toBe("Close windows. Use aircon or a fan to keep cool.");
          }
          expect(acts[0]).not.toMatch(/N95|mask/i); // masks never first
          if (p === "kids") expect(acts.join(" ")).not.toMatch(/An N95 mask helps/);
          expect(acts.join(" ")).not.toMatch(/call 995/); // SG's number never outside SG
        }
      }
    }
  });

  test("Palembang (ISPU Tidak Sehat, 120 µg/m³): KLH's advice, not SG's Elevated row", () => {
    const { s } = snapAt("ID", "palembang");
    expect(s.localBand!.labelLocal).toBe("Tidak Sehat");
    expect(countryVerdict(s, ["general"]).headline).toBe("Cut back on long or hard activity outside for now.");
    expect(countryVerdict(s, ["elderly"]).headline).toBe("Avoid outdoor activity for now. Keep your medicine close.");
    expect(countryVerdict(s).needsReview).toBe(true);
    expect(adviceBand(s)).toBe("high");
    expect(countryActions(s, ["general"])).toEqual([
      "Close windows. Use aircon or a fan to keep cool.",
      "Run a purifier in the room you're in, if you have one.",
      "Move exercise indoors, or try later.",
    ]);
    const kids = countryActions(s, ["kids"]);
    expect(kids).toContain("Plan indoor play. Keep trips out short.");
    expect(kids.join(" ")).not.toMatch(/An N95 mask helps/);
    const n = countryNowCard(s, "Palembang");
    expect(n.adviceMost).toBe("Cut back on long or hard activity outside for now.");
  });

  test("Johor Bahru (24-hr API only): hedged verdict and a separate nearby-sensor line", () => {
    const { s } = snapAt("MY", "johor-bahru");
    const v = countryVerdict(s);
    expect(v.hedged).toBe(true);
    expect(v.headline).toBe("Based on the 24-hr index: fine to be out.");
    expect(nearbySensorLine(s)).toBe("A community sensor nearby reads 104 µg/m³ right now.");
    const d = countryDisplay(s, { placeName: "Johor Bahru" });
    expect(d.sensorLine).toBe("A community sensor nearby reads 104 µg/m³ right now.");
    // Never blended into the official figure.
    expect(d.official!.text).toBe("DOE Malaysia API (24-hr): 97 · Moderate");
    expect(s.pm25).toBeNull();
  });

  test("Kuala Lumpur (crowd number, 24-hr API chip) is hedged too; Bangkok (official 1-hr) is not", () => {
    expect(countryVerdict(snapAt("MY", "kuala-lumpur").s).headline).toStartWith("Based on the 24-hr index: ");
    expect(countryVerdict(snapAt("TH", "bangkok").s).hedged).toBeFalsy();
    expect(countryVerdict(snapAt("ID", "palembang").s).hedged).toBe(false);
  });

  test("DOE Malaysia colours are APIMS's own (malaysia.md): Good blue, Moderate green, Unhealthy yellow", () => {
    const col = Object.fromEntries(SCALES.my_api.bands.map((b) => [b.key, b.color]));
    expect(col).toMatchObject({ good: "#3D8AF7", moderate: "#7CDE6B", unhealthy: "#FFFF00", very_unhealthy: "#FFA500", hazardous: "#FF0000" });
  });
});
