/** QA r2: embed and share links reopen the place the card shows; a stale embed says the reading is delayed (COPY §19). */
import { describe, expect, test } from "bun:test";
import { embedWords, placeQuery } from "../src/embed";

describe("placeQuery", () => {
  test("the island average links to the island view, not a region", () => {
    expect(placeQuery({ kind: "island" })).toBe("region=island");
  });
  test("regions, areas and countries keep their own links", () => {
    expect(placeQuery({ kind: "region", region: "west" })).toBe("region=west");
    expect(placeQuery({ kind: "area", name: "Choa Chu Kang", point: { lat: 1.38, lon: 103.74 } })).toBe("area=Choa%20Chu%20Kang");
    expect(placeQuery({ kind: "city", country: "TH", id: "bangkok", name: "Bangkok", point: { lat: 13.75, lon: 100.5 } })).toBe("country=th&area=bangkok");
  });
  test("a GPS point is shared as its nearest area, never as coordinates", () => {
    const q = placeQuery({ kind: "gps", point: { lat: 1.35, lon: 103.94 } });
    expect(q).toBe("area=Tampines");
    expect(q).not.toContain("1.35");
  });
});

describe("embedWords", () => {
  const base = { band: "elevated" as const, trend: { delta: 0, direction: "flat" as const }, observedAt: "2026-09-28T15:00:00+08:00" };
  test("fresh: the general verdict and the time with NEA", () => {
    const e = embedWords({ ...base, stale: false });
    expect(e.headline).toBe("Go easy outdoors");
    expect(e.when).toBe("3pm · NEA");
    expect(e.staleLine).toBeNull();
  });
  test("stale: no current guidance, the delayed headline and 'reading from'", () => {
    const e = embedWords({ ...base, stale: true });
    expect(e.headline).toBe("Latest NEA reading is delayed.");
    expect(e.when).toBe("reading from 3pm");
    expect(e.staleLine).toBe("Reading is from 3pm. It may not match the air now.");
  });
});
