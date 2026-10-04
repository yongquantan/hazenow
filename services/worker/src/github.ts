/**
 * GitHub archive: GitHub keeps repo traffic (views, clones, referrers) for 14 days only, so the Worker cron stores a
 * daily copy in D1 (migrations/0004_metrics.sql). Public repository numbers only; nothing about any person.
 *
 * Runs hourly (minute :03) when the GITHUB_TOKEN secret is set. The traffic API needs a token with push access to
 * the repo: a fine-grained token limited to this repo with "Administration: Read-only" is the narrowest that works.
 * Five GitHub calls per run. The last run of a UTC day is that day's snapshot.
 */
import { kvGet, kvPut, parseOr, type Env } from "./store.js";

export const GH_REPO = "yongquantan/hazenow";
export const GH_STATE_KEY = "metrics:github";
export const GH_MINUTE = 3;

export interface GhState {
  lastRunAt: number;
  lastOkAt: number | null;
  lastError: string | null;
}

/** Hourly, at minute :03. */
export const githubDue = (scheduledTime: number) => new Date(scheduledTime).getUTCMinutes() === GH_MINUTE;

/** A release asset name → the platform it serves (for "downloads per platform"); null for checksums etc. */
export function assetPlatform(name: string): string | null {
  const n = name.toLowerCase();
  if (n.endsWith(".apk")) return "android";
  if (n.includes("mac") && n.endsWith(".zip")) return "mac";
  if (n.startsWith("hazenow-cli")) return "cli";
  if (n.endsWith(".scriptable") || n.includes("scriptable")) return "scriptable";
  if (n.includes("home-assistant")) return "home_assistant";
  if (n.endsWith(".2m.py") || n.includes("swiftbar")) return "swiftbar";
  if (n.endsWith(".sh")) return "shell";
  return null;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export async function githubSnapshot(env: Env, now: number, fetchFn: FetchFn = (u, i) => fetch(u, i)): Promise<GhState> {
  const db = env.DB;
  const prev = parseOr<GhState | null>(await kvGet(db, GH_STATE_KEY), null);
  const state: GhState = { lastRunAt: now, lastOkAt: prev?.lastOkAt ?? null, lastError: null };
  try {
    if (!env.GITHUB_TOKEN) throw new Error("No GITHUB_TOKEN secret");
    const headers = {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "hazenow-data-worker",
      "x-github-api-version": "2022-11-28",
    };
    const get = async <T>(path: string): Promise<T> => {
      const r = await fetchFn(`https://api.github.com/repos/${GH_REPO}${path}`, { headers });
      if (!r.ok) throw new Error(`GitHub ${path || "/"}: HTTP ${r.status}`);
      return (await r.json()) as T;
    };
    type Traffic = { timestamp: string; count: number; uniques: number }[];
    const [repo, views, clones, refs, releases] = await Promise.all([
      get<{ stargazers_count: number; forks_count: number; subscribers_count: number }>(""),
      get<{ views: Traffic }>("/traffic/views"),
      get<{ clones: Traffic }>("/traffic/clones"),
      get<{ referrer: string; count: number; uniques: number }[]>("/traffic/popular/referrers"),
      get<{ draft: boolean; assets: { name: string; download_count: number }[] }[]>("/releases?per_page=100"),
    ]);
    const days = new Map<string, { v: number; vu: number; c: number; cu: number }>();
    for (const x of views.views ?? []) days.set(x.timestamp.slice(0, 10), { v: x.count, vu: x.uniques, c: 0, cu: 0 });
    for (const x of clones.clones ?? []) {
      const d = days.get(x.timestamp.slice(0, 10)) ?? { v: 0, vu: 0, c: 0, cu: 0 };
      d.c = x.count;
      d.cu = x.uniques;
      days.set(x.timestamp.slice(0, 10), d);
    }
    const downloads: Record<string, number> = {};
    for (const rel of releases) if (!rel.draft) for (const a of rel.assets) downloads[a.name] = (downloads[a.name] ?? 0) + a.download_count;
    const day = new Date(now).toISOString().slice(0, 10);
    await db.batch([
      ...[...days].map(([d, x]) =>
        db
          .prepare(
            "INSERT INTO gh_traffic (day, views, view_uniques, clones, clone_uniques) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (day) DO UPDATE SET views = excluded.views, view_uniques = excluded.view_uniques, clones = excluded.clones, clone_uniques = excluded.clone_uniques",
          )
          .bind(d, x.v, x.vu, x.c, x.cu),
      ),
      db
        .prepare(
          "INSERT INTO gh_daily (day, at, stars, forks, watchers, referrers, downloads) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (day) DO UPDATE SET at = excluded.at, stars = excluded.stars, forks = excluded.forks, watchers = excluded.watchers, referrers = excluded.referrers, downloads = excluded.downloads",
        )
        .bind(day, now, repo.stargazers_count, repo.forks_count, repo.subscribers_count ?? 0, JSON.stringify(refs.slice(0, 10)), JSON.stringify(downloads)),
    ]);
    state.lastOkAt = now;
  } catch (e) {
    state.lastError = (e as Error).message.slice(0, 200);
  }
  await kvPut(db, GH_STATE_KEY, JSON.stringify(state), now).run();
  return state;
}

/* ------------------------------------------------------------------ reading */

export async function readGithub(db: D1Database, from: string) {
  const traffic = await db
    .prepare("SELECT day, views, view_uniques AS viewUniques, clones, clone_uniques AS cloneUniques FROM gh_traffic WHERE day >= ?1 ORDER BY day")
    .bind(from)
    .all<{ day: string; views: number; viewUniques: number; clones: number; cloneUniques: number }>();
  // One snapshot before the window too, so the first day's downloads can be a difference.
  const snaps = await db
    .prepare("SELECT day, at, stars, forks, watchers, referrers, downloads FROM gh_daily WHERE day >= (SELECT COALESCE(MAX(day), ?1) FROM gh_daily WHERE day < ?1) ORDER BY day")
    .bind(from)
    .all<{ day: string; at: number; stars: number; forks: number; watchers: number; referrers: string; downloads: string }>();
  const rows = (snaps.results ?? []).map((r) => ({ ...r, downloads: JSON.parse(r.downloads) as Record<string, number>, referrers: JSON.parse(r.referrers) as { referrer: string; count: number; uniques: number }[] }));
  const byPlatform = (d: Record<string, number>) => {
    const o: Record<string, number> = {};
    for (const [name, n] of Object.entries(d)) {
      const p = assetPlatform(name);
      if (p) o[p] = (o[p] ?? 0) + n;
    }
    return o;
  };
  const daily = rows
    .map((r, i) => {
      const cum = byPlatform(r.downloads);
      const before = i > 0 ? byPlatform(rows[i - 1].downloads) : null;
      const delta: Record<string, number> | null = before ? Object.fromEntries(Object.entries(cum).map(([p, n]) => [p, Math.max(0, n - (before[p] ?? 0))])) : null;
      return { day: r.day, stars: r.stars, forks: r.forks, watchers: r.watchers, downloads: cum, newDownloads: delta };
    })
    .filter((r) => r.day >= from);
  const latest = rows.at(-1) ?? null;
  const state = parseOr<GhState | null>(await kvGet(db, GH_STATE_KEY), null);
  const t = traffic.results ?? [];
  return {
    state: state && { ...state, lastRunAt: new Date(state.lastRunAt).toISOString(), lastOkAt: state.lastOkAt ? new Date(state.lastOkAt).toISOString() : null },
    latest: latest && {
      day: latest.day,
      stars: latest.stars,
      forks: latest.forks,
      watchers: latest.watchers,
      referrers: latest.referrers,
      downloadsByAsset: latest.downloads,
      downloadsByPlatform: byPlatform(latest.downloads),
    },
    totals: { views: t.reduce((a, r) => a + r.views, 0), clones: t.reduce((a, r) => a + r.clones, 0) },
    traffic: t,
    daily,
  };
}
