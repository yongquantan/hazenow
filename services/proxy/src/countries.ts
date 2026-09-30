/**
 * Per-country ObservationSets, composed from the allow-listed sources. A failing source degrades the set
 * (a plain-language warning), it never fails the whole country while another source still answers.
 */
import {
  AG_ATTRIBUTION,
  AIR4THAI_ATTRIBUTION,
  BMKG_ATTRIBUTION,
  DOE_ATTRIBUTION,
  HANOI_ATTRIBUTION,
  KLH_ATTRIBUTION,
  NEA_ATTRIBUTION,
  SC_ATTRIBUTION,
  SIPONGI_ATTRIBUTION,
  agMapObservations,
  agWorldObservations,
  air4thaiHistoryUrl,
  air4thaiObservations,
  biasFactor,
  biasFactor24h,
  bmkgObservations,
  crowdQc,
  doeObservations,
  hanoiObservation,
  ispuObservations,
  mergeDoeUpdate,
  parseAir4ThaiHistory,
  parseAir4ThaiStations,
  parseHanoiSites,
  sgObservations,
  sipongiHotspots,
  type Attribution,
  type CountryCode,
  type Observation,
  type ObservationSet,
} from "../../../packages/core/src/countries/index.js";
import { haversineKm } from "../../../packages/core/src/math.js";
import { fromV1, type ApiResponse } from "../../../packages/core/src/parse.js";
import { sgtDate } from "../../../packages/core/src/format.js";
import type { RawResponses } from "../../../packages/core/src/client.js";
import { Rings } from "./rings.js";
import { URLS } from "./sources.js";
import { UpstreamError, type Got, type Upstreams } from "./upstream.js";

export const SERVED: CountryCode[] = ["SG", "TH", "MY", "ID", "VN", "PH", "LA", "KH"];
export const ANCHOR_RADIUS_KM = 10;
const HOUR = 3600_000;

/** Crowd attribution: AirGradient (CC BY-SA 4.0) and the Sensor.Community rows its map carries (ODbL 1.0). */
const CROWD = [AG_ATTRIBUTION, SC_ATTRIBUTION];
export const ATTRIBUTION: Record<string, Attribution[]> = {
  SG: [NEA_ATTRIBUTION],
  TH: [AIR4THAI_ATTRIBUTION, ...CROWD],
  MY: [DOE_ATTRIBUTION, ...CROWD],
  ID: [BMKG_ATTRIBUTION, KLH_ATTRIBUTION, SIPONGI_ATTRIBUTION, ...CROWD],
  VN: [HANOI_ATTRIBUTION, ...CROWD],
  PH: CROWD,
  LA: CROWD,
  KH: CROWD,
};
export const ALL_ATTRIBUTION: Attribution[] = [...new Map(Object.values(ATTRIBUTION).flat().map((a) => [a.id, a])).values()];

export class NoDataForCountry extends Error {
  constructor(public country: CountryCode, public warnings: string[]) {
    super(`No data available for ${country} right now`);
    this.name = "NoDataForCountry";
  }
}

export class CountryService {
  readonly rings = new Rings();
  private prevMy: Observation[] = [];
  /** Composed sets are reused for a few seconds: upstream freshness is governed by the sources' TTLs anyway. */
  private memo = new Map<CountryCode, { at: number; set: Promise<ObservationSet> }>();
  static MEMO_MS = 15_000;

  constructor(private up: Upstreams, private clock: () => number = Date.now) {}

  private async tryGet<T>(warnings: string[], id: string, url: string): Promise<Got<T> | null> {
    try {
      const g = await this.up.get<T>(id, url);
      if (g.stale) warnings.push(`${id}: ${g.error}; serving data fetched ${Math.round((this.clock() - g.fetchedAt) / 60_000)} min ago`);
      return g;
    } catch (e) {
      warnings.push(`${id}: ${e instanceof UpstreamError ? e.message.replace(`${id}: `, "") : (e as Error).message}`);
      return null;
    }
  }

  /* -------------------------------------------------------------- crowd (shared by TH, MY, ID, VN, PH, LA, KH) */

  private async crowdAll(warnings: string[]): Promise<Observation[]> {
    const now = this.clock();
    let obs: Observation[] = [];
    const map = await this.tryGet<unknown>(warnings, "crowd.airgradient", URLS.agMap());
    if (map) obs = agMapObservations(map.data);
    if (!obs.length) {
      const world = await this.tryGet<unknown>(warnings, "crowd.airgradient.world", URLS.agWorld());
      if (world) obs = agWorldObservations(world.data);
    }
    for (const o of obs) this.rings.recordCrowd(o, now);
    return obs.map((o) => {
      const m = this.rings.crowdRolling1h(o.stationId, now);
      return m === null ? o : { ...o, pm25_1h: m };
    });
  }

  /**
   * ARCHITECTURE_V2 §3 bias correction against the jurisdiction's anchor (nearest official station ≤ 10 km):
   * 1-hr anchors (TH Air4Thai, ID BMKG, VN Hanoi) → median hourly ratio; MY → DOE implied 24-h PM2.5 vs the sensor's
   * 24-h mean. No anchor (PH, LA, KH) → uncalibrated (EPA correction only).
   */
  calibrate(crowd: Observation[], anchors: Observation[], kind: "1h" | "24h" | "none"): Observation[] {
    const now = this.clock();
    const out = crowd.map((o) => {
      if (kind === "none") return o;
      const near = anchors
        .map((a) => ({ a, d: haversineKm(o, a) }))
        .filter((x) => x.d <= ANCHOR_RADIUS_KM)
        .sort((x, y) => x.d - y.d)[0];
      if (!near) return o;
      const sensorHours = this.rings.crowdHourly(o.stationId);
      let r;
      if (kind === "1h") {
        const pairs = this.rings
          .officialHourly(near.a.stationId)
          .filter((h) => h.pm25 !== null && sensorHours.has(h.t))
          .map((h) => ({ anchor: h.pm25!, sensor: sensorHours.get(h.t)! }));
        r = biasFactor(pairs);
      } else {
        const last24 = [...sensorHours.entries()].filter(([t]) => t > now - 24 * HOUR).map(([, v]) => v);
        r = biasFactor24h(near.a.pm25_24h ?? null, last24);
      }
      if (r.qc === "erratic") return { ...o, qc: "erratic" as const };
      if (r.k === null) return o;
      const scale = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * r.k! * 10) / 10 : v);
      return { ...o, k: r.k, qc: "ok" as const, pm25_now: scale(o.pm25_now), pm25_1h: scale(o.pm25_1h) };
    });
    return crowdQc(out, now);
  }

  /* -------------------------------------------------------------- per country */

  async sgRaw(warnings: string[] = []): Promise<RawResponses> {
    const now = this.clock();
    const today = sgtDate(now);
    const [pm, psi] = await Promise.all([
      this.tryGet<unknown>(warnings, "sg.nea.v1", URLS.neaV1("pm25", today)),
      this.tryGet<unknown>(warnings, "sg.nea.v1", URLS.neaV1("psi", today)),
    ]);
    const norm = (g: Got<unknown> | null) => (g ? fromV1(g.data) : null);
    let pm1: ApiResponse | null = norm(pm);
    let psi1: ApiResponse | null = norm(psi);
    if (!pm1?.data?.items?.length) pm1 = norm(await this.tryGet<unknown>(warnings, "sg.nea.v1", URLS.neaV1("pm25")));
    if (!psi1?.data?.items?.length) psi1 = norm(await this.tryGet<unknown>(warnings, "sg.nea.v1", URLS.neaV1("psi")));
    if (!pm1?.data?.items?.length) {
      const v2 = await this.tryGet<unknown>(warnings, "sg.nea.v2", URLS.neaV2("pm25", today));
      if (v2) return { v1Pm25: [], v1Psi: [psi1], pm25Latest: null, pm25Days: [fromV1(v2.data)], psi: null, psiDays: [] };
    }
    return { v1Pm25: [pm1], v1Psi: [psi1], pm25Latest: null, pm25Days: [], psi: null, psiDays: [] };
  }

  async observations(cc: CountryCode): Promise<ObservationSet> {
    const hit = this.memo.get(cc);
    if (hit && this.clock() - hit.at < CountryService.MEMO_MS) return hit.set;
    const set = this.compose(cc);
    this.memo.set(cc, { at: this.clock(), set });
    set.catch(() => this.memo.delete(cc)); // never memoise a failure
    return set;
  }

  private async compose(cc: CountryCode): Promise<ObservationSet> {
    const now = this.clock();
    const warnings: string[] = [];
    let observations: Observation[] = [];
    let hotspots: { lat: number; lon: number }[] | undefined;
    const adapters: string[] = [];
    /** Set when the country's official source(s) answered nothing: the set is then community sensors only. */
    let officialUnavailable: string | undefined;
    const crowdFor = async (anchors: Observation[], kind: "1h" | "24h" | "none") => {
      const all = await this.crowdAll(warnings);
      if (all.length) adapters.push("crowd.airgradient");
      return this.calibrate(all.filter((o) => o.country === cc), anchors, kind);
    };

    switch (cc) {
      case "SG": {
        observations = sgObservations(await this.sgRaw(warnings));
        adapters.push("sg.nea");
        break;
      }
      case "TH": {
        const aqi = await this.tryGet<unknown>(warnings, "th.air4thai.aqi", URLS.thAqi());
        const stations = aqi ? parseAir4ThaiStations(aqi.data) : [];
        if (stations.length) {
          const hist = await this.tryGet<unknown>(warnings, "th.air4thai.history", air4thaiHistoryUrl(stations.map((s) => s.stationID), now));
          observations = air4thaiObservations(stations, hist ? parseAir4ThaiHistory(hist.data) : {});
          adapters.push("th.air4thai");
        } else officialUnavailable = "PCD Air4Thai";
        for (const o of observations) this.rings.recordOfficial(o, now);
        // Community sensors (coverage-hunt/th.md, Pai): the builder uses them only where no PCD station is within 25 km.
        observations = [...observations, ...(await crowdFor(observations, "1h"))];
        break;
      }
      case "MY": {
        const doe = await this.tryGet<unknown>(warnings, "my.doe", URLS.myDoe());
        let official: Observation[] = [];
        if (doe) {
          official = mergeDoeUpdate(this.prevMy, doeObservations(doe.data), now);
          this.prevMy = official;
          adapters.push("my.doe");
        } else official = mergeDoeUpdate(this.prevMy, [], now);
        if (!official.length) officialUnavailable = "DOE Malaysia";
        for (const o of official) this.rings.recordOfficial(o, now);
        official = official.map((o) => this.rings.withHistory(o));
        observations = [...official, ...(await crowdFor(official, "24h"))];
        break;
      }
      case "ID": {
        const [bmkg, ispu, sip] = await Promise.all([
          this.tryGet<string>(warnings, "id.bmkg", URLS.idBmkg()),
          this.tryGet<unknown>(warnings, "id.klh.ispu", URLS.idIspu()),
          this.tryGet<unknown>(warnings, "id.sipongi", URLS.idSipongi()),
        ]);
        const b = bmkg ? bmkgObservations(bmkg.data, bmkg.fetchedAt) : [];
        if (bmkg && !b.length) warnings.push("id.bmkg: page layout changed (no __NUXT_DATA__ rows); 1-hr values unavailable");
        if (b.length) adapters.push("id.bmkg");
        const k = ispu ? ispuObservations(ispu.data, now) : [];
        if (k.length) adapters.push("id.klh");
        const official = [...b, ...k];
        if (!official.length) officialUnavailable = "BMKG and KLH";
        for (const o of official) this.rings.recordOfficial(o, now);
        const withHist = official.map((o) => this.rings.withHistory(o));
        if (sip) {
          hotspots = sipongiHotspots(sip.data);
          adapters.push("id.sipongi");
        }
        observations = [...withHist, ...(await crowdFor(withHist.filter((o) => o.stationId.startsWith("id.bmkg:")), "1h"))];
        break;
      }
      case "VN": {
        const site = await this.tryGet<unknown>(warnings, "vn.hanoi.site", URLS.vnSite());
        const sites = site ? parseHanoiSites(site.data) : [];
        const recent = sites.filter((s) => {
          const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.aqi_time ?? "");
          return !m || now - Date.parse(`${m[3]}-${m[2]}-${m[1]}T00:00:00+07:00`) < 2 * 24 * HOUR;
        });
        const official: Observation[] = [];
        for (const s of recent) {
          const [stat, aqi] = await Promise.all([
            this.tryGet<unknown>(warnings, "vn.hanoi.stat", URLS.vnStat(s.id)),
            this.tryGet<unknown>(warnings, "vn.hanoi.aqi", URLS.vnAqi(s.id)),
          ]);
          const o = hanoiObservation(s, stat?.data ?? null, aqi?.data ?? null, now);
          if (o) official.push(o);
        }
        if (official.length) adapters.push("vn.hanoi");
        else officialUnavailable = "Hanoi's monitoring centre";
        observations = [...official, ...(await crowdFor(official, "1h"))];
        for (const o of official) this.rings.recordOfficial(o, now);
        break;
      }
      case "PH":
      case "LA":
      case "KH": {
        observations = await crowdFor([], "none");
        break;
      }
      default:
        throw new NoDataForCountry(cc, [`${cc} is not covered (see docs/sea/COVERAGE.md)`]);
    }

    if (!observations.length) throw new NoDataForCountry(cc, warnings);
    return {
      country: cc,
      adapters,
      fetchedAt: new Date(now).toISOString(),
      observations,
      attribution: ATTRIBUTION[cc],
      ...(hotspots ? { hotspots, hotspotSource: SIPONGI_ATTRIBUTION.text.replace(/^Hotspots: /, "") } : {}),
      ...(warnings.length ? { warnings } : {}),
      ...(officialUnavailable ? { officialUnavailable } : {}),
    };
  }
}
