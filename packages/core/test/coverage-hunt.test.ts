/**
 * Coverage hunt, 2026-09-30 (docs/sea/coverage-hunt/): the cluster outlier rule, the plausibility guard, the offline
 * rule, Sensor.Community inclusion, the Thai crowd layer, and Pai / Siem Reap / Johor Bahru resolution, never across a
 * border. Fixtures: the live captures in fixtures/sea/ (28 Sep 10:27Z and 18:06Z) and the Preview sets built from them.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { haversineKm } from "../src/math";
import {
  AIR4THAI_ATTRIBUTION,
  NOTICE_COPY,
  OFFLINE_AFTER_MS,
  PREVIEW_CAPTURED_AT,
  SC_ATTRIBUTION,
  agMapObservations,
  bmkgObservations,
  buildCountrySnapshot,
  cityMode,
  countryDisplay,
  createThAdapter,
  crowdQc,
  doeObservations,
  findCity,
  isOffline,
  ispuObservations,
  placeQuery,
  plausibility,
  screenObservations,
  usableCrowd,
  type CountryCode,
  type FetchLike,
  type Observation,
  type ObservationSet,
} from "../src/countries/index";

const FX = new URL("../fixtures/sea/", import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(FX + f, "utf8"));
const AG1027 = json("ag-map-sea-2026-09-28T1027Z.json");
const AG1806 = json("ag-map-sea-2026-09-28T1806Z.json");
const T1027 = Date.parse("2026-09-28T10:30:00Z");
const T1806 = Date.parse("2026-09-28T18:07:00Z");
const set = (country: CountryCode, observations: Observation[]): ObservationSet => ({ country, adapters: [], fetchedAt: "", observations, attribution: [] });

/** A low-cost sensor at a point, reading v now. */
const sensor = (id: string, lat: number, lon: number, v: number, now: number): Observation => ({
  stationId: `ag:${id}`, name: id, country: "TH", lat, lon, grade: "lowcost", pm25_now: v,
  periodEnd: new Date(now - 60_000).toISOString(), corrected: "source", k: null, qc: "uncalibrated", attributionId: "crowd.airgradient",
});

describe("cluster outlier rule (crowdQc)", () => {
  const NOW = T1027;
  const at = (i: number) => [19.3587 + i * 0.002, 98.44] as const;

  test("Pai's NT/TOT unit: 23.8 against a cluster median of 6.8 (3.5×) is dropped; the rest stay", () => {
    // The 21 readings from coverage-hunt/th.md (3.3–23.8, median ≈ 6.8).
    const vals = [3.3, 4.1, 4.8, 5.2, 5.6, 6.0, 6.2, 6.4, 6.6, 6.7, 6.8, 6.9, 7.1, 7.4, 7.9, 8.3, 8.8, 9.6, 11.2, 12.0, 23.8];
    const obs = vals.map((v, i) => sensor(String(i), ...at(i), v, NOW));
    const qc = crowdQc(obs, NOW);
    expect(qc.filter((o) => o.qc === "outlier").map((o) => o.pm25_now)).toEqual([23.8]);
    expect(qc.filter(usableCrowd)).toHaveLength(20);
  });

  test("the rule is generic: needs ≥ 4 sensors in the cluster, > 3× its median, and ≥ 10 µg/m³ above it", () => {
    const run = (vals: number[]) => crowdQc(vals.map((v, i) => sensor(String(i), ...at(i), v, NOW)), NOW).filter((o) => o.qc === "outlier").map((o) => o.pm25_now);
    expect(run([5, 6, 7, 40])).toEqual([40]); // 4 sensors: flagged
    expect(run([6, 7, 40])).toEqual([]); // 3 sensors: too few to call it
    expect(run([1, 1, 1, 4])).toEqual([]); // 4× the median, but clean-air jitter (< 10 µg/m³ above it)
    expect(run([20, 22, 25, 60])).toEqual([]); // under 3× the median: a real local gradient
    // Far-apart sensors are not one cluster.
    const far = [sensor("a", 19.36, 98.44, 5, NOW), sensor("b", 19.36, 98.45, 5, NOW), sensor("c", 19.37, 98.44, 5, NOW), sensor("d", 19.9, 99.8, 60, NOW)];
    expect(crowdQc(far, NOW).some((o) => o.qc === "outlier")).toBe(false);
  });

  test("28 Sep capture: Mae Ping Health Center (37.9 while Pai read ~1) is dropped, no other Pai sensor", () => {
    const qc = crowdQc(agMapObservations(AG1027, ["TH"]), T1027);
    const pai = { lat: 19.3587, lon: 98.44 };
    const near = qc.filter((o) => haversineKm(pai, o) <= 10);
    expect(near.length).toBeGreaterThanOrEqual(20);
    expect(near.filter((o) => o.qc === "outlier").map((o) => o.name)).toEqual(["Mae Ping Health Center"]);
  });
});

describe("plausibility guard (quality.ts)", () => {
  const NOW = Date.parse("2026-09-30T08:10:00Z"); // 15:10 WIB, the hunt's capture
  const PR = { lat: -2.2161, lon: 113.9135 };
  const bmkg = (v: number, prev: number | null): Observation => ({
    stationId: "id.bmkg:pm25_pr2", name: "Palangkaraya", country: "ID", lat: -2.22611, lon: 113.945, grade: "reference",
    pm25_1h: v, periodEnd: "2026-09-30T15:00:00+07:00", corrected: "none", attributionId: "id.bmkg",
    history: prev === null ? undefined : [{ time: "2026-09-30T14:00:00+07:00", pm25: prev }, { time: "2026-09-30T15:00:00+07:00", pm25: v }],
  });
  // KLH ISPU Palangka Raya, 30 Sep: a_pm25 1372.89 as a 24-h mean (coverage-hunt/id.md).
  const klh = ispuObservations(
    { rows: [{ id_stasiun: "PALANGKARAYA", nama: "Palangka Raya", waktu: "2026-09-30 15:00:00", lat: "-2.2080", lon: "113.9170", a_pm25: "1372.89", t_pm25: "500", provinsi: "Kalimantan Tengah" }] },
    NOW,
  )[0];

  test("Palangka Raya, 30 Sep: KLH's 24-h 1372.89 is left out; BMKG's severe-but-possible 793.8 stays", () => {
    expect(klh.pm25_24h).toBe(1372.89);
    expect(plausibility(klh)).toBe("out_of_range");
    expect(plausibility(bmkg(793.8, 760.2))).toBeNull();
    const s = buildCountrySnapshot(set("ID", [bmkg(793.8, 760.2), klh]), PR, NOW);
    expect(s.pm25).toBe(794);
    expect(s.pm25Kind).toBe("official_1h");
    expect(s.official).toBeNull(); // the implausible station's index row goes with it
    expect(s.stations.map((x) => x.stationId)).toEqual(["id.bmkg:pm25_pr2"]);
    expect(s.notes).toContain("implausible_dropped");
    expect(countryDisplay(s).notices).toContain("A station reading looked wrong and was left out.");
  });

  test("a rise of more than 400 in one hour is flagged (a drop is not)", () => {
    expect(plausibility(bmkg(793.8, 166))).toBe("jump");
    expect(plausibility(bmkg(566, 166))).toBeNull(); // +400 exactly: kept
    expect(plausibility(bmkg(166, 793.8))).toBeNull();
    // With another (far) station in the set, Palangka Raya gets no number rather than a faulty one.
    const far = { ...bmkg(40, null), stationId: "id.bmkg:far", lat: -6.2, lon: 106.8 };
    const s = buildCountrySnapshot(set("ID", [bmkg(793.8, 166), far]), PR, NOW);
    expect(s.pm25).toBeNull();
    expect(s.notes).toContain("implausible_dropped");
  });

  test("outside 0–1000 (1-hr or crowd), never a negative; bad history hours are blanked, not charted", () => {
    expect(plausibility(bmkg(1000.1, null))).toBe("out_of_range");
    expect(plausibility(bmkg(1000, null))).toBeNull();
    expect(plausibility({ ...bmkg(10, null), pm25_1h: -3 })).toBe("out_of_range");
    const spiky = { ...bmkg(40, null), history: [{ time: "2026-09-30T13:00:00+07:00", pm25: 1500 }, { time: "2026-09-30T15:00:00+07:00", pm25: 40 }] };
    const kept = screenObservations([spiky], NOW).kept[0];
    expect(kept.history![0].pm25).toBeNull();
    expect(kept.history![1].pm25).toBe(40);
  });

  test("a clean snapshot carries no quality note", () => {
    const s = buildCountrySnapshot(set("ID", [bmkg(120, 110)]), PR, NOW);
    expect(s.notes).not.toContain("implausible_dropped");
    expect(countryDisplay(s).notices).toEqual([]);
  });
});

describe("offline rule: no data for more than 24 h", () => {
  // KLH ISPU Badung Sempidi: last real hour 29 Sep 10:00 WITA (coverage-hunt/id.md).
  const badung = ispuObservations(
    { rows: [{ id_stasiun: "KABUPATEN_BADUNG", nama: "Kabupaten Badung Sempidi", waktu: "2026-09-29 10:00:00", lat: "-8.6039", lon: "115.1780", a_pm25: "7.36", t_pm25: "25", provinsi: "Bali" }] },
    Date.parse("2026-09-30T08:00:00Z"),
  )[0];
  const nusaDua = findCity("nusa-dua", "ID")!;

  test("Sempidi, 30 Sep 16:00 WITA: offline, left out; Nusa Dua has nothing to show, and says why", () => {
    const now = Date.parse("2026-09-30T16:00:00+08:00");
    expect(isOffline(badung, now)).toBe(true);
    // Somewhere else in Indonesia still reports (Jakarta), so the set isn't empty.
    const jakarta: Observation = {
      stationId: "id.bmkg:jkt", name: "Kemayoran", country: "ID", lat: -6.155, lon: 106.84, grade: "reference", pm25_1h: 40,
      periodEnd: new Date(now - 3600_000).toISOString(), corrected: "none", attributionId: "id.bmkg",
    };
    const s = buildCountrySnapshot(set("ID", [badung, jakarta]), placeQuery(nusaDua), now);
    expect(s.pm25).toBeNull();
    expect(s.official).toBeNull();
    expect(s.stations.some((x) => x.stationId === badung.stationId)).toBe(false);
    expect(s.notes).toContain("offline_dropped");
  });

  test("the same station within 24 h is kept (a late hour isn't an outage)", () => {
    const now = Date.parse(badung.periodEnd) + OFFLINE_AFTER_MS - 60_000;
    expect(isOffline(badung, now)).toBe(false);
    const s = buildCountrySnapshot(set("ID", [badung]), placeQuery(nusaDua), now);
    expect(s.official?.name).toBe("ISPU");
    expect(s.notes).not.toContain("offline_dropped");
  });

  test("the catalogue says so: Nusa Dua is Not available yet while Sempidi is offline", () => {
    expect(nusaDua.status).toBe("not_feasible");
    expect(nusaDua.reason).toMatch(/offline/);
    expect(cityMode(nusaDua, true)).toBe("unavailable");
  });
});

describe("Sensor.Community rows in the AirGradient map feed", () => {
  const all = agMapObservations(AG1806);
  test("included, tagged by their real network and attributed (ODbL), uncorrected", () => {
    const iolite = all.find((o) => o.stationId === "sc:121978516")!;
    expect(iolite.country).toBe("MY");
    expect(iolite.name).toBe("Sensor.Community #94332");
    expect(iolite.attributionId).toBe(SC_ATTRIBUTION.id);
    expect(iolite.corrected).toBe("none");
    expect(SC_ATTRIBUTION.licence).toBe("ODbL 1.0");
    const siem = all.find((o) => o.stationId === "sc:51718789")!;
    expect(siem.country).toBe("KH");
    expect(siem.name).toBe("Siem Reap");
  });
  test("a Sensor.Community row at RH ≥ 90 % is left out (no RH correction); AirGradient rows are untouched", () => {
    // Palembang (99.9 %) and Hà Nội (99.9 %) in this capture.
    expect(all.some((o) => o.stationId === "sc:16016237")).toBe(false);
    expect(all.some((o) => o.stationId === "sc:16009215")).toBe(false);
    expect(all.filter((o) => o.stationId.startsWith("ag:")).length).toBe(agMapObservations(AG1806).filter((o) => o.attributionId === "crowd.airgradient").length);
  });
  test("OpenAQ rows (Air4Thai mirrors) are still excluded", () => {
    expect(all.every((o) => /^(ag|sc):/.test(o.stationId))).toBe(true);
  });
});

describe("Pai: Thai community sensors fill the gap (official always wins where it exists)", () => {
  const preview: ObservationSet = json("preview/th.json");
  const NOW = Date.parse(PREVIEW_CAPTURED_AT);
  const pai = findCity("pai", "TH")!;

  test("catalogue: community sensors only, through the proxy, with the no-anchor caveat", () => {
    expect(pai.status).toBe("needs_proxy");
    expect(pai.crowdOnly).toBe(true);
    expect(pai.note).toMatch(/50 km/);
    expect(cityMode(pai, false)).toBe("preview");
  });

  test("Preview (28 Sep): a community estimate from Pai's sensors, the outlier left out, labelled as an estimate", () => {
    const s = buildCountrySnapshot(preview, placeQuery(pai), NOW);
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.pm25).not.toBeNull();
    expect(s.nearest!.distanceKm!).toBeLessThanOrEqual(10);
    expect(s.stations.every((x) => x.grade === "lowcost")).toBe(true); // no PCD station within 25 km
    expect(s.stations.some((x) => x.name === "Mae Ping Health Center")).toBe(false);
    const d = countryDisplay(s, { placeName: "Pai" });
    expect(d.kindLabel).toBe("Community sensors · estimate");
    expect(d.notices[0]).toBe(NOTICE_COPY.noAnchor);
    expect(s.attribution.map((a) => a.id)).toContain("crowd.airgradient");
  });

  test("official wins: Bangkok and Chiang Mai stay on PCD's 1-hr number even with sensors next door", () => {
    for (const id of ["bangkok", "chiang-mai"]) {
      const c = findCity(id, "TH")!;
      const s = buildCountrySnapshot(preview, placeQuery(c), NOW);
      expect(`${id}:${s.pm25Kind}`).toBe(`${id}:official_1h`);
      expect(s.attribution.map((a) => a.id)).toEqual([AIR4THAI_ATTRIBUTION.id]);
    }
  });

  test("the Thai adapter: Air4Thai direct, community sensors from the proxy (no location sent), Thai rows only", async () => {
    const aqi = json("th-air4thai-aqi-2026-09-28T17ICT.json");
    const hist = json("th-air4thai-history-2026-09-28T17ICT.json");
    const crowd = preview.observations.filter((o) => o.grade === "lowcost");
    // A mislabelled foreign row must never reach Thailand.
    const foreign: Observation = { ...crowd[0], stationId: "ag:mm-1", country: "MM" };
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      const body = url.includes("getAQI_JSON") ? aqi : url.includes("getHistoryData") ? hist
        : { ...preview, observations: [...crowd, foreign], attribution: preview.attribution.filter((a) => a.id !== AIR4THAI_ATTRIBUTION.id) };
      return { ok: true, status: 200, json: async () => body };
    };
    const th = createThAdapter();
    const s = await th.getSnapshot(placeQuery(pai), { fetch: f, now: NOW, proxyBase: "https://edge.example/" });
    const proxyCall = calls.find((u) => u.startsWith("https://edge.example"))!;
    expect(proxyCall).toBe("https://edge.example/v1/th/observations?grade=lowcost");
    expect(proxyCall).not.toMatch(/lat|lon/);
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.stations.every((x) => x.stationId !== "ag:mm-1")).toBe(true);
    // Without a proxy the Thai stations still work, and Pai simply has nothing within its radius.
    const noProxy = await th.getSnapshot(placeQuery(pai), { fetch: f, now: NOW });
    expect(noProxy.pm25).toBeNull();
    // Proxy down: a warning, not a failure.
    const down: FetchLike = async (url) => (url.startsWith("https://edge") ? { ok: false, status: 503, json: async () => ({}) } : f(url));
    const set2 = await th.fetchObservations({ fetch: down, now: NOW, proxyBase: "https://edge.example" });
    expect(set2.observations.length).toBe(173);
    expect(set2.warnings?.join(" ")).toMatch(/th\.crowd: .*503/);
    // Air4Thai down (e.g. its certificate expired, 30 Sep): Pai still gets its community estimate; Bangkok gets nothing.
    const pcdDown: FetchLike = async (url) => (url.includes("air4thai") ? Promise.reject(new TypeError("certificate has expired")) : f(url));
    const onlyCrowd = await th.getSnapshot(placeQuery(pai), { fetch: pcdDown, now: NOW, proxyBase: "https://edge.example" });
    expect(onlyCrowd.pm25Kind).toBe("crowd_estimate");
    await expect(th.getSnapshot(placeQuery(pai), { fetch: pcdDown, now: NOW })).rejects.toThrow(/Air4Thai isn't responding/);
  });
});

describe("Siem Reap: two networks agree → community sensors only", () => {
  const preview: ObservationSet = json("preview/kh.json");
  const NOW = Date.parse(PREVIEW_CAPTURED_AT);
  const sr = findCity("siem-reap", "KH")!;
  test("catalogue and snapshot: AirGradient + Sensor.Community, no chip, the WHO line", () => {
    expect(sr.status).toBe("needs_proxy");
    expect(sr.crowdOnly).toBe(true);
    const s = buildCountrySnapshot(preview, placeQuery(sr), NOW);
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.stations.map((x) => x.stationId).sort()).toEqual(["ag:23403781", "sc:51718789"]);
    expect(s.localBand).toBeNull();
    expect(s.attribution.map((a) => a.id).sort()).toEqual(["crowd.airgradient", "crowd.sensorcommunity"]);
    expect(countryDisplay(s).whoLine).toMatch(/WHO/);
  });
  test("Phnom Penh stays unavailable: its two sensors are 14 km out", () => {
    const pp = findCity("phnom-penh", "KH")!;
    expect(cityMode(pp, true)).toBe("unavailable");
    expect(pp.fix).toMatch(/10 km/);
  });
});

describe("Johor Bahru: Iolite (Sensor.Community) gives an hourly estimate; Singapore's sensors never count", () => {
  const doe = doeObservations(json("my-doe-apims-2026-09-29T02MYT.json"));
  // Every crowd row in the capture, Singapore's included: the builder must drop them.
  const crowd = crowdQc(agMapObservations(AG1806), T1806);
  const jb = findCity("johor-bahru", "MY")!;

  test("the estimate uses Iolite (9.9 km) only; Sembawang (Singapore, 9.3 km) is dropped", () => {
    const sembawang = crowd.find((o) => o.name === "Sembawang")!;
    expect(sembawang.country).toBe("SG");
    expect(haversineKm(jb, sembawang)).toBeLessThan(10);
    const s = buildCountrySnapshot({ ...set("MY", [...doe, ...crowd]) }, placeQuery(jb), T1806);
    expect(s.notes).toContain("other_country_dropped");
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.pm25).toBe(101);
    expect(s.nearest!.stationId).toBe("sc:121978516");
    expect(s.stations.some((x) => x.stationId === sembawang.stationId)).toBe(false);
    expect(s.official?.agency).toMatch(/^DOE/); // DOE's 24-hr API stays the official row
  });

  test("without Sensor.Community rows (the old filter) JB had no hourly number", () => {
    const agOnly = crowd.filter((o) => o.stationId.startsWith("ag:"));
    const s = buildCountrySnapshot(set("MY", [...doe, ...agOnly]), placeQuery(jb), T1806);
    expect(s.pm25).toBeNull();
    expect(s.official?.agency).toMatch(/^DOE/);
  });
});

describe("no cross-border use anywhere in the new paths", () => {
  test("every crowd row carries the country its point is in; each place only ever uses its own", () => {
    const crowd = crowdQc(agMapObservations(AG1806), T1806).filter(usableCrowd);
    const sets: Record<string, ObservationSet> = {};
    for (const cc of ["TH", "MY", "KH", "SG", "LA"] as CountryCode[]) sets[cc] = set(cc, crowd);
    for (const [cc, id] of [["TH", "pai"], ["KH", "siem-reap"], ["MY", "johor-bahru"], ["LA", "vientiane"]] as const) {
      const s = buildCountrySnapshot(sets[cc], placeQuery(findCity(id, cc)!), T1806);
      for (const st of s.stations) expect(`${id}:${crowd.find((o) => o.stationId === st.stationId)!.country}`).toBe(`${id}:${cc}`);
    }
  });

  test("Tachileik-style border points: Mae Sai's sensors are Thai, never used for Myanmar (no MM feed)", () => {
    const th = agMapObservations(AG1806, ["TH"]);
    expect(th.every((o) => o.country === "TH")).toBe(true);
    expect(agMapObservations(AG1806, ["MM"]).every((o) => o.country === "MM")).toBe(true);
  });

  test("ISPU `t_pm25 0` is missing data, not \"Baik\" (DLH Medan 01/02)", () => {
    const ispu = ispuObservations(json("id-klh-ispu-2026-09-29T01WIB.json"), T1806);
    const medan = (id: string) => ispu.find((o) => o.stationId === `id.klh:${id}`)!;
    expect(medan("DLH_MEDAN_02").official).toBeNull();
    expect(medan("DLH_MEDAN_01").official).toBeNull();
    expect(medan("DLH_MEDAN_03").official?.value).toBe(66);
    const bmkg = bmkgObservations(readFileSync(FX + "id-bmkg-pm25-2026-09-29T01WIB.html", "utf8"), T1806);
    const s = buildCountrySnapshot(set("ID", [...bmkg, ...ispu]), findCity("medan", "ID")!, T1806);
    expect(s.official?.value).toBe(66);
  });

  test("Pangkalan Bun: the BMKG station comes through the existing feed, 6 km from town", () => {
    const bmkg = bmkgObservations(readFileSync(FX + "id-bmkg-pm25-2026-09-29T01WIB.html", "utf8"), T1806);
    const pkn = bmkg.find((o) => o.stationId === "id.bmkg:pm25_pkn2")!;
    expect(pkn.name).toBe("Pangkalanbun");
    const place = findCity("pangkalan-bun", "ID")!;
    expect(haversineKm(place, pkn)).toBeLessThan(10);
    const s = buildCountrySnapshot(set("ID", bmkg), placeQuery(place), T1806);
    expect(s.pm25Kind).toBe("official_1h");
    expect(s.nearest?.stationId).toBe("id.bmkg:pm25_pkn2");
  });
});

describe("statuses from the hunt verdicts", () => {
  test("Cameron Highlands needs MET Malaysia's permission; Balikpapan shows ISPU only, with the Nafas note", () => {
    const ch = findCity("cameron-highlands", "MY")!;
    expect(ch.status).toBe("needs_permission");
    expect(ch.reason).toMatch(/MET Malaysia/);
    const bp = findCity("balikpapan", "ID")!;
    expect(bp.status).toBe("needs_proxy");
    expect(bp.crowdOnly).toBeUndefined();
    expect(bp.note).toMatch(/Nafas/);
    expect(findCity("bandung", "ID")!.note).toMatch(/ITB/);
    expect(findCity("surabaya", "ID")!.note).toMatch(/ITS/);
  });
  test("Batam, Yogyakarta and Makassar are hourly via BMKG (unchanged: needs proxy, 1-hr)", () => {
    const bmkg = bmkgObservations(readFileSync(FX + "id-bmkg-pm25-2026-09-29T01WIB.html", "utf8"), T1806);
    for (const id of ["batam", "yogyakarta", "makassar"]) {
      const c = findCity(id, "ID")!;
      expect(c.status).toBe("needs_proxy");
      const s = buildCountrySnapshot(set("ID", bmkg), placeQuery(c), T1806);
      expect(`${id}:${s.pm25Kind}`).toBe(`${id}:official_1h`);
    }
  });
});
