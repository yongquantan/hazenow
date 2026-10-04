/**
 * GET /v1/stats: everything the private dashboard (/dash) and scripts/stats.sh show, in one authenticated response.
 * Every number is a count; nothing here can identify a person or a device (docs/PRIVACY.md).
 */
import { funnel, readEvents, readVisits, EVENTS } from "./metrics.js";
import { readGithub } from "./github.js";
import { readStats } from "./usage.js";
import type { Env } from "./store.js";

export async function readAllStats(env: Env, days: number, now: number, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
  const base = await readStats(env.DB, days, now); // requests and share landings (usage.ts), unchanged shape
  const [events, github, visits] = await Promise.all([readEvents(env.DB, base.from), readGithub(env.DB, base.from), readVisits(env.CF_ANALYTICS_TOKEN, base.from, now, fetchFn)]);
  return {
    ...base,
    totals: { ...base.totals, events: Object.fromEntries(Object.entries(events).map(([e, s]) => [e, s.total])) },
    funnel: funnel(events, base.totals.shareLandings, visits),
    events,
    eventInfo: Object.fromEntries(Object.entries(EVENTS).map(([e, s]) => [e, { means: s.means, dims: s.dims.map(([d]) => d), country: s.country }])),
    visits,
    github,
  };
}
