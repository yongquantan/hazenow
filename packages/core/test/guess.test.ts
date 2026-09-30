/** SPEC v2.1 — country guess from device signals (time zone, languages) plus the optional connection country. */
import { describe, expect, test } from "bun:test";
import { guessCountry, languageCountry, wantsServerHint } from "../src/index";
import {
  COUNTRIES,
  GUESS_DEFAULT_PLACE,
  SEA_TIME_ZONES,
  findCity,
  slugOf,
  startPlace,
  type CountryCode,
} from "../src/countries/index";

const g = (timeZone: string | null, languages: string[] = [], serverCountry?: string) => guessCountry({ timeZone, languages, serverCountry });

describe("guessCountry: every SEA time zone", () => {
  const cases: [string, CountryCode, string][] = [
    ["Asia/Singapore", "SG", "singapore"],
    ["Singapore", "SG", "singapore"],
    ["Asia/Kuala_Lumpur", "MY", "kuala-lumpur"],
    ["Asia/Kuching", "MY", "kuching"],
    ["Asia/Jakarta", "ID", "jakarta"],
    ["Asia/Pontianak", "ID", "pontianak"],
    ["Asia/Makassar", "ID", "denpasar"],
    ["Asia/Ujung_Pandang", "ID", "denpasar"],
    ["Asia/Jayapura", "ID", "jakarta"],
    ["Asia/Ho_Chi_Minh", "VN", "hanoi"],
    ["Asia/Saigon", "VN", "hanoi"],
    ["Asia/Manila", "PH", "metro-manila"],
    ["Asia/Vientiane", "LA", "vientiane"],
    ["Asia/Phnom_Penh", "KH", "siem-reap"],
    ["Asia/Yangon", "MM", "yangon"],
    ["Asia/Rangoon", "MM", "yangon"],
    ["Asia/Brunei", "BN", "bandar-seri-begawan"],
    ["Asia/Dili", "TL", "dili"],
  ];
  for (const [tz, cc, place] of cases) {
    test(`${tz} → ${cc} (${place}), high`, () => {
      const r = g(tz, ["en-US"]);
      expect(r.country).toBe(cc);
      expect(r.confidence).toBe("high");
      expect(r.place).toBe(place);
      expect(r.reason).toContain(tz);
      expect(wantsServerHint(r)).toBe(false);
    });
  }

  test("the table covers every zone listed, and each suggested place exists in the catalogue", () => {
    const tested = new Set(cases.map((c) => c[0]));
    for (const tz of Object.keys(SEA_TIME_ZONES)) expect(tested.has(tz) || tz === "Asia/Bangkok").toBe(true); // Bangkok: its own block below
    for (const [tz, cc] of cases) {
      const r = g(tz);
      expect(findCity(r.place!, cc)).not.toBeNull();
    }
  });

  test("zone-specific places are flagged as suggestions only", () => {
    expect(g("Asia/Makassar").placeFromZone).toBe(true);
    expect(g("Asia/Kuching").placeFromZone).toBe(true);
    expect(g("Asia/Pontianak").placeFromZone).toBe(true);
    expect(g("Asia/Jakarta").placeFromZone).toBe(false);
    expect(g("Asia/Kuala_Lumpur").placeFromZone).toBe(false);
  });

  test("default places match the registry's defaultPlace", () => {
    for (const cc of Object.keys(COUNTRIES) as CountryCode[]) expect(GUESS_DEFAULT_PLACE[cc]).toBe(slugOf(COUNTRIES[cc].defaultPlace.name));
  });
});

describe("guessCountry: Asia/Bangkok is shared by TH, VN, LA and KH", () => {
  test("no SEA language → Thailand, low (ask the connection)", () => {
    const r = g("Asia/Bangkok", ["en-US", "en"]);
    expect(r).toMatchObject({ country: "TH", confidence: "low", place: "bangkok" });
    expect(wantsServerHint(r)).toBe(true);
  });
  test("Thai confirms Thailand, high", () => expect(g("Asia/Bangkok", ["th-TH"])).toMatchObject({ country: "TH", confidence: "high" }));
  test("Vietnamese → Vietnam (Hanoi), medium", () => expect(g("Asia/Bangkok", ["vi-VN", "en"])).toMatchObject({ country: "VN", confidence: "medium", place: "hanoi" }));
  test("Lao → Laos", () => expect(g("Asia/Bangkok", ["lo"])).toMatchObject({ country: "LA", confidence: "medium", place: "vientiane" }));
  test("Khmer → Cambodia", () => expect(g("Asia/Bangkok", ["km-KH"])).toMatchObject({ country: "KH", confidence: "medium" }));
  test("a region subtag counts: en-VN → Vietnam", () => expect(g("Asia/Bangkok", ["en-VN"]).country).toBe("VN"));
  test("a language for a country outside the zone doesn't move it (ms → still TH, low)", () =>
    expect(g("Asia/Bangkok", ["ms-MY"])).toMatchObject({ country: "TH", confidence: "low" }));
  test("the connection settles it", () => {
    expect(g("Asia/Bangkok", ["en"], "KH")).toMatchObject({ country: "KH", confidence: "high", place: "siem-reap" });
    expect(g("Asia/Bangkok", ["en"], "TH")).toMatchObject({ country: "TH", confidence: "high" });
    // The connection beats the language within the zone's countries.
    expect(g("Asia/Bangkok", ["vi"], "LA").country).toBe("LA");
  });
  test("a connection outside the zone's countries is ignored", () => expect(g("Asia/Bangkok", ["en"], "SG")).toMatchObject({ country: "TH", confidence: "low" }));
});

describe("guessCountry: time zone and language disagree", () => {
  test("zone wins at medium", () => {
    const r = g("Asia/Singapore", ["th-TH", "en"]);
    expect(r).toMatchObject({ country: "SG", confidence: "medium" });
    expect(r.reason).toContain("th-TH");
    expect(wantsServerHint(r)).toBe(true);
  });
  test("the connection picks the side it agrees with", () => {
    expect(g("Asia/Singapore", ["ms-MY"], "MY")).toMatchObject({ country: "MY", confidence: "high", place: "kuala-lumpur" });
    expect(g("Asia/Singapore", ["ms-MY"], "SG")).toMatchObject({ country: "SG", confidence: "high" });
    expect(g("Asia/Singapore", ["ms-MY"], "ID")).toMatchObject({ country: "SG", confidence: "medium" });
  });
  test("a zone place only applies to its own country", () => {
    const r = g("Asia/Makassar", ["en-MY"], "MY");
    expect(r).toMatchObject({ country: "MY", place: "kuala-lumpur", placeFromZone: false });
  });
  test("an agreeing language keeps it high", () => expect(g("Asia/Jakarta", ["id-ID"])).toMatchObject({ country: "ID", confidence: "high" }));
  test("a non-SEA language never disagrees", () => expect(g("Asia/Manila", ["de-DE", "ja"])).toMatchObject({ country: "PH", confidence: "high" }));
});

describe("guessCountry: outside Southeast Asia and unknown zones", () => {
  test("Europe/London → none, medium (Singapore with a picker hint)", () => {
    const r = g("Europe/London", ["en-GB"]);
    expect(r).toMatchObject({ country: null, confidence: "medium", place: null });
    expect(wantsServerHint(r)).toBe(true);
  });
  test("a non-SEA zone ignores SEA languages", () => expect(g("Europe/London", ["th-TH"]).country).toBeNull());
  test("other Asian zones are outside too", () => {
    expect(g("Asia/Tokyo", ["ja"]).country).toBeNull();
    expect(g("Asia/Hong_Kong", ["zh-HK"]).country).toBeNull();
    expect(g("America/New_York", ["en-US"]).country).toBeNull();
  });
  test("a SEA connection moves a non-SEA zone to that country, medium", () =>
    expect(g("Europe/London", ["en-GB"], "SG")).toMatchObject({ country: "SG", confidence: "medium" }));
  test("a non-SEA connection confirms outside, high", () => expect(g("Europe/London", ["en-GB"], "GB")).toMatchObject({ country: null, confidence: "high" }));
  test("unknown / junk / UTC zones", () => {
    for (const tz of ["UTC", "Etc/UTC", "Etc/GMT-7", "", "Mars/Olympus", null]) {
      const r = g(tz, ["en"]);
      expect(r).toMatchObject({ country: null, confidence: "low" });
    }
  });
  test("Cloudflare's XX / T1 aren't countries", () => {
    expect(g("UTC", [], "XX")).toMatchObject({ country: null, confidence: "low" });
    expect(g("UTC", [], "T1")).toMatchObject({ country: null, confidence: "low" });
    expect(g("UTC", [], "sg")).toMatchObject({ country: "SG", confidence: "medium" });
  });
});

describe("guessCountry: languages only (no usable zone)", () => {
  const cases: [string, CountryCode][] = [
    ["th", "TH"], ["vi", "VN"], ["id", "ID"], ["in", "ID"], ["ms", "MY"], ["fil", "PH"], ["tl", "PH"], ["lo", "LA"], ["km", "KH"], ["my", "MM"],
    ["en-SG", "SG"], ["zh-Hans-SG", "SG"], ["en_PH", "PH"],
  ];
  for (const [tag, cc] of cases) {
    test(`${tag} → ${cc}, low`, () => expect(g("UTC", ["en-US", tag])).toMatchObject({ country: cc, confidence: "low" }));
  }
  test("first SEA language in preference order wins", () => expect(g(null, ["de", "vi", "th"]).country).toBe("VN"));
  test("no input at all", () => expect(guessCountry()).toMatchObject({ country: null, confidence: "low", place: null }));
  test("languageCountry", () => {
    expect(languageCountry("en-US")).toBeNull();
    expect(languageCountry("my")).toBe("MM"); // Burmese, not Malaysia
    expect(languageCountry("ms-BN")).toBe("BN");
  });
});

describe("startPlace", () => {
  test("covered suggestion → itself", () => {
    expect(startPlace(g("Asia/Bangkok", ["th"])).place.id).toBe("bangkok");
    const bali = startPlace(g("Asia/Makassar"));
    expect(bali).toMatchObject({ notCoveredFrom: null, outside: false, fromZone: true });
    expect(bali.place.id).toBe("denpasar");
    expect(startPlace(g("Asia/Kuching")).place.id).toBe("kuching");
    expect(startPlace(g("Asia/Kuala_Lumpur")).place.id).toBe("kuala-lumpur");
  });
  test("outside SEA → Singapore, outside", () => {
    const s = startPlace(g("Europe/London", ["en-GB"]));
    expect(s.place.country).toBe("SG");
    expect(s.outside).toBe(true);
  });
  test("an uncovered country → the nearest covered city, flagged", () => {
    const mm = startPlace(g("Asia/Yangon"));
    expect(mm.notCoveredFrom).toBe("MM");
    expect(mm.place.country).toBe("TH");
    expect(["live_direct", "needs_proxy"]).toContain(mm.place.status);
    expect(startPlace(g("Asia/Brunei")).place.id).toBe("kota-kinabalu");
    const tl = startPlace(g("Asia/Dili"));
    expect(tl.notCoveredFrom).toBe("TL");
    expect(["live_direct", "needs_proxy"]).toContain(tl.place.status);
    // Cambodia is covered in Siem Reap now (community sensors), so it starts there, not across a border.
    const kh = startPlace(g("Asia/Phnom_Penh"));
    expect(kh.notCoveredFrom).toBeNull();
    expect(kh.place.id).toBe("siem-reap");
  });
});
