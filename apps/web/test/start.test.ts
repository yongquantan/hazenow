/** SPEC v2.1: a saved choice and deep links always win over the device's country guess. */
import { describe, expect, test } from "bun:test";
import { guessCountry } from "hazenow";
import { resolveStart, type Place } from "../src/start";

const bangkok = guessCountry({ timeZone: "Asia/Bangkok", languages: ["th-TH"] });
const london = guessCountry({ timeZone: "Europe/London", languages: ["en-GB"] });
const singapore = guessCountry({ timeZone: "Asia/Singapore", languages: ["en-SG"] });

/** A fake localStorage reader. */
const storage = (data: Record<string, unknown> = {}) => <T,>(key: string, fallback: T): T => (key in data ? (data[key] as T) : fallback);
const start = (query: string, data: Record<string, unknown> = {}, guess = bangkok, embed = false) =>
  resolveStart(new URLSearchParams(query), storage(data), guess, embed);

describe("resolveStart: the guess only applies to a fresh visit", () => {
  test("no link, nothing saved → the guessed place, first run", () => {
    const s = start("");
    expect(s.source).toBe("guess");
    expect(s.firstRun).toBe(true);
    expect(s.where).toMatchObject({ kind: "city", country: "TH", id: "bangkok" });
    expect(s.guess?.country).toBe("TH");
  });

  test("a saved choice wins over the guess", () => {
    const saved: Place = { kind: "area", name: "Tampines", point: { lat: 1.35, lon: 103.94 } };
    const s = start("", { "hn.where": saved });
    expect(s).toMatchObject({ source: "saved", firstRun: false, where: saved, guess: null });
    const savedCity: Place = { kind: "city", country: "MY", id: "penang", name: "Penang", point: { lat: 5.41, lon: 100.33 } };
    expect(start("", { "hn.where": savedCity }).where).toEqual(savedCity);
    expect(start("", { "hn.where": { kind: "island" } }, london).where).toEqual({ kind: "island" });
  });

  test("a pre-v1.4 saved region wins over the guess", () => {
    expect(start("", { "hn.region": "west" })).toMatchObject({ source: "saved", where: { kind: "region", region: "west" } });
  });

  test("?country= (and &area=) wins over the guess and the saved choice", () => {
    const s = start("?country=my&area=penang", { "hn.where": { kind: "island" } });
    expect(s).toMatchObject({ source: "link", firstRun: false, where: { kind: "city", country: "MY", id: "penang" } });
    expect(start("?country=id").where).toMatchObject({ kind: "city", country: "ID", id: "" });
  });

  test("Singapore's own ?area= and ?region= links win over a Thai guess", () => {
    expect(start("?area=Tampines").where).toMatchObject({ kind: "area", name: "Tampines" });
    expect(start("?area=jurong-east").where).toMatchObject({ kind: "area", name: "Jurong East" });
    expect(start("?region=west").where).toEqual({ kind: "region", region: "west" });
    expect(start("?region=island").where).toEqual({ kind: "island" });
    for (const q of ["?area=Tampines", "?region=west", "?region=island"]) expect(start(q)).toMatchObject({ source: "link", firstRun: false, guess: null });
  });

  test("?lat&lon wins (rounded to 2 dp)", () => {
    expect(start("?lat=13.75634&lon=100.50181")).toMatchObject({ source: "link", where: { kind: "gps", point: { lat: 13.76, lon: 100.5 } } });
  });

  test("an unknown link falls through to saved, then the guess", () => {
    expect(start("?area=nowhere-at-all").source).toBe("guess");
    expect(start("?country=zz", { "hn.region": "east" }).source).toBe("saved");
  });

  test("Singapore visitors get exactly the v1.4 island first run", () => {
    expect(start("", {}, singapore)).toMatchObject({ where: { kind: "island" }, firstRun: true });
  });

  test("outside Southeast Asia → Singapore's island view, with the guess kept for the picker hint", () => {
    const s = start("", {}, london);
    expect(s.where).toEqual({ kind: "island" });
    expect(s.guess?.country).toBeNull();
  });

  test("an uncovered country still starts from its own place; boot swaps in the nearest covered city", () => {
    const mm = guessCountry({ timeZone: "Asia/Yangon" });
    expect(start("", {}, mm).where).toMatchObject({ kind: "city", country: "MM", id: "yangon" });
  });

  test("embeds and no-guess (mock) runs keep the island view", () => {
    expect(start("", {}, bangkok, true)).toMatchObject({ where: { kind: "island" }, firstRun: false, guess: null });
    expect(start("", {}, null as never)).toMatchObject({ where: { kind: "island" }, firstRun: true, source: "default" });
  });
});
