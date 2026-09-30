/**
 * SPEC principle 1: the headline always answers "is it OK to be out?". Caveats ("No official reading near here",
 * "There's no official air-quality scale here", "official data isn't responding") go under the number, never in it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CHIP_SCALE,
  ESTIMATE_PREFIX,
  NO_OFFICIAL_COPY,
  NO_SCALE_COPY,
  PLACES,
  PREVIEW_CAPTURED_AT,
  THAI_VERDICTS,
  WHO_VERDICT_BANDS,
  buildCountrySnapshot,
  categoryVerdictCell,
  cityMode,
  classifyPm25,
  countryDisplay,
  countryVerdict,
  placeQuery,
  whoVerdictBand,
  type CountryCode,
  type CountrySnapshot,
  type ObservationSet,
} from "../src/countries/index";
import type { Profile } from "../src/experience";

const FX = new URL("../fixtures/sea/preview/", import.meta.url).pathname;
const NOW = Date.parse(PREVIEW_CAPTURED_AT);
const PROFILES: Profile[][] = [["general"], ["kids"], ["elderly"], ["exercising"], ["outdoor_worker"], ["kids", "elderly"]];
const FORBIDDEN = [NO_OFFICIAL_COPY.headline, NO_SCALE_COPY.headline];

/** Every place with a Preview set, built as the app builds it. */
function allSnapshots(): { name: string; s: CountrySnapshot }[] {
  const out: { name: string; s: CountrySnapshot }[] = [];
  for (const cc of ["th", "my", "id", "vn", "ph", "la", "kh"]) {
    const set: ObservationSet = JSON.parse(readFileSync(FX + `${cc}.json`, "utf8"));
    for (const p of PLACES.filter((x) => x.country === cc.toUpperCase() && cityMode(x, true) === "live")) {
      try {
        out.push({ name: p.name, s: buildCountrySnapshot(set, placeQuery(p), NOW) });
      } catch {
        /* nothing in range for this place in the recording: the client shows its no-data state, not a headline */
      }
    }
  }
  return out;
}
const snaps = allSnapshots();

describe("headlines", () => {
  test("no headline, for any place or profile, is a caveat string", () => {
    expect(snaps.length).toBeGreaterThan(50);
    for (const { name, s } of snaps) {
      for (const p of PROFILES) {
        const v = countryVerdict(s, p);
        expect(`${name}: ${FORBIDDEN.includes(v.headline as never)}`).toBe(`${name}: false`);
        expect(v.headline).not.toMatch(/isn't responding/);
      }
    }
  });

  test("a synthetic snapshot with no number at all still doesn't use them", () => {
    const empty = { ...snaps[0].s, pm25: null, band: null, level: null, localBand: null, bandBasis: "none", official: null, pm25Kind: null, bandFromEstimate: false } as CountrySnapshot;
    for (const cc of ["TH", "LA"] as CountryCode[]) expect(FORBIDDEN).not.toContain(countryVerdict({ ...empty, country: cc }).headline);
  });

  test("the caveats appear only as the line under the number", () => {
    const subs = snaps.map(({ s }) => countryDisplay(s).numberSub);
    expect(subs.some((x) => x.startsWith("No official reading near here ·"))).toBe(true); // Pai
    expect(subs.some((x) => x.startsWith("There's no official air-quality scale here ·"))).toBe(true); // Vientiane, Siem Reap
  });
});

describe("community estimates follow the authority's category (rule 1)", () => {
  test("every estimate headline is 'Estimate: ' + that category's normal verdict, same severity", () => {
    let n = 0;
    for (const { name, s } of snaps) {
      if (!s.bandFromEstimate) continue;
      n++;
      expect(s.pm25Kind).toBe("crowd_estimate");
      const b = classifyPm25(s.localBand!.scaleId, s.pm25!)!;
      expect(`${name}:${s.localBand!.key}`).toBe(`${name}:${b.key}`);
      for (const p of PROFILES) {
        const v = countryVerdict(s, p);
        expect(v.estimate).toBe(true);
        const plain = countryVerdict({ ...s, bandFromEstimate: false }, p);
        expect(v.headline).toBe(ESTIMATE_PREFIX.en + plain.headline.charAt(0).toLowerCase() + plain.headline.slice(1));
        expect(v.short.startsWith(ESTIMATE_PREFIX.short)).toBe(true);
        // The plain verdict is the category's own row (Thai table, or the shared category table).
        if (s.localBand!.scaleId === "th_aqi") expect(Object.values(THAI_VERDICTS[b.key]).map((c) => c.en)).toContain(plain.headline);
        else expect(plain.headline).toBe(categoryVerdictCell(s.localBand!.scaleId, b.key, p)!.cell.en);
      }
      const d = countryDisplay(s);
      expect(d.chip?.estimate).toBe(true);
      expect(d.kindLabel).toBe("Community sensors · estimate");
    }
    expect(n).toBeGreaterThanOrEqual(10); // Pai, Bali, Uluwatu, Metro Manila, HCMC-style places
  });

  test("Pai: PCD's category for the estimate, the estimate tag, and both caveats underneath", () => {
    const pai = snaps.find((x) => x.name === "Pai")!.s;
    expect(pai.localBand?.scaleId).toBe("th_aqi");
    const v = countryVerdict(pai);
    expect(v.headline).toMatch(/^Estimate: fine/);
    const d = countryDisplay(pai);
    expect(d.numberSub).toBe("No official reading near here · community sensors estimate");
    expect(d.chip?.basisNote).toBe("PCD category, applied to the community-sensor estimate");
    expect(d.notices[0]).toMatch(/no official station within 25 km/);
  });

  test("an official number is never prefixed", () => {
    for (const { s } of snaps) if (s.pm25Kind === "official_1h") expect(countryVerdict(s).headline.startsWith(ESTIMATE_PREFIX.en)).toBe(false);
  });
});

describe("no national scale: WHO 2021 guidance verdicts (rule 2)", () => {
  test("four bands on the hourly estimate, boundaries as specified", () => {
    const at = (v: number) => whoVerdictBand(v).en;
    expect(at(0)).toBe("Likely fine to be out.");
    expect(at(24.9)).toBe("Likely fine to be out.");
    expect(at(25)).toBe("Likely OK. Sensitive people, go easy.");
    expect(at(49.9)).toBe("Likely OK. Sensitive people, go easy.");
    expect(at(50)).toBe("Go easy outdoors for now.");
    expect(at(99.9)).toBe("Go easy outdoors for now.");
    expect(at(100)).toBe("Limit time outside for now.");
    expect(at(800)).toBe("Limit time outside for now.");
    expect(WHO_VERDICT_BANDS.map((b) => b.sev)).toEqual([0, 1, 2, 3]); // severity rises with the band
  });

  test("Siem Reap and Vientiane: WHO verdict, 'WHO guide: …' chip, the ×WHO line kept", () => {
    for (const name of ["Siem Reap", "Vientiane", "Luang Prabang"]) {
      const s = snaps.find((x) => x.name === name)!.s;
      expect(CHIP_SCALE[s.country]).toBeNull();
      const v = countryVerdict(s);
      expect(v.whoBased).toBe(true);
      expect(v.headline).toBe(whoVerdictBand(s.pm25!).en);
      const d = countryDisplay(s);
      expect(d.chip?.en).toBe(`WHO guide: ${whoVerdictBand(s.pm25!).word}`);
      expect(d.whoLine).toMatch(/× the WHO daily guideline/);
      expect(d.numberSub).toBe("There's no official air-quality scale here · community sensors estimate");
    }
  });
});
