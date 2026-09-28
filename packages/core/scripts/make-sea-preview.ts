// Builds the recorded "Preview" ObservationSets for proxied countries from the live captures in fixtures/sea/
// (2026-09-28, 10:27–10:35 UTC). Same composition as services/proxy/src/countries.ts, minus the network.
// Output: fixtures/sea/preview/<cc>.json. Run with Bun: `bun scripts/make-sea-preview.ts`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  AG_ATTRIBUTION,
  BMKG_ATTRIBUTION,
  DOE_ATTRIBUTION,
  HANOI_ATTRIBUTION,
  KLH_ATTRIBUTION,
  SIPONGI_ATTRIBUTION,
  agMapObservations,
  bmkgObservations,
  crowdQc,
  doeObservations,
  hanoiObservation,
  ispuObservations,
  parseHanoiSites,
  sipongiHotspots,
  type Attribution,
  type CountryCode,
  type Observation,
  type ObservationSet,
} from "../src/countries/index";

const FX = new URL("../fixtures/sea/", import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(FX + f, "utf8"));
const text = (f: string) => readFileSync(FX + f, "utf8");
// The capture moment the snapshots are built at (matches the core tests): 17:30 ICT/WIB, 18:30 MYT.
const CAPTURED = Date.parse("2026-09-28T10:30:00Z");

const AG = json("ag-map-sea-2026-09-28T1027Z.json");
const ag = (cc: CountryCode) => crowdQc(agMapObservations(AG, [cc]), CAPTURED);

const set = (country: CountryCode, observations: Observation[], attribution: Attribution[], extra: Partial<ObservationSet> = {}): ObservationSet => ({
  country,
  adapters: ["preview.recorded"],
  fetchedAt: new Date(CAPTURED).toISOString(),
  observations,
  attribution,
  warnings: ["Preview: recorded data from 28 Sep 2026, not live."],
  ...extra,
});

const sites = parseHanoiSites(json("vn-hanoi-site-2026-09-28.json"));
const hanoi = (id: number) =>
  hanoiObservation(sites.find((s) => s.id === id)!, json(`vn-hanoi-dailystat-${id}-2026-09-28T17ICT.json`), json(`vn-hanoi-dailyaqi-${id}-2026-09-28T17ICT.json`), CAPTURED)!;

const sets: Record<string, ObservationSet> = {
  my: set("MY", [...doeObservations(json("my-doe-apims-2026-09-28T18MYT.json")), ...ag("MY")], [DOE_ATTRIBUTION, AG_ATTRIBUTION]),
  id: set(
    "ID",
    [...bmkgObservations(text("id-bmkg-pm25-2026-09-28T17WIB.html"), CAPTURED), ...ispuObservations(json("id-klh-ispu-2026-09-28T17WIB.json"), CAPTURED), ...ag("ID")],
    [BMKG_ATTRIBUTION, KLH_ATTRIBUTION, AG_ATTRIBUTION, SIPONGI_ATTRIBUTION],
    { hotspots: sipongiHotspots(json("id-sipongi-hotspots-2026-09-28.json")), hotspotSource: "SiPongi" },
  ),
  vn: set("VN", [hanoi(48), hanoi(49), ...ag("VN")], [HANOI_ATTRIBUTION, AG_ATTRIBUTION]),
  ph: set("PH", ag("PH"), [AG_ATTRIBUTION]),
  la: set("LA", ag("LA"), [AG_ATTRIBUTION]),
};

mkdirSync(FX + "preview", { recursive: true });
for (const [cc, s] of Object.entries(sets)) {
  writeFileSync(`${FX}preview/${cc}.json`, JSON.stringify(s));
  console.log(cc, s.observations.length, "observations");
}
