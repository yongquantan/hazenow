import { beforeEach, describe, expect, test } from "bun:test";
import { NOW } from "../../proxy/test/helpers.js";
import { assetPlatform, githubDue, githubSnapshot } from "../src/github.js";
import { EVENTS, readVisits } from "../src/metrics.js";
import { clearMemo, handle } from "../src/routes.js";
import { asD1, FakeD1 } from "./d1-shim.js";

const TOKEN = "t".repeat(32);
type E = { DB: D1Database; STATS_TOKEN?: string; GITHUB_TOKEN?: string };

async function call(env: E, path: string, o: { method?: string; country?: string; auth?: string } = {}) {
  const r = await handle({ method: o.method ?? "POST", url: path, ip: "203.0.113.9", country: o.country, authorization: o.auth }, env, { now: NOW, rateLimitPerMin: 0 });
  return { status: r.status, headers: r.headers, body: r.body ? (r.headers["content-type"]?.startsWith("application/json") ? JSON.parse(r.body) : r.body) : null };
}

beforeEach(() => clearMemo());

describe("product metrics: allow-listed counters only", () => {
  test("every allow-listed event and value is accepted and counted", async () => {
    const d1 = new FakeD1();
    const env = { DB: asD1(d1), STATS_TOKEN: TOKEN };
    const ok = [
      "/v1/hit?e=app_open&surface=app&seen=new",
      "/v1/hit?e=app_open&surface=browser&seen=returning",
      "/v1/hit?e=app_open&surface=android&seen=returning&cc=th",
      "/v1/hit?e=app_open&surface=mac&seen=new",
      "/v1/hit?e=app_open_week&surface=browser",
      "/v1/hit?e=eureka&via=link",
      "/v1/hit?e=place_set&via=typed",
      "/v1/hit?e=share_sent&card=clocks&via=share",
      "/v1/hit?e=install_prompt_shown&kind=coach",
      "/v1/hit?e=installed&os=ios",
      "/v1/hit?e=alerts_on",
      "/v1/hit?e=alerts_off",
      "/v1/hit?e=download_click&platform=android",
      "/v1/hit?e=qr_shown",
      "/v1/hit?e=scriptable_file",
      "/v1/hit?e=share_landing&card=now",
    ];
    for (const p of ok) expect([p, (await call(env, p, { country: "SG" })).status]).toEqual([p, 204]);
    expect((await call(env, "/v1/hit?e=qr_shown", { method: "GET", country: "SG" })).status).toBe(204); // GET works too

    const r = await call(env, "/v1/stats?days=7", { method: "GET", auth: `Bearer ${TOKEN}` });
    expect(r.status).toBe(200);
    const ev = r.body.events;
    expect(ev.app_open.total).toBe(4);
    expect(ev.app_open.a).toEqual({ app: 1, browser: 1, android: 1, mac: 1 });
    expect(ev.app_open.b).toEqual({ new: 2, returning: 2 });
    expect(ev.app_open.countries).toEqual({ SG: 3, TH: 1 }); // native: the place's country (cc=th), not the request's
    expect(ev.place_set.countries).toEqual({}); // place_set records the method only
    expect(ev.scriptable_file.countries).toEqual({});
    expect(ev.share_sent.a).toEqual({ clocks: 1 });
    expect(ev.share_sent.b).toEqual({ share: 1 });
    expect(ev.qr_shown.total).toBe(2);
    expect(r.body.totals.shareLandings).toBe(1);
    expect(r.body.funnel.steps.map((s: { id: string }) => s.id)).toEqual(["visits", "share_landings", "app_open", "eureka", "installed", "share_sent", "alerts_on"]);
    expect(r.body.funnel.steps[0].n).toBeNull(); // no Cloudflare analytics token
    expect(r.body.visits.available).toBe(false);
    expect(r.body.alertsActive).toBe(0); // push_subs is empty
    expect(r.body.funnel.sharesPerEureka).toBe(1);
    expect(Object.keys(r.body.eventInfo).sort()).toEqual(Object.keys(EVENTS).sort());

    // What's stored: allow-listed labels, a country and a count. Nothing else.
    const rows = d1.q<Record<string, unknown>>("SELECT * FROM metric_daily");
    expect(Object.keys(rows[0]).sort()).toEqual(["a", "b", "country", "day", "event", "n"]);
    expect(JSON.stringify(rows)).not.toMatch(/203\.0\.113/);
  });

  test("anything off the allow-list is rejected and never stored", async () => {
    const d1 = new FakeD1();
    const env = { DB: asD1(d1), STATS_TOKEN: TOKEN };
    const bad = [
      "/v1/hit",
      "/v1/hit?e=pageview",
      "/v1/hit?e=constructor", // prototype names aren't events
      "/v1/hit?e=__proto__",
      "/v1/hit?e=app_open&surface=app", // missing dimension
      "/v1/hit?e=app_open&surface=tv&seen=new", // value off the list
      "/v1/hit?e=app_open&surface=app&seen=new&id=abc123", // extra parameter (an identifier)
      "/v1/hit?e=app_open&surface=app&seen=new&lat=1.35", // a coordinate
      "/v1/hit?e=app_open&surface=app&seen=new&cc=sg", // cc only for native apps
      "/v1/hit?e=app_open&surface=android&seen=new&cc=us", // cc must be a covered country
      "/v1/hit?e=app_open&surface=app&seen=new&seen=new", // repeated parameter
      "/v1/hit?e=qr_shown&card=now",
      "/v1/hit?e=share_sent&card=now", // missing via
      "/v1/hit?e=share_sent&card=1.35,103.8&via=share",
      "/v1/hit?e=download_click&platform=windows",
      "/v1/hit?e=share_landing&card=now&x=1",
      "/v1/hit?e=eureka&via=" + "a".repeat(200),
    ];
    for (const p of bad) expect([p, (await call(env, p, { country: "SG" })).status]).toEqual([p, 400]);
    expect((await call(env, "/v1/hit?e=qr_shown", { method: "PUT" })).status).toBe(405);
    await call(env, "/v1/stats", { method: "GET", auth: `Bearer ${TOKEN}` }); // flushes
    expect(d1.q("SELECT * FROM metric_daily")).toEqual([]);
    expect(d1.q("SELECT * FROM share_landings")).toEqual([]);
  });

  test("/dash is a static, noindex page with no data in it", async () => {
    const r = await call({ DB: asD1(new FakeD1()) }, "/dash", { method: "GET" });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/html");
    expect(r.headers["x-robots-tag"]).toContain("noindex");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(r.body).toContain("sessionStorage");
    expect(r.body).not.toContain(TOKEN);
  });

  test("visits come from Cloudflare GraphQL only with a token", async () => {
    expect((await readVisits(undefined, "2026-10-01", NOW)).available).toBe(false);
    const fake = (async () =>
      new Response(
        JSON.stringify({
          data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [{ count: 9, sum: { visits: 4 }, dimensions: { date: "2026-10-02", requestHost: "hazenow.pages.dev" } }] }] } },
        }),
      )) as unknown as typeof fetch;
    const v = await readVisits("tok", "2026-10-01", NOW, fake);
    expect(v).toMatchObject({ available: true, total: 4, pageViews: 9 });
  });
});

describe("GitHub archive", () => {
  const gh = (url: string) => {
    const p = new URL(url).pathname.replace("/repos/yongquantan/hazenow", "");
    const body: Record<string, unknown> = {
      "": { stargazers_count: 12, forks_count: 3, subscribers_count: 2 },
      "/traffic/views": { views: [{ timestamp: "2026-10-01T00:00:00Z", count: 30, uniques: 7 }, { timestamp: "2026-10-02T00:00:00Z", count: 5, uniques: 2 }] },
      "/traffic/clones": { clones: [{ timestamp: "2026-10-02T00:00:00Z", count: 4, uniques: 1 }] },
      "/traffic/popular/referrers": [{ referrer: "news.ycombinator.com", count: 20, uniques: 9 }],
      "/releases": [
        { draft: false, assets: [{ name: "HazeNow-android.apk", download_count: 10 }, { name: "SHA256SUMS.txt", download_count: 2 }] },
        { draft: false, assets: [{ name: "HazeNow-android.apk", download_count: 5 }, { name: "HazeNow-mac.zip", download_count: 3 }] },
      ],
    };
    return new Response(JSON.stringify(body[p]), { status: p in body ? 200 : 404 });
  };

  test("a snapshot stores traffic per day, stars and downloads per asset; /v1/stats reads them per platform", async () => {
    const d1 = new FakeD1();
    const env = { DB: asD1(d1), STATS_TOKEN: TOKEN, GITHUB_TOKEN: "ghx" };
    const calls: { url: string; auth: string }[] = [];
    const st = await githubSnapshot(env, NOW, async (u, i) => {
      calls.push({ url: u, auth: (i.headers as Record<string, string>).authorization });
      return gh(u);
    });
    expect(st.lastError).toBeNull();
    expect(calls).toHaveLength(5);
    expect(calls.every((c) => c.auth === "Bearer ghx")).toBe(true);
    expect(d1.q("SELECT day, views, clones FROM gh_traffic ORDER BY day")).toEqual([
      { day: "2026-10-01", views: 30, clones: 0 },
      { day: "2026-10-02", views: 5, clones: 4 },
    ]);
    const r = await call(env, "/v1/stats?days=30", { method: "GET", auth: `Bearer ${TOKEN}` });
    expect(r.body.github.latest).toMatchObject({ stars: 12, forks: 3, downloadsByPlatform: { android: 15, mac: 3 } });
    expect(r.body.github.latest.referrers[0].referrer).toBe("news.ycombinator.com");
    expect(r.body.github.state.lastError).toBeNull();
  });

  test("a failed run records the error and stores nothing", async () => {
    const d1 = new FakeD1();
    const env = { DB: asD1(d1), GITHUB_TOKEN: "ghx" };
    const st = await githubSnapshot(env, NOW, async () => new Response("no", { status: 403 }));
    expect(st.lastError).toContain("403");
    expect(d1.q("SELECT * FROM gh_daily")).toEqual([]);
  });

  test("schedule and asset mapping", () => {
    expect(githubDue(Date.UTC(2026, 9, 5, 7, 3))).toBe(true);
    expect(githubDue(Date.UTC(2026, 9, 5, 7, 4))).toBe(false);
    expect(assetPlatform("HazeNow-android.apk")).toBe("android");
    expect(assetPlatform("HazeNow-mac.zip")).toBe("mac");
    expect(assetPlatform("hazenow-cli.tgz")).toBe("cli");
    expect(assetPlatform("HazeNow.scriptable")).toBe("scriptable");
    expect(assetPlatform("HazeNow-scriptable.js")).toBe("scriptable");
    expect(assetPlatform("hazenow-home-assistant.zip")).toBe("home_assistant");
    expect(assetPlatform("hazenow.2m.py")).toBe("swiftbar");
    expect(assetPlatform("SHA256SUMS.txt")).toBeNull();
  });
});
