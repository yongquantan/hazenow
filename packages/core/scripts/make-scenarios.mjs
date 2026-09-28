// Builds deterministic QA scenarios from the real 2026-09-28 16:00 SGT capture.
// Output: fixtures/scenarios/<name>.json, raw NEA response shape:
//   { _meta, pm25 (GET /pm25?date=2026-09-28), psi (GET /psi?date=2026-09-28),
//     pm25Yesterday, psiYesterday }  (yesterday = real 2026-09-27 data, for 24 h history)
// Clients should freeze "now" at _meta.now so staleness and ages are reproducible.
// Run: node scripts/make-scenarios.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../fixtures/", import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
const base = {
  pm25: read("pm25-2026-09-28.json"),
  psi: read("psi-2026-09-28.json"),
  pm25Yesterday: read("pm25-2026-09-27.json"),
  psiYesterday: read("psi-2026-09-27.json"),
};
const NOW = "2026-09-28T16:35:00+08:00";
const clone = (x) => JSON.parse(JSON.stringify(x));
const REGIONS = ["north", "south", "east", "west", "central"];

// items are newest first; [0] = 16:00, [1] = 15:00
const hour = (d, i) => d.pm25.data.items[i].readings.pm25_one_hourly;
const setHour = (d, i, vals) => Object.assign(hour(d, i), vals);
const scaleAll = (d, k) => {
  for (const key of ["pm25", "pm25Yesterday"])
    for (const it of d[key].data.items)
      for (const r of REGIONS) {
        const v = it.readings.pm25_one_hourly[r];
        if (typeof v === "number" && v >= 0) it.readings.pm25_one_hourly[r] = Math.max(1, Math.round(v * k));
      }
};

const scenarios = {
  normal: {
    description: "Clear day: everything scaled to 25% of the real capture. West 29, all Normal.",
    make: (d) => scaleAll(d, 0.25),
  },
  elevated: {
    description: "The real capture, unchanged: West 117, South 105, Central 105, East 83, North 49. Elevated.",
    make: () => {},
  },
  high: {
    description: "High band: the real day's PM2.5 × 1.75 (West 205, Central 184, South 184, East 145, North 86). NEA 24-hr PSI left as captured.",
    make: (d) => scaleAll(d, 1.75),
  },
  very_high: {
    description: "Very High band: the real day's PM2.5 × 2.65 (West 310, Central 278, South 278, East 220, North 130). NEA 24-hr PSI left as captured.",
    make: (d) => scaleAll(d, 2.65),
  },
  south_offline: {
    description: "South station offline (-1) in the latest hour. region=south falls back to the island mean 89.",
    make: (d) => setHour(d, 0, { south: -1 }),
  },
  all_offline_stale: {
    description: "Every station -1 in the latest hour: walk back to 15:00 and mark stale.",
    make: (d) => setHour(d, 0, Object.fromEntries(REGIONS.map((r) => [r, -1]))),
  },
  rising_fast: {
    description: "Every region is +25 on the previous hour (e.g. Central 80 → 105).",
    make: (d) => setHour(d, 1, Object.fromEntries(REGIONS.map((r) => [r, hour(d, 0)[r] - 25]))),
  },
  network_error: {
    description: "Simulate the network failing: clients should behave as if every request threw.",
    simulate: "network_error",
    make: null,
  },
};

for (const [name, sc] of Object.entries(scenarios)) {
  const out = { _meta: { scenario: name, description: sc.description, now: NOW, source: "Derived from the real NEA capture of 2026-09-28 16:00 SGT (data.gov.sg)" } };
  if (sc.simulate) out._meta.simulate = sc.simulate;
  if (sc.make) {
    const d = clone(base);
    sc.make(d);
    Object.assign(out, d);
  }
  writeFileSync(new URL(`scenarios/${name}.json`, dir), JSON.stringify(out, null, 1) + "\n");
  console.log("wrote", name);
}
