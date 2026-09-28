// Run: node --experimental-strip-types src/haze.test.ts   (LIVE=1 also hits data.gov.sg)
import assert from "node:assert/strict";
import * as H from "./haze.ts";

const C = H.FALLBACK_COORDS;
const r = { north: 49, south: 105, west: 117, east: 83, central: 105 };
assert.equal(H.atSpot(r, C, "south").value, 105);
assert.equal(H.bandOf(105), "elevated");
assert.equal(H.instantPsi(105), 153);
assert.equal(H.instantPsi(117), 165);
assert.equal(H.instantPsi(49), 93);
assert.equal(H.bandOf(49), "normal");
const off = H.atSpot({ ...r, south: -1 }, C, "south");
assert.deepEqual([off.value, off.fellBack], [89, true]);
const gps = H.atSpot(r, C, "central", { lat: 1.29587, lon: 103.82 });
assert.deepEqual([gps.value, gps.mode, gps.nearest, gps.blended], [105, "gps", "south", false]);
for (const [c, i] of [[0, 0], [12, 50], [55, 100], [150, 200], [250, 300], [500, 500], [600, 500]]) assert.equal(H.instantPsi(c), i);
// COPY strings
assert.equal(H.verdictLong("elevated"), "OK to be out. Go easy on hard exercise.");
assert.equal(H.verdictShort("high", "kids"), "Indoor play for now");
for (const b of Object.keys(H.VERDICTS) as H.Band[]) for (const p of H.PROFILES) assert.ok(H.verdictShort(b, p).length <= 28);
assert.equal(H.trendPhrase([{ pm25: 71 }, { pm25: 80 }, { pm25: 105 }]).words, "Rising fast: up 34 in 2 hours");
assert.equal(H.trendPhrase([{ pm25: 100 }, { pm25: 108 }]).words, "Rising: up 8 in the last hour");
assert.equal(H.trendPhrase([{ pm25: 100 }, { pm25: 102 }]).words, "Steady over the last hour");
const hist = (vals: number[]) => vals.map((v, i) => ({ time: `2026-09-28T${String(10 + i).padStart(2, "0")}:00:00+08:00`, pm25: v, pm25_24h: null, psi24h: null }));
const hi = H.actionsFor({ band: "high", history: hist([160]) }, "kids");
assert.ok(!hi.some((a) => a.startsWith("Out for hours? An N95")), "no N95 action for kids");
assert.ok(!H.actionsFor({ band: "high", history: hist([160]) }, "general")[0].includes("N95"), "masks never lead");
assert.deepEqual(H.actionsFor({ band: "normal", history: hist([80, 60, 50]) }), ["Air's cleared. Good time to open the windows."]);
for (const b of ["elevated", "high", "very_high"] as H.Band[]) for (const p of H.PROFILES) assert.ok(H.actionsFor({ band: b, history: hist([100]) }, p).length >= 1, `${b}/${p}`);
// v1 → v2 shape + per-region merge (v1 missing south at 15:00, v2 back-filled 106)
const v1 = H.fromV1({ region_metadata: [{ name: "south", label_location: { latitude: 1.29587, longitude: 103.82 } }], items: [
  { timestamp: "2026-09-28T15:00:00+08:00", update_timestamp: "2026-09-28T15:00:59+08:00", readings: { pm25_one_hourly: { north: 53, west: 103, east: 63, central: 80 } } },
  { timestamp: "2026-09-28T16:00:00+08:00", update_timestamp: "2026-09-28T16:00:59+08:00", readings: { pm25_one_hourly: { north: 49, south: 105, west: 117, east: 83, central: 105 } } }] });
const v2 = { items: [{ timestamp: "2026-09-28T15:00:00+08:00", readings: { pm25_one_hourly: { south: 106 } } }] };
const merged = H.buildSnapshot({ pm: [v1, v2], psi: [] }, "south", undefined, new Date("2026-09-28T08:10:00Z"));
assert.deepEqual(merged.history.map((h) => h.pm25), [106, 105]);
assert.equal(merged.publishedAt, "2026-09-28T16:00:59+08:00");
assert.equal(H.verdictLong("high", "outdoor_worker"), "Take regular breaks indoors. Ask about lighter outdoor tasks.");
assert.equal(H.FOR_LABEL.outdoor_worker, "For outdoor work");
assert.deepEqual(H.actionsFor({ band: "elevated", history: hist([100]) }, "outdoor_worker"), ["Take breaks in the shade or indoors, and drink water.", "Ask your supervisor about indoor breaks and lighter tasks."]);
console.log("unit tests ok");

if (process.env.LIVE) {
  void H.fetchRaw().then((raw) => {
    for (const [label, s] of [["west", H.buildSnapshot(raw, "west")], ["gps", H.buildSnapshot(raw, "central", { lat: 1.3521, lon: 103.8198 })]] as const) {
      const c = H.sparkPair(s);
      console.log(`\nLIVE ${label}: ${H.verdictLong(s.band)} | ${H.displayNumber(s)} PM2.5 ${H.BANDS[s.band].label} | ${H.trendPhrase(s.history).words} | ${H.provenance(s)} | ${H.officialLine(s)} | 2nd: ${H.secondLine(s)}`);
      console.log(`  hourly ${c.hourly}\n  24h    ${c.daily}`);
      console.log(`  share: ${H.shareText(s)}`);
    }
  });
}
