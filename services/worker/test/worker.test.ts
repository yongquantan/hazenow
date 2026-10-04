import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fixtureFor, harness as proxyHarness, NOW } from "../../proxy/test/helpers.js";
import { budget, FREE_PLAN, simulateDay } from "../src/budget.js";
import { CROWD_COUNTRIES, JOB_SOURCES, jobsForMinute, runJob, runScheduled, type JobName, type JobState } from "../src/jobs.js";
import { Poller, SOURCES, hanoiPm25Tail, hanoiPm25TailStream, type FetchLike } from "../src/poll.js";
import { clearMemo, handle } from "../src/routes.js";
import { K } from "../src/store.js";
import { endpointLabel, flushUsage, scheduleFlush } from "../src/usage.js";
import { asD1, FakeD1 } from "./d1-shim.js";

const MIN = 60_000;
const HOUR = 3600_000;

type Rule = number | "throw" | ((url: string, now: number) => string | null);

function harness(rules: Record<string, Rule> = {}) {
  const d1 = new FakeD1();
  const env = { DB: asD1(d1) };
  const clock = { now: NOW };
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const rule = rules[new URL(url).hostname];
    if (rule === "throw") throw new TypeError("fetch failed");
    if (typeof rule === "number") return new Response("error", { status: rule, headers: { "retry-after": "120" } });
    const body = typeof rule === "function" ? rule(url, clock.now) : fixtureFor(url);
    if (body === null) return new Response("not found", { status: 404 });
    return new Response(body, { status: 200 });
  };
  const deps = () => ({ fetch, now: clock.now });
  return {
    d1,
    env,
    clock,
    calls,
    rules,
    run: (job: JobName) => runJob(job, env, deps()),
    /** One full cycle: crowd, TH, MY+SG, ID, VN at minutes :30–:34 (from `start`). */
    async cycle(start = clock.now) {
      for (let i = 0; i < 5; i++) {
        clock.now = start + i * MIN;
        await runScheduled(env, deps());
      }
    },
    async get(path: string, ip?: string) {
      const r = await handle({ method: "GET", url: path, ip }, env, { now: clock.now, rateLimitPerMin: ip ? 3 : 0 });
      return { status: r.status, headers: r.headers, body: r.body ? JSON.parse(r.body) : null };
    },
  };
}

/** AirGradient map rows re-stamped `measuredAt = now − 1 min`, so each 5-min poll is a new sample. */
function liveAg(url: string, now: number) {
  const raw = JSON.parse(fixtureFor(url)!);
  for (const r of raw.data) r.measuredAt = new Date(now - MIN).toISOString();
  return JSON.stringify(raw);
}

beforeEach(() => clearMemo());

/* ================================================================== schedule and budget */

describe("schedule and free-plan budget", () => {
  test("one job per minute, each every 5 minutes", () => {
    const at = (m: number) => Date.parse(`2026-09-30T08:${String(m).padStart(2, "0")}:00Z`);
    expect([0, 1, 2, 3, 4, 5, 57].map((m) => jobsForMinute(at(m)).join("+"))).toEqual(["crowd", "TH", "MY+SG", "ID", "VN", "crowd", "MY+SG"]);
  });
  test("upstream calls per day are fixed by the schedule and inside every source's hourly budget", () => {
    const perDay = simulateDay();
    for (const [id, n] of Object.entries(perDay)) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(SOURCES[id].budgetPerHour * 24);
    }
    const b = budget();
    expect(b.upstreamCallsPerDayBySource).toEqual(perDay); // src/budget-data.json is current (`bun run budget`)
    expect(b.cronInvocationsPerDay).toBe(1440);
    expect(b.cronInvocationsPerDay).toBeLessThan(FREE_PLAN.requestsPerDay * 0.02);
    expect(b.upstreamCallsPerDay).toBeLessThan(3000);
    expect(perDay["crowd.airgradient"]).toBe(288);
  });
  test("the world-dump fallback is not polled (its 1.5 MB lenient parse does not fit 10 ms CPU)", () => {
    expect(Object.values(JOB_SOURCES).flat()).not.toContain("crowd.airgradient.world");
  });
});

/* ================================================================== routes after one cron cycle */

describe("same API as services/proxy, from D1", () => {
  test("every served country answers after one cycle; same stations as the proxy", async () => {
    const h = harness();
    await h.cycle();
    const p = proxyHarness();
    for (const cc of ["th", "my", "id", "vn", "ph", "la", "kh", "sg"]) {
      const w = await h.get(`/v1/${cc}/observations`);
      const x = await p.get(`/v1/${cc}/observations`);
      expect(w.status).toBe(200);
      expect(w.headers["access-control-allow-origin"]).toBe("*");
      expect(w.body.country).toBe(cc.toUpperCase());
      expect(Object.keys(w.body).filter((k) => k !== "warnings")).toEqual(Object.keys(x.body).filter((k) => k !== "warnings"));
      const ids = (b: { observations: { stationId: string }[] }) => b.observations.map((o) => o.stationId).sort();
      expect(ids(w.body)).toEqual(ids(x.body));
      expect(w.body.attribution).toEqual(x.body.attribution);
      expect(w.body.adapters.sort()).toEqual(x.body.adapters.sort());
    }
  });
  test("/v1/th/observations: 173 Air4Thai stations + Thai community sensors; ?grade=lowcost", async () => {
    const h = harness();
    await h.cycle();
    const r = await h.get("/v1/th/observations");
    expect(r.body.observations.filter((o: { grade: string }) => o.grade === "reference")).toHaveLength(173);
    expect(r.body.observations.filter((o: { grade: string }) => o.grade === "lowcost").length).toBeGreaterThan(150);
    expect(r.headers["cache-control"]).toContain("max-age=30");
    const low = await h.get("/v1/th/observations?grade=lowcost");
    expect(low.body.observations.every((o: { grade: string }) => o.grade === "lowcost")).toBe(true);
    expect(low.body.attribution.map((a: { id: string }) => a.id).sort()).toEqual(["crowd.airgradient", "crowd.sensorcommunity"]);
    const lowMy = await h.get("/v1/my/observations?grade=lowcost");
    expect(lowMy.body.observations.every((o: { grade: string }) => o.grade === "lowcost")).toBe(true);
    expect((await h.get("/v1/th/observations?grade=reference")).status).toBe(400);
  });
  test("snapshots: Pai community estimate, Bangkok official, KL, Siem Reap, SG; coordinates rounded", async () => {
    const h = harness();
    await h.cycle();
    const pai = await h.get("/v1/th/snapshot?lat=19.3587&lon=98.44");
    expect(pai.body.snapshot.pm25Kind).toBe("crowd_estimate");
    const bkk = await h.get("/v1/th/snapshot?lat=13.756312&lon=100.501789&profile=kids");
    expect(bkk.body.snapshot.pm25Kind).toBe("official_1h");
    expect(bkk.body.location).toEqual({ lat: 13.76, lon: 100.5, rounded: "2dp" });
    const kl = await h.get("/v1/my/snapshot?lat=3.139&lon=101.6869");
    expect(kl.body.snapshot.localBand.scaleId).toBe("my_api");
    const sr = await h.get("/v1/kh/snapshot?lat=13.3671&lon=103.8448");
    expect(sr.body.snapshot.stations.map((s: { stationId: string }) => s.stationId)).toContain("sc:51718789");
    const idp = await h.get("/v1/auto/snapshot?lat=-2.2161&lon=113.9135");
    expect(idp.body.snapshot.country).toBe("ID");
    expect(idp.body.snapshot.hotspots.count).toBeGreaterThanOrEqual(0);
    expect((await h.get("/v1/sg/snapshot?lat=1.33&lon=103.74")).body.snapshot.country).toBe("SG");
    expect((await h.get("/v1/sg/snapshot?lat=1.4655&lon=103.7578")).status).toBe(409);
    expect((await h.get("/v1/mm/observations")).status).toBe(404);
  });
  test("/health, index, 404/405/OPTIONS, NEA mirror, rate limit; every JSON body has attribution", async () => {
    const h = harness();
    await h.cycle();
    const hl = await h.get("/health");
    expect(hl.status).toBe(200);
    expect(hl.body.ok).toBe(true);
    expect(Object.keys(hl.body.sources).sort()).toEqual(Object.values(JOB_SOURCES).flat().sort());
    expect(hl.body.sources["my.doe"].ok).toBe(true);
    expect(hl.body.jobs.crowd.runs).toBe(1);
    expect(hl.body.budget.cronInvocationsPerDay).toBe(1440);
    for (const p of ["/", "/health", "/v1/countries", "/v1/scales", "/v1/xx/observations", "/nope", "/v1/sg/nea/pm25", "/v1/sensors/ag:1/uptime", "/v1/sensors/bad/uptime"]) {
      const r = await h.get(p);
      expect(r.headers["access-control-allow-origin"]).toBe("*");
      expect(Array.isArray(r.body.attribution)).toBe(true);
    }
    expect((await h.get("/v1/sg/nea/pm25")).body.data.items.length).toBeGreaterThan(0);
    expect((await h.get("/v1/sg/nea/pm25?date=28-09-2026")).status).toBe(400);
    const pre = await handle({ method: "OPTIONS", url: "/v1/th/observations" }, h.env);
    expect(pre.status).toBe(204);
    expect((await handle({ method: "POST", url: "/health" }, h.env)).status).toBe(405);
    for (let i = 0; i < 3; i++) expect((await h.get("/v1/countries", "1.2.3.4")).status).toBe(200);
    expect((await h.get("/v1/countries", "1.2.3.4")).status).toBe(429);
  });
  test("before the first cron run: 503 with Retry-After, never an upstream call", async () => {
    const h = harness();
    const r = await h.get("/v1/my/observations");
    expect(r.status).toBe(503);
    expect(r.headers["retry-after"]).toBe("60");
    expect(h.calls).toHaveLength(0);
  });
});

/* ================================================================== upstream discipline */

describe("upstream budget, TTLs, failures", () => {
  test("user traffic never reaches an upstream", async () => {
    const h = harness();
    await h.cycle();
    const n = h.calls.length;
    await Promise.all(Array.from({ length: 300 }, (_, i) => h.get(`/v1/${["th", "my", "id", "vn"][i % 4]}/observations`)));
    await h.get("/v1/th/snapshot?lat=13.75&lon=100.5");
    expect(h.calls.length).toBe(n);
  });
  test("a job inside its sources' TTLs makes no upstream call", async () => {
    const h = harness();
    await h.run("MY"); // 10:30 UTC = 18:30 MYT: DOE's slow phase (20 min)
    const n = h.calls.length;
    h.clock.now += 5 * MIN;
    await h.run("MY");
    expect(h.calls.length).toBe(n);
    h.clock.now += 20 * MIN;
    await h.run("MY");
    expect(h.calls.length).toBe(n + 1);
  });
  test("a failing source keeps the last set with the proxy's stale warning, and backs off", async () => {
    const h = harness();
    await h.cycle();
    h.rules["eqms.doe.gov.my"] = 500;
    h.clock.now += 30 * MIN;
    await h.run("MY");
    const r = await h.get("/v1/my/observations");
    expect(r.status).toBe(200);
    expect(r.body.observations.some((o: { grade: string }) => o.grade === "reference")).toBe(true);
    expect(r.body.warnings.join(" ")).toMatch(/my\.doe: HTTP 500; serving data fetched \d+ min ago/);
    const st = h.d1.q<{ v: string }>("SELECT v FROM kv WHERE k = 'job:MY'")[0];
    expect((JSON.parse(st.v) as JobState).sources["my.doe"].blockedUntil).toBeGreaterThan(h.clock.now);
    // After mergeDoeUpdate's 2 h 15 min, DOE is reported unavailable (community sensors only), as the proxy does.
    h.clock.now += 3 * HOUR;
    await h.run("crowd");
    h.clock.now += MIN;
    await h.run("MY");
    clearMemo();
    const later = await h.get("/v1/my/observations");
    expect(later.body.officialUnavailable).toBe("DOE Malaysia");
    expect(later.body.observations.every((o: { grade: string }) => o.grade === "lowcost")).toBe(true);
    expect(later.body.warnings).toContain("my.doe: HTTP 500; nothing cached");
  });
  test("allow-list: a URL on another host throws before any I/O", async () => {
    let called = false;
    const p = new Poller({}, async () => ((called = true), new Response("{}")), NOW);
    await expect(p.fetch("my.doe", "https://evil.example.com/x")).rejects.toThrow(/not allow-listed/);
    await expect(p.fetch("my.doe", "http://eqms.doe.gov.my/x")).rejects.toThrow(/not allow-listed/);
    expect(called).toBe(false);
  });
  test("Hanoi's 2.3 MB dailystat: the PM2.5 tail is cut from the text, same as parsing it all", () => {
    const text = readFileSync(new URL("../../../packages/core/fixtures/sea/vn-hanoi-dailystat-48-2026-09-28T17ICT.json", import.meta.url), "utf8");
    const full = (JSON.parse(text) as Record<string, unknown[]>)["PM2.5"];
    expect(hanoiPm25Tail(text)["PM2.5"]).toEqual(full.slice(-600));
    expect(hanoiPm25Tail(text, 5)["PM2.5"]).toEqual(full.slice(-5));
    expect(hanoiPm25Tail('{"PM10":[]}')["PM2.5"]).toEqual([]);
  });
  test("…and streamed in small chunks, stopping when the PM2.5 array closes", async () => {
    const text = readFileSync(new URL("../../../packages/core/fixtures/sea/vn-hanoi-dailystat-48-2026-09-28T17ICT.json", import.meta.url), "utf8");
    const full = (JSON.parse(text) as Record<string, unknown[]>)["PM2.5"];
    const bytes = new TextEncoder().encode(text);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= bytes.length) return c.close();
        c.enqueue(bytes.slice(sent, sent + 997));
        sent += 997;
      },
    });
    expect((await hanoiPm25TailStream(stream))["PM2.5"]).toEqual(full.slice(-600));
    expect((await hanoiPm25TailStream(stream2(text), 50))["PM2.5"]).toEqual(full.slice(-50));
  });
});

/* ================================================================== hourly sensor log, uptime, retention */

describe("hourly sensor logging in D1", () => {
  test("one row per sensor per hour: 3-dp coordinates, network, pm25, RH, fresh", async () => {
    const h = harness({ "map-data-int.airgradient.com": liveAg });
    const start = Date.parse("2026-09-28T10:00:00Z");
    for (let t = start; t <= start + HOUR; t += 5 * MIN) {
      h.clock.now = t;
      await h.run("crowd");
    }
    const rows = h.d1.q<{ id: string; hour: number; network: string; lat: number; lon: number; pm25: number | null; rh: number | null; n: number; fresh: number; country: string }>(
      "SELECT * FROM sensor_hours WHERE hour = ?1",
      (start + HOUR) / 1000,
    );
    expect(rows.length).toBeGreaterThan(300);
    expect(rows.every((r) => Math.round(r.lat * 1000) / 1000 === r.lat && Math.round(r.lon * 1000) / 1000 === r.lon)).toBe(true);
    expect(rows.every((r) => CROWD_COUNTRIES.includes(r.country as never))).toBe(true);
    const sc = rows.find((r) => r.id === "sc:51718789")!; // Siem Reap, Sensor.Community
    expect(sc.network).toBe("sensor.community");
    expect(sc.country).toBe("KH");
    expect(sc.fresh).toBe(1);
    expect(sc.n).toBe(12);
    expect(sc.rh).toBe(67.9);
    const ag = rows.find((r) => r.id.startsWith("ag:") && r.rh !== null)!;
    expect(ag.network).toBe("airgradient");
    // No duplicate rows when the hour is closed again.
    await h.run("crowd");
    expect(h.d1.q("SELECT COUNT(*) AS n FROM sensor_hours")[0]).toEqual({ n: rows.length + h.d1.q<{ n: number }>("SELECT COUNT(*) AS n FROM sensor_hours WHERE hour = ?1", start / 1000)[0].n });
  });
  test("/v1/sensors/{id}/uptime: 7/30-day uptime and median agreement with the nearest official station", async () => {
    const h = harness();
    await h.cycle();
    const now = h.clock.now;
    const end = Math.floor(now / HOUR) * HOUR;
    // 48 h of a Bangkok-area sensor, fresh 3 hours in 4, reading 1.2× the nearest PCD station.
    const th = JSON.parse(h.d1.q<{ v: string }>("SELECT v FROM kv WHERE k = 'job:TH'")[0].v) as JobState;
    const [sid, slat, slon] = th.stations!.find((s) => s[3] === "1h")!;
    for (let i = 0; i < 48; i++) {
      const hour = (end - i * HOUR) / 1000;
      const fresh = i % 4 === 3 ? 0 : 1;
      h.d1.q("INSERT INTO sensor_hours VALUES ('ag:999', ?1, 'airgradient', 'TH', ?2, ?3, ?4, 70, ?5, ?6)", hour, slat + 0.01, slon, 24, fresh ? 12 : 2, fresh);
      h.d1.q("INSERT OR REPLACE INTO station_hours VALUES (?1, ?2, 'TH', 20, 22)", sid, hour);
    }
    h.d1.q("UPDATE kv SET v = json_set(v, '$.since', ?1) WHERE k = 'crowd:state'", end - 47 * HOUR);
    const r = await h.get("/v1/sensors/ag:999/uptime");
    expect(r.status).toBe(200);
    expect(r.body.uptime.last7d.hours).toBe(48);
    expect(r.body.uptime.last7d.freshHours).toBe(36);
    expect(r.body.uptime.last7d.uptime).toBe(0.75);
    expect(r.body.agreement.station).toBe(sid);
    expect(r.body.agreement.distanceKm).toBeLessThan(2);
    expect(r.body.agreement.last7d.medianRatio).toBe(1.2);
    expect(r.body.agreement.last7d.medianAbsDiff).toBe(4);
    expect(r.body.attribution.map((a: { id: string }) => a.id)).toEqual(["crowd.airgradient"]);
    expect((await h.get("/v1/sensors/ag:424242/uptime")).status).toBe(404);
    expect((await h.get("/v1/sensors/../uptime")).status).toBe(404);
  });
  test("official stations are logged hourly (writes only when a value is new or revised)", async () => {
    const h = harness();
    await h.cycle();
    const n = h.d1.q<{ n: number }>("SELECT COUNT(*) AS n FROM station_hours")[0].n;
    expect(n).toBeGreaterThan(300); // TH 173 + MY + ID + VN
    expect(h.d1.q<{ c: string }>("SELECT DISTINCT country AS c FROM station_hours ORDER BY c").map((r) => r.c)).toEqual(["ID", "MY", "TH", "VN"]);
  });
  test("retention: rows older than 90 days go at the 19:00 UTC close; newer stay", async () => {
    const h = harness();
    const close = Date.parse("2026-09-28T19:00:00Z");
    const old = (close - 91 * 24 * HOUR) / 1000;
    const kept = (close - 89 * 24 * HOUR) / 1000;
    for (const t of [old, kept]) {
      h.d1.q("INSERT INTO sensor_hours VALUES ('ag:777777777', ?1, 'airgradient', 'TH', 0, 0, 1, NULL, 12, 1)", t);
      h.d1.q("INSERT INTO station_hours VALUES ('th.pcd:x', ?1, 'TH', 1, 1)", t);
    }
    h.clock.now = close - 5 * MIN;
    await h.run("crowd");
    expect(h.d1.q("SELECT hour FROM sensor_hours WHERE id = 'ag:777777777'")).toHaveLength(2);
    h.clock.now = close;
    await h.run("crowd");
    expect(h.d1.q<{ hour: number }>("SELECT hour FROM sensor_hours WHERE id = 'ag:777777777'").map((r) => r.hour)).toEqual([kept]);
    expect(h.d1.q<{ hour: number }>("SELECT hour FROM station_hours").map((r) => r.hour)).toEqual([kept]);
  });
});

/* ================================================================== calibration and privacy */

describe("calibration and privacy", () => {
  test("Thai sensors near a PCD station are calibrated once per closed hour", async () => {
    // Sensors at 20 µg/m³, PCD stations at 25 µg/m³ every hour → k = 1.25 wherever a station is within 10 km.
    const h = harness({
      "map-data-int.airgradient.com": (url, now) => {
        const raw = JSON.parse(liveAg(url, now));
        for (const r of raw.data) r.pm25 = 20;
        return JSON.stringify(raw);
      },
      "air4thai.pcd.go.th": (url) => {
        const body = fixtureFor(url)!;
        if (!url.includes("getHistoryData")) return body;
        const raw = JSON.parse(body);
        for (const st of raw.stations) for (const d of st.data) d.PM25 = 25;
        return JSON.stringify(raw);
      },
    });
    const start = Date.parse("2026-09-28T03:00:00Z");
    for (let t = start; t < start + 7 * HOUR; t += 5 * MIN) {
      h.clock.now = t;
      await h.run("crowd");
      h.clock.now = t + MIN;
      await h.run("TH");
    }
    const st = JSON.parse(h.d1.q<{ v: string }>("SELECT v FROM kv WHERE k = 'job:TH'")[0].v) as JobState;
    expect(st.calib!.hour).toBe(start + 7 * HOUR - HOUR);
    expect(Object.keys(st.calib!.k).length).toBeGreaterThan(10);
    expect(Object.values(st.calib!.k).every(([k, qc]) => k === 1.25 && qc === "ok")).toBe(true);
    const r = await h.get("/v1/th/observations");
    const cal = r.body.observations.filter((o: { k?: number | null }) => o.k === 1.25);
    expect(cal.length).toBe(Object.keys(st.calib!.k).length);
    expect(cal.every((o: { pm25_now: number }) => o.pm25_now === 25)).toBe(true);
  });
  test("no console logging in the Worker (no IPs, no query strings, no coordinates)", () => {
    const dir = new URL("../src/", import.meta.url).pathname;
    for (const f of readdirSync(dir)) expect(readFileSync(dir + f, "utf8")).not.toMatch(/console\./);
  });
});

describe("aggregate usage counters (no identifiers)", () => {
  const TOKEN = "t".repeat(40);
  async function call(env: { DB: D1Database; STATS_TOKEN?: string }, path: string, o: { method?: string; country?: string; auth?: string; now?: number } = {}) {
    const r = await handle({ method: o.method ?? "GET", url: path, ip: "203.0.113.9", country: o.country, authorization: o.auth }, env, { now: o.now ?? NOW, rateLimitPerMin: 0 });
    return { status: r.status, headers: r.headers, body: r.body ? JSON.parse(r.body) : null };
  }

  test("endpoint labels are fixed strings, never values from the URL", () => {
    expect(endpointLabel("/v1/sg/observations")).toBe("sg/observations");
    expect(endpointLabel("/v1/auto/snapshot")).toBe("auto/snapshot");
    expect(endpointLabel("/v1/sensors/ag:12345/uptime")).toBe("sensors/uptime");
    expect(endpointLabel("/v1/sg/nea/pm25")).toBe("sg/nea/pm25");
    expect(endpointLabel("/v1/zz/observations")).toBe("other");
    expect(endpointLabel("/v1/anything/else/1.3521,103.8198")).toBe("other");
    expect(endpointLabel("/health")).toBeNull();
    expect(endpointLabel("/v1/hit")).toBeNull();
    expect(endpointLabel("/v1/stats")).toBeNull();
  });

  test("/v1/* requests and share landings are counted per day and country; /v1/stats needs the bearer token", async () => {
    const d1 = new FakeD1();
    const env = { DB: asD1(d1), STATS_TOKEN: TOKEN };
    await call(env, "/v1/countries", { country: "SG" });
    await call(env, "/v1/countries", { country: "SG" });
    await call(env, "/v1/sg/observations", { country: "MY" });
    await call(env, "/v1/auto/snapshot?lat=1.3521&lon=103.8198", { country: "SG" });
    await call(env, "/v1/sensors/ag:999/uptime", {});
    await call(env, "/health", { country: "SG" }); // not /v1: not counted
    let r = await call(env, "/v1/hit?e=share_landing&card=now", { method: "POST", country: "SG" });
    expect(r.status).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe("*");
    await call(env, "/v1/hit?e=share_landing&card=clocks", { country: "TH" });
    expect((await call(env, "/v1/hit?e=share_landing&card=1.35,103.8", { method: "POST" })).status).toBe(400);
    expect((await call(env, "/v1/hit?e=pageview&card=now", { method: "POST" })).status).toBe(400);
    expect((await call(env, "/v1/countries", { method: "POST" })).status).toBe(405);

    expect((await call(env, "/v1/stats")).status).toBe(401);
    expect((await call(env, "/v1/stats", { auth: "Bearer wrong" })).status).toBe(401);
    expect((await call({ DB: env.DB }, "/v1/stats", { auth: `Bearer ${TOKEN}` })).status).toBe(404); // no secret set
    r = await call(env, "/v1/stats?days=7", { auth: `Bearer ${TOKEN}` });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const day = new Date(NOW).toISOString().slice(0, 10);
    expect(r.body.totals).toMatchObject({ requests: 5, shareLandings: 2 });
    expect(r.body.usage).toEqual([
      { day, total: 5, countries: { SG: 3, MY: 1, XX: 1 }, endpoints: { countries: 2, "sg/observations": 1, "auto/snapshot": 1, "sensors/uptime": 1 } },
    ]);
    expect(r.body.shareLandings).toEqual([{ day, total: 2, cards: { now: 1, clocks: 1 }, countries: { SG: 1, TH: 1 } }]);

    // What's stored: only day, country, a fixed label or card, and a count. No IP, no coordinates, no sensor id.
    const dump = JSON.stringify([d1.q("SELECT * FROM usage_daily"), d1.q("SELECT * FROM share_landings")]);
    expect(dump).not.toMatch(/203\.0\.113|1\.35|103\.8|ag:999/);
    expect(Object.keys(d1.q("SELECT * FROM usage_daily")[0]).sort()).toEqual(["country", "day", "endpoint", "n"]);
  });

  test("writes are batched: one upsert per key, scheduled once per isolate", async () => {
    const d1 = new FakeD1();
    const env = { DB: asD1(d1) };
    for (let i = 0; i < 50; i++) await call(env, "/v1/countries", { country: "SG" });
    const p = scheduleFlush(env.DB, 1);
    expect(p).not.toBeNull();
    expect(scheduleFlush(env.DB, 1)).toBeNull(); // already pending
    await p;
    expect(d1.q("SELECT n FROM usage_daily")).toEqual([{ n: 50 }]);
    await call(env, "/v1/countries", { country: "SG" });
    await flushUsage(env.DB);
    expect(d1.q("SELECT n FROM usage_daily")).toEqual([{ n: 51 }]);
  });
});

function stream2(text: string) {
  return new Response(text).body;
}

void K;
