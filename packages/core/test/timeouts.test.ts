/**
 * Upstream timeouts and official-source fallbacks (Air4Thai's certificate renewal, 30 Sep 2026, hung live Bangkok ~30 s).
 * Air4Thai is made to fail two ways: a fetch that rejects, and one that never answers.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getSnapshot, TimeoutError, UPSTREAM_TIMEOUT_MS, withTimeout, clearCache } from "../src/index";
import {
  OfficialUnavailableError,
  PREVIEW_CAPTURED_AT,
  buildCountrySnapshot,
  cachedCountrySnapshot,
  countryDisplay,
  countryVerdict,
  createThAdapter,
  findCity,
  officialDownCopy,
  placeQuery,
  proxiedAdapter,
  type FetchLike,
  type ObservationSet,
} from "../src/countries/index";

const FX = new URL("../fixtures/sea/", import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(FX + f, "utf8"));
const NOW = Date.parse(PREVIEW_CAPTURED_AT);
const preview: ObservationSet = json("preview/th.json");
const crowdBody = { ...preview, observations: preview.observations.filter((o) => o.grade === "lowcost"), attribution: preview.attribution.slice(1) };
const aqi = json("th-air4thai-aqi-2026-09-28T17ICT.json");
const hist = json("th-air4thai-history-2026-09-28T17ICT.json");

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
/** Never answers, and ignores its abort signal (the worst case). */
const hang = () => new Promise<never>(() => {});
type Mode = "ok" | "reject" | "hang";
function fakeFetch(air4thai: Mode, opts: { history?: Mode; proxy?: Mode } = {}): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const mode = url.includes("getAQI_JSON") ? air4thai : url.includes("getHistoryData") ? opts.history ?? "ok" : opts.proxy ?? "ok";
    if (mode === "reject") throw new TypeError("certificate has expired");
    if (mode === "hang") return hang();
    return ok(url.includes("getAQI_JSON") ? aqi : url.includes("getHistoryData") ? hist : crowdBody);
  }) as FetchLike & { calls: string[] };
  f.calls = calls;
  return f;
}
const th = createThAdapter();
const bangkok = findCity("bangkok", "TH")!;
const PROXY = "https://edge.example";

describe("withTimeout", () => {
  test("default is ~8 s", () => expect(UPSTREAM_TIMEOUT_MS).toBe(8_000));
  test("a hanging fetch (even one that ignores its signal) rejects with TimeoutError, quickly", async () => {
    const t0 = Date.now();
    await expect(withTimeout(hang, 30)("https://x.example/")).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  test("it aborts the underlying request, and a caller's own abort still wins", async () => {
    let seen: AbortSignal | undefined;
    const f = (_: string, init?: { signal?: AbortSignal }) => {
      seen = init?.signal;
      return new Promise<never>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    await expect(withTimeout(f, 20)("u")).rejects.toBeInstanceOf(TimeoutError);
    expect(seen?.aborted).toBe(true);
    const ctl = new AbortController();
    const p = withTimeout(f, 5_000)("u", { signal: ctl.signal });
    ctl.abort(new Error("user left"));
    await expect(p).rejects.toThrow(/aborted|user left/);
  });
  test("answers and errors pass straight through", async () => {
    expect(await withTimeout(async () => 42, 50)("u")).toBe(42);
    await expect(withTimeout(async () => Promise.reject(new TypeError("boom")), 50)("u")).rejects.toThrow("boom");
  });
});

describe("Thailand: Air4Thai fails → in-country community sensors, else the cache", () => {
  for (const mode of ["reject", "hang"] as const) {
    test(`Air4Thai ${mode}s: Bangkok falls back to community sensors, labelled`, async () => {
      const t0 = Date.now();
      const s = await th.getSnapshot(placeQuery(bangkok), { fetch: fakeFetch(mode), now: NOW, proxyBase: PROXY, timeoutMs: 40 });
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(s.pm25Kind).toBe("crowd_estimate");
      expect(s.notes).toContain("official_unavailable");
      expect(s.stations.every((x) => x.grade === "lowcost" && x.distanceKm! <= 25)).toBe(true);
      expect(s.nearest!.distanceKm!).toBeLessThanOrEqual(10); // the existing 10 km rule
      expect(countryDisplay(s).notices).toEqual([]); // not "no official station within 25 km": they exist, they just aren't answering
      const d = countryDisplay(s, { placeName: "Bangkok" });
      expect(d.kindLabel).toBe("Community sensors · estimate");
      expect(d.numberSub).toBe("Thailand's official data isn't responding right now · community sensors estimate");
      // The headline is the verdict for the estimate, never "No official reading near here."
      expect(s.bandFromEstimate).toBe(true);
      expect(countryVerdict(s).headline).toMatch(/^Estimate: /);
      expect(d.chip?.estimate).toBe(true);
    });
  }

  test("no community sensor in range (Kanchanaburi) → OfficialUnavailableError, never a far sensor", async () => {
    const k = findCity("kanchanaburi", "TH")!;
    const err = await th.getSnapshot(placeQuery(k), { fetch: fakeFetch("reject"), now: NOW, proxyBase: PROXY, timeoutMs: 40 }).catch((e) => e);
    expect(err).toBeInstanceOf(OfficialUnavailableError);
    expect(err.source).toBe("PCD Air4Thai");
  });

  test("no proxy, or the proxy also hangs → OfficialUnavailableError within the timeout", async () => {
    for (const ctx of [{ fetch: fakeFetch("hang") }, { fetch: fakeFetch("reject", { proxy: "hang" }), proxyBase: PROXY }]) {
      const t0 = Date.now();
      await expect(th.getSnapshot(placeQuery(bangkok), { ...ctx, now: NOW, timeoutMs: 40 })).rejects.toBeInstanceOf(OfficialUnavailableError);
      expect(Date.now() - t0).toBeLessThan(2000);
    }
  });

  test("the station list answers but the hourly history hangs: sensors fill in, labelled; the Thai AQI row stays", async () => {
    const s = await th.getSnapshot(placeQuery(bangkok), { fetch: fakeFetch("ok", { history: "hang" }), now: NOW, proxyBase: PROXY, timeoutMs: 40 });
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.notes).toContain("official_unavailable");
    expect(s.official?.agency).toBe("PCD");
  });

  test("Air4Thai healthy: official wins in Bangkok, no fallback label", async () => {
    const s = await th.getSnapshot(placeQuery(bangkok), { fetch: fakeFetch("ok"), now: NOW, proxyBase: PROXY, timeoutMs: 1000 });
    expect(s.pm25Kind).toBe("official_1h");
    expect(s.notes).not.toContain("official_unavailable");
    expect(countryDisplay(s).kindLabel).toBe("Official reading");
  });
});

describe("generic: any country's official source failing", () => {
  test("a proxied set flagged officialUnavailable (DOE down): KL shows its sensors, labelled; JB-style places with none throw", () => {
    const my: ObservationSet = json("preview/my.json");
    const crowdOnly = { ...my, observations: my.observations.filter((o) => o.grade === "lowcost"), officialUnavailable: "DOE Malaysia" };
    const kl = buildCountrySnapshot(crowdOnly, placeQuery(findCity("kuala-lumpur", "MY")!), NOW);
    expect(kl.pm25Kind).toBe("crowd_estimate");
    expect(countryDisplay(kl).numberSub).toBe("Malaysia's official data isn't responding right now · community sensors estimate");
    expect(countryVerdict(kl).headline).toMatch(/^Estimate: /);
    expect(() => buildCountrySnapshot(crowdOnly, placeQuery(findCity("ipoh", "MY")!), NOW)).toThrow(OfficialUnavailableError);
  });

  test("the proxy itself hangs → the proxied adapter gives up within the timeout", async () => {
    const t0 = Date.now();
    await expect(proxiedAdapter("MY", { kind: "mixed" }).fetchObservations({ proxyBase: PROXY, fetch: hang, timeoutMs: 40 })).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test("Singapore: NEA v1 and v2 both hanging → a quick FetchError, not a 30 s wait", async () => {
    clearCache();
    const t0 = Date.now();
    await expect(getSnapshot({ fetch: hang as never, now: NOW, timeoutMs: 40, retryDelayMs: 0 })).rejects.toThrow(/Could not reach data.gov.sg/);
    expect(Date.now() - t0).toBeLessThan(2000);
    clearCache();
  });
});

describe("stale cache: what the client shows when the live fetch fails", () => {
  const cached = buildCountrySnapshot(preview, placeQuery(bangkok), NOW); // official 17:00 ICT reading
  test("a cached snapshot is re-judged for staleness at the time it's shown", () => {
    expect(cached.stale).toBe(false);
    expect(cachedCountrySnapshot(cached, NOW + 30 * 60_000).stale).toBe(false);
    expect(cachedCountrySnapshot(cached, NOW + 3 * 3600_000).stale).toBe(true);
    expect(cachedCountrySnapshot(cached, NOW).pm25).toBe(cached.pm25);
  });
  test("copy: the calm can't-reach state, and the cached line with the reading's time and age (COPY §10)", () => {
    const none = officialDownCopy("TH");
    expect(none.title).toBe("Can't reach Thailand's official data right now");
    expect(none.line).toBe("We'll try again in a few minutes.");
    expect(none.cachedLine).toBeNull();
    const c = officialDownCopy("TH", cached.observedAt, Date.parse(cached.observedAt) + 95 * 60_000, 7);
    expect(c.cachedLine).toBe("Can't reach Thailand's official data right now. Showing the last reading we got, from 5pm (1 hr ago).");
    expect(officialDownCopy("PH").title).toBe("Can't reach the Philippines' official data right now");
  });
});
