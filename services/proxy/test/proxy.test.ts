import { describe, expect, test } from "bun:test";
import net from "node:net";
import { MemoryCache, RedisCache } from "../src/cache.js";
import { coarse } from "../src/app.js";
import { RedisClient, encodeCommand, parseResp } from "../src/redis.js";
import { Rings } from "../src/rings.js";
import { SOURCES, TOTAL_BUDGET_PER_HOUR, type SourceDef } from "../src/sources.js";
import { chainFixedFetch } from "../src/tls-fetch.js";
import { Upstreams, UpstreamError, backoffMs, type FetchImpl } from "../src/upstream.js";
import type { Observation } from "../../../packages/core/src/countries/index.js";
import { NOW, harness } from "./helpers.js";

const MIN = 60_000;

/* ================================================================== routes */

describe("routes, CORS, attribution", () => {
  test("/health: per-source status, fixed budget, attribution", async () => {
    const h = harness();
    const r = await h.get("/health");
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe("*");
    expect(r.body.budget.maxUpstreamCallsPerHour).toBe(TOTAL_BUDGET_PER_HOUR);
    expect(TOTAL_BUDGET_PER_HOUR).toBeLessThanOrEqual(200);
    expect(Object.keys(r.body.sources)).toEqual(Object.keys(SOURCES));
    expect(r.body.attribution.length).toBeGreaterThanOrEqual(7);
    expect(r.body.cache.kind).toBe("memory");
  });
  test("OPTIONS preflight, 404, 405, index", async () => {
    const h = harness();
    const pre = await h.handle({ method: "OPTIONS", url: "/v1/th/observations" });
    expect(pre.status).toBe(204);
    expect(pre.headers["access-control-allow-methods"]).toContain("GET");
    const nf = await h.get("/nope");
    expect(nf.status).toBe(404);
    expect(nf.body.attribution).toBeDefined();
    expect((await h.handle({ method: "POST", url: "/health" })).status).toBe(405);
    expect((await h.get("/")).body.endpoints).toContain("/v1/{cc}/observations");
  });
  test("every JSON response carries attribution and CORS *", async () => {
    const h = harness();
    for (const p of ["/", "/health", "/v1/countries", "/v1/scales", "/v1/th/observations", "/v1/kh/observations", "/v1/xx/observations", "/v1/th/snapshot?lat=13.75&lon=100.5", "/v1/th/snapshot?lat=abc&lon=1", "/nope"]) {
      const r = await h.get(p);
      expect(r.headers["access-control-allow-origin"]).toBe("*");
      expect(Array.isArray(r.body.attribution)).toBe(true);
    }
  });
});

describe("country endpoints (recorded live fixtures)", () => {
  test("/v1/th/observations: 173 Air4Thai stations, 2 upstream calls", async () => {
    const h = harness();
    const r = await h.get("/v1/th/observations");
    expect(r.status).toBe(200);
    expect(r.body.country).toBe("TH");
    expect(r.body.observations).toHaveLength(173);
    expect(r.body.attribution[0].id).toBe("th.pcd");
    expect(r.headers["cache-control"]).toContain("max-age=30");
    expect(h.calls.map((c) => new URL(c.url).pathname)).toEqual(["/forweb/getAQI_JSON.php", "/forweb/getHistoryData.php"]);
  });
  test("/v1/th/snapshot: coarse location, Thai verdict, official row", async () => {
    const h = harness();
    const r = await h.get("/v1/th/snapshot?lat=13.756312&lon=100.501789&profile=kids");
    expect(r.status).toBe(200);
    expect(r.body.location).toEqual({ lat: 13.76, lon: 100.5, rounded: "2dp" });
    expect(r.body.snapshot.pm25Kind).toBe("official_1h");
    expect(r.body.snapshot.localBand.scaleId).toBe("th_aqi");
    expect(r.body.verdict.headline).toBe("Fine for outdoor play.");
    expect(r.body.verdict.headlineLocal).toBe("เด็กเล่นกลางแจ้งได้ตามปกติ");
    expect(r.body.officialLine).toMatch(/^PCD Thai AQI \(24-hr\): \d+/);
  });
  test("/v1/auto/snapshot picks the jurisdiction from the point", async () => {
    const h = harness();
    const r = await h.get("/v1/auto/snapshot?lat=-2.2161&lon=113.9135");
    expect(r.status).toBe(200);
    expect(r.body.snapshot.country).toBe("ID");
    expect(r.body.snapshot.localBand.labelLocal).toBe("Sangat Tidak Sehat");
    expect(r.body.snapshot.official.name).toBe("ISPU");
    expect(r.body.snapshot.hotspots.count).toBeGreaterThanOrEqual(0);
    expect(r.body.attribution.map((a: { id: string }) => a.id)).toContain("id.bmkg");
  });
  test("MY snapshot (KL): AirGradient estimate + DOE band; ID/VN/PH/LA/SG all answer", async () => {
    const h = harness();
    const my = await h.get("/v1/my/snapshot?lat=3.139&lon=101.6869");
    expect(my.body.snapshot.pm25Kind).toBe("crowd_estimate");
    expect(my.body.snapshot.localBand.scaleId).toBe("my_api");
    expect(my.body.attribution.map((a: { id: string }) => a.id).sort()).toEqual(["crowd.airgradient", "my.doe"]);
    for (const [cc, lat, lon] of [["id", -6.2088, 106.8456], ["vn", 21.0285, 105.8542], ["ph", 14.6354, 121.0779], ["la", 17.9757, 102.6331], ["sg", 1.33, 103.74]] as const) {
      const r = await h.get(`/v1/${cc}/snapshot?lat=${lat}&lon=${lon}`);
      expect(r.status).toBe(200);
      expect(r.body.snapshot.country).toBe(cc.toUpperCase());
    }
  });
  test("SG through the proxy is the v1 SG snapshot (NEA v1 merge), not the generic builder", async () => {
    const h = harness();
    h.clock.now = Date.parse("2026-09-28T17:05:00+08:00");
    const r = await h.get("/v1/sg/snapshot?lat=1.29587&lon=103.82");
    expect(r.body.snapshot.pm25).toBe(140); // v1 fixture: south 140 at 17:00
    expect(r.body.snapshot.instantPsi).toBeDefined();
    expect(r.body.snapshot.source).toBe("NEA via data.gov.sg");
  });
  test("the jurisdiction follows the point: SG for a Johor point → 409; outside → 404; not covered → 404", async () => {
    const h = harness();
    const jb = await h.get("/v1/sg/snapshot?lat=1.4655&lon=103.7578");
    expect(jb.status).toBe(409);
    expect(jb.body.country).toBe("MY");
    expect((await h.get("/v1/auto/snapshot?lat=35.68&lon=139.69")).status).toBe(404);
    const kh = await h.get("/v1/kh/observations");
    expect(kh.status).toBe(404);
    expect(kh.body.status).toBe("not_feasible");
    expect((await h.get("/v1/auto/snapshot?lat=11.5564&lon=104.9282")).body.country).toBe("KH");
    expect((await h.get("/v1/th/snapshot?lat=91&lon=0")).status).toBe(400);
    expect((await h.get("/v1/th/snapshot?lat=13")).status).toBe(400);
  });
  test("NEA passthrough: key only to api-open.data.gov.sg, date validated, attribution added", async () => {
    const h = harness({ extraHeaders: (src): Record<string, string> => (src.id === "sg.nea.v2" ? { "x-api-key": "secret" } : {}) });
    const r = await h.get("/v1/sg/nea/pm25?date=2026-09-28");
    expect(r.status).toBe(200);
    expect(r.body.data.items.length).toBeGreaterThan(0);
    expect(r.body.attribution[0].text).toBe("Data: NEA via data.gov.sg");
    expect(h.calls[0].headers["x-api-key"]).toBe("secret");
    await h.get("/v1/th/observations");
    expect(h.calls.filter((c) => c.headers["x-api-key"]).length).toBe(1);
    expect((await h.get("/v1/sg/nea/pm25?date=28-09-2026")).status).toBe(400);
    expect((await h.get("/v1/sg/nea/rainfall")).status).toBe(404);
  });
  test("per-IP rate limit → 429 with Retry-After; /health exempt", async () => {
    const h = harness({ rateLimitPerMin: 3 });
    for (let i = 0; i < 3; i++) expect((await h.get("/v1/countries", "1.2.3.4")).status).toBe(200);
    const r = await h.get("/v1/countries", "1.2.3.4");
    expect(r.status).toBe(429);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
    expect((await h.get("/v1/countries", "5.6.7.8")).status).toBe(200);
    expect((await h.get("/health", "1.2.3.4")).status).toBe(200);
    h.clock.now += 61_000;
    expect((await h.get("/v1/countries", "1.2.3.4")).status).toBe(200);
  });
  test("coordinates are rounded to 2 dp", () => {
    expect([coarse(1.296543), coarse(103.8249)]).toEqual([1.3, 103.82]);
  });
});

/* ================================================================== budget, cache, single flight */

describe("fixed upstream budget regardless of users", () => {
  test("500 client requests inside the TTL → 2 upstream calls", async () => {
    const h = harness();
    await Promise.all(Array.from({ length: 500 }, () => h.get("/v1/th/observations")));
    expect(h.calls).toHaveLength(2);
  });
  test("single flight: concurrent requests share one upstream call", async () => {
    const h = harness();
    await Promise.all(Array.from({ length: 20 }, () => h.upstreams.get("my.doe", SOURCESURL.doe)));
    expect(h.calls).toHaveLength(1);
  });
  test("TTL follows the publication cycle (burst after publish, idle otherwise)", () => {
    const at = (m: number) => Date.parse(`2026-09-28T10:${String(m).padStart(2, "0")}:00Z`);
    expect(SOURCES["my.doe"].ttlMs(at(9))).toBe(3 * MIN);
    expect(SOURCES["my.doe"].ttlMs(at(40))).toBe(20 * MIN);
    expect(SOURCES["id.bmkg"].ttlMs(at(18))).toBe(3 * MIN);
    expect(SOURCES["id.klh.ispu"].ttlMs(at(1))).toBe(2 * MIN);
    expect(SOURCES["th.air4thai.history"].ttlMs(at(10))).toBe(3 * MIN);
    expect(SOURCES["crowd.airgradient"].ttlMs(at(33))).toBe(5 * MIN);
  });
  test("hourly budget is a hard cap: stale payload served once it is spent", async () => {
    const src: SourceDef = { id: "t", hosts: ["x.example"], budgetPerHour: 2, ttlMs: () => 0, keepMs: 3600_000, body: "json", cadence: "" };
    let n = 0;
    const f: FetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ n: ++n }) });
    const clock = { t: NOW };
    const up = new Upstreams(new MemoryCache(() => clock.t), f, () => clock.t, { t: src });
    const got = [];
    for (let i = 0; i < 5; i++) {
      clock.t += 1000;
      got.push(await up.get<{ n: number }>("t", "https://x.example/a"));
    }
    expect(n).toBe(2);
    expect(got.map((g) => g.data.n)).toEqual([1, 2, 2, 2, 2]);
    expect(got[4].stale).toBe(true);
    expect(got[4].error).toMatch(/budget/);
    clock.t += 3600_000;
    expect((await up.get<{ n: number }>("t", "https://x.example/a")).data.n).toBe(3);
  });
});

const SOURCESURL = { doe: "https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=STATION_ID,DATETIME,API,PARAM_SELECTED,CLASS,LATITUDE,LONGITUDE,STATION_LOCATION,PLACE,STATE_NAME,STATION_CATEGORY&returnGeometry=false&f=json" };

/* ================================================================== allow-list */

describe("allow-list (no open proxy)", () => {
  test("wrong host, http scheme or credentials are refused before any I/O", async () => {
    const h = harness();
    const up = h.upstreams;
    await expect(up.get("my.doe", "https://evil.example/x")).rejects.toBeInstanceOf(UpstreamError);
    await expect(up.get("my.doe", "http://eqms.doe.gov.my/x")).rejects.toThrow(/allow-listed/);
    await expect(up.get("my.doe", "https://user:pw@eqms.doe.gov.my/x")).rejects.toThrow(/allow-listed/);
    await expect(up.get("nope", "https://eqms.doe.gov.my/x")).rejects.toThrow(/Unknown source/);
    expect(h.calls).toHaveLength(0);
  });
  test("every source's hosts are https-only government / network hosts we documented", () => {
    const hosts = Object.values(SOURCES).flatMap((s) => s.hosts);
    expect(new Set(hosts)).toEqual(
      new Set([
        "api.data.gov.sg", "api-open.data.gov.sg", "air4thai.pcd.go.th", "eqms.doe.gov.my", "www.bmkg.go.id", "ispu.kemenlh.go.id",
        "opsroom-sipongi.gakkum.kehutanan.go.id", "moitruongthudo.vn", "map-data-int.airgradient.com", "api.airgradient.com",
      ]),
    );
  });
  test("chain fix applies to Air4Thai hosts only", async () => {
    const seen: string[] = [];
    const base: FetchImpl = async (u) => (seen.push("base:" + new URL(u).hostname), { ok: true, status: 200, text: async () => "{}" });
    const fix: FetchImpl = async (u) => (seen.push("fix:" + new URL(u).hostname), { ok: true, status: 200, text: async () => "{}" });
    const f = chainFixedFetch(base, undefined, fix);
    await f("https://air4thai.pcd.go.th/forweb/getAQI_JSON.php");
    await f("https://eqms.doe.gov.my/x");
    expect(seen).toEqual(["fix:air4thai.pcd.go.th", "base:eqms.doe.gov.my"]);
  });
});

/* ================================================================== upstream failures */

describe("mocked upstream failures", () => {
  test("DOE 500 after a good fetch → stale payload with a plain warning; backoff stops retry storms", async () => {
    const h = harness();
    expect((await h.get("/v1/my/observations")).status).toBe(200);
    h.rules["eqms.doe.gov.my"] = 500;
    h.clock.now += 25 * MIN; // past the TTL
    const r = await h.get("/v1/my/observations");
    expect(r.status).toBe(200);
    expect(r.body.warnings.join(" ")).toMatch(/my\.doe: HTTP 500; serving data fetched 25 min ago/);
    const doeCalls = () => h.calls.filter((c) => c.url.includes("eqms")).length;
    const before = doeCalls();
    h.clock.now += 10_000;
    await h.get("/v1/my/observations");
    expect(doeCalls()).toBe(before); // backing off
    expect(backoffMs(1, 120)).toBe(120_000); // Retry-After honoured
    expect(backoffMs(9)).toBe(10 * MIN);
    const health = (await h.get("/health")).body.sources["my.doe"];
    expect(health.lastError).toBe("HTTP 500");
    expect(health.backingOffUntil).not.toBeNull();
  });
  test("cold start with the only source down → 503 with warnings, attribution and Retry-After", async () => {
    const h = harness({ rules: { "eqms.doe.gov.my": "throw", "map-data-int.airgradient.com": "throw", "api.airgradient.com": 503 } });
    const r = await h.get("/v1/my/observations");
    expect(r.status).toBe(503);
    expect(r.headers["retry-after"]).toBe("60");
    expect(r.body.warnings.join(" ")).toMatch(/fetch failed/);
    expect(r.body.attribution.map((a: { id: string }) => a.id)).toContain("my.doe");
  });
  test("timeout → treated as a failure, not a hang", async () => {
    const h = harness({ rules: { "ispu.kemenlh.go.id": "hang" } });
    const src = SOURCES["id.klh.ispu"];
    const orig = src.timeoutMs;
    src.timeoutMs = 20;
    try {
      const r = await h.get("/v1/id/observations");
      expect(r.status).toBe(200); // BMKG + crowd still answer
      expect(r.body.warnings.join(" ")).toMatch(/id\.klh\.ispu: timeout/);
    } finally {
      src.timeoutMs = orig;
    }
  });
  test("malformed JSON and a changed BMKG page layout degrade, never crash", async () => {
    const h = harness({ rules: { "ispu.kemenlh.go.id": "garbage", "www.bmkg.go.id": () => "<html><body>new site</body></html>" } });
    const r = await h.get("/v1/id/observations");
    expect(r.status).toBe(200);
    const w = r.body.warnings.join(" | ");
    expect(w).toMatch(/id\.klh\.ispu: unparseable JSON/);
    expect(w).toMatch(/id\.bmkg: page layout changed/);
    expect(r.body.observations.every((o: Observation) => o.stationId.startsWith("ag:"))).toBe(true);
  });
  test("AirGradient map API down → world API fallback with EPA-extended correction", async () => {
    const h = harness({ rules: { "map-data-int.airgradient.com": 502 } });
    const r = await h.get("/v1/ph/observations");
    expect(r.status).toBe(200);
    expect(r.body.observations.length).toBeGreaterThan(0);
    expect(r.body.observations.every((o: Observation) => o.corrected === "epa_ext" && o.stationId.startsWith("agw:"))).toBe(true);
    expect(r.body.warnings.join(" ")).toMatch(/crowd\.airgradient: HTTP 502/);
  });
  test("Hanoi: stale city stations are not even fetched (2.3 MB each)", async () => {
    const h = harness();
    const r = await h.get("/v1/vn/observations");
    expect(r.status).toBe(200);
    const statCalls = h.calls.filter((c) => c.url.includes("dailystat")).map((c) => c.url.split("/").pop());
    expect(statCalls.sort()).toEqual(["48", "49"]);
  });
});

/* ================================================================== crowd rings + bias correction */

describe("crowd rolling mean and bias correction (ARCHITECTURE_V2 §3)", () => {
  const sensor = (t: number, v: number): Observation => ({
    stationId: "ag:1", name: "s", country: "ID", lat: -2.95, lon: 104.72, grade: "lowcost", pm25_now: v,
    periodEnd: new Date(t).toISOString(), corrected: "source", k: null, qc: "uncalibrated", attributionId: "crowd.airgradient",
  });
  test("rolling 1-hr mean needs ≥ 6 samples", () => {
    const r = new Rings();
    for (let i = 0; i < 5; i++) r.recordCrowd(sensor(NOW - i * 5 * MIN, 100), NOW);
    expect(r.crowdRolling1h("ag:1", NOW)).toBeNull();
    r.recordCrowd(sensor(NOW - 25 * MIN, 130), NOW);
    expect(r.crowdRolling1h("ag:1", NOW)).toBe(105);
  });
  test("k learned against BMKG (1-hr anchor ≤ 10 km) and applied; no anchor → uncalibrated", () => {
    const h = harness();
    const svc = h.service;
    const H = 3600_000;
    const hourEnd = Math.floor(NOW / H) * H;
    const anchor: Observation = { stationId: "id.bmkg:plb", name: "Musi 2 Palembang", country: "ID", lat: -3.031, lon: 104.72, grade: "reference", pm25_1h: 150, periodEnd: new Date(hourEnd).toISOString(), attributionId: "id.bmkg" };
    for (let hr = 8; hr >= 1; hr--) {
      const end = hourEnd - (hr - 1) * H;
      svc.rings.recordOfficial({ ...anchor, pm25_1h: 100 + hr, periodEnd: new Date(end).toISOString() }, NOW);
      for (let i = 0; i < 12; i++) svc.rings.recordCrowd(sensor(end - H + (i + 1) * 5 * MIN, (100 + hr) / 1.25), NOW);
    }
    const near = { ...sensor(NOW - MIN, 80), lat: -2.99, lon: 104.72 }; // ~4.5 km from the anchor
    const [cal] = svc.calibrate([near], [anchor], "1h");
    expect(cal.k).toBeCloseTo(1.25, 2);
    expect(cal.qc).toBe("ok");
    expect(cal.pm25_now).toBe(100);
    const far = { ...near, stationId: "ag:2", lat: -2.5 };
    expect(svc.calibrate([far], [anchor], "1h")[0].qc).toBe("uncalibrated");
    expect(svc.calibrate([near], [], "none")[0].k).toBeNull();
  });
});

/* ================================================================== cache + redis */

describe("cache: memory, Redis (optional) and fallback", () => {
  test("RESP encode/parse", () => {
    expect(encodeCommand(["SET", "k", "vé", "PX", 10]).toString()).toBe("*5\r\n$3\r\nSET\r\n$1\r\nk\r\n$3\r\nvé\r\n$2\r\nPX\r\n$2\r\n10\r\n");
    expect(parseResp(Buffer.from("+OK\r\n"))![0]).toBe("OK");
    expect(parseResp(Buffer.from("$-1\r\n"))![0]).toBeNull();
    expect(parseResp(Buffer.from("$5\r\nhel"))).toBeNull(); // incomplete
    expect(parseResp(Buffer.from("*2\r\n:1\r\n$2\r\nhi\r\n"))![0]).toEqual([1, "hi"]);
    expect(parseResp(Buffer.from("-ERR bad\r\n"))![0]).toBeInstanceOf(Error);
  });
  test("RedisClient against a tiny in-process RESP server (AUTH, SET PX, GET)", async () => {
    const store = new Map<string, string>();
    const seen: string[] = [];
    const server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          const r = parseResp(buf);
          if (!r) break;
          buf = buf.subarray(r[1]);
          const [cmd, ...a] = r[0] as string[];
          seen.push(cmd);
          if (cmd === "AUTH") sock.write(a[a.length - 1] === "pw" ? "+OK\r\n" : "-WRONGPASS\r\n");
          else if (cmd === "SET") (store.set(a[0], a[1]), sock.write("+OK\r\n"));
          else if (cmd === "GET") sock.write(store.has(a[0]) ? `$${Buffer.byteLength(store.get(a[0])!)}\r\n${store.get(a[0])}\r\n` : "$-1\r\n");
          else sock.write("-ERR unknown\r\n");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as net.AddressInfo).port;
    const c = new RedisClient(`redis://:pw@127.0.0.1:${port}`);
    const cache = new RedisCache(c);
    await cache.set("a", { data: { x: 1 }, fetchedAt: 5 }, 60_000);
    const fresh = new RedisCache(c); // empty memory layer → must read Redis
    expect(await fresh.get("a")).toEqual({ data: { x: 1 }, fetchedAt: 5 });
    expect(seen).toEqual(["AUTH", "SET", "GET"]);
    c.close();
    server.close();
  });
  test("Redis down → requests still work from memory; error surfaced in /health", async () => {
    const broken = { get: async () => { throw new Error("ECONNREFUSED"); }, set: async () => { throw new Error("ECONNREFUSED"); } };
    const cache = new RedisCache(broken);
    await cache.set("k", { data: 1, fetchedAt: 1 }, 1000);
    expect(await cache.get("k")).toEqual({ data: 1, fetchedAt: 1 });
    expect(cache.lastError).toBe("ECONNREFUSED");
    expect(await cache.get("missing")).toBeNull();
  });
  test("memory cache expiry and bounded size", async () => {
    let t = 0;
    const c = new MemoryCache(() => t, 2);
    await c.set("a", { data: 1, fetchedAt: 0 }, 10);
    t = 11;
    expect(await c.get("a")).toBeNull();
    await c.set("b", { data: 2, fetchedAt: 0 }, 100);
    await c.set("c", { data: 3, fetchedAt: 0 }, 100);
    await c.set("d", { data: 4, fetchedAt: 0 }, 100);
    expect(await c.get("b")).toBeNull();
    expect(await c.get("d")).not.toBeNull();
  });
});
