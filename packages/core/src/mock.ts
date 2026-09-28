/** Deterministic QA scenarios (fixtures/scenarios/*.json) served through a fake fetch. */
import type { FetchLike } from "./client.js";
import type { ApiResponse } from "./parse.js";

export const SCENARIOS = [
  "normal",
  "elevated",
  "high",
  "very_high",
  "south_offline",
  "all_offline_stale",
  "rising_fast",
  "network_error",
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export interface Scenario {
  _meta: { scenario: string; description: string; now: string; simulate?: "network_error" };
  pm25?: ApiResponse;
  psi?: ApiResponse;
  pm25Yesterday?: ApiResponse;
  psiYesterday?: ApiResponse;
}

/**
 * A fetch that answers data.gov.sg URLs from a scenario. Use with `getSnapshot({ fetch, now: scenario._meta.now })`.
 * "Today" is the scenario's own date, so pass its `now` to keep dates aligned.
 */
export function scenarioFetch(sc: Scenario): FetchLike {
  const today = sc._meta.now.slice(0, 10);
  return async (url) => {
    if (sc._meta.simulate === "network_error") throw new TypeError("Failed to fetch (mock network_error)");
    const u = new URL(url);
    const kind = u.pathname.endsWith("/psi") ? "psi" : "pm25";
    const date = u.searchParams.get("date");
    let body: ApiResponse | undefined;
    if (!date || date === today) body = kind === "psi" ? sc.psi : sc.pm25;
    else body = kind === "psi" ? sc.psiYesterday : sc.pm25Yesterday;
    if (!body) return { ok: false, status: 404, json: async () => ({}) };
    const copy = JSON.parse(JSON.stringify(body));
    return { ok: true, status: 200, json: async () => copy };
  };
}
