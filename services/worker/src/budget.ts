/**
 * Budget math for /health and the tests: what the schedule costs per day on the free plan.
 *
 * Upstream calls are simulated minute by minute over one UTC day with the real schedule (jobs.ts), the real due
 * rule (poll.ts: each source's TTL, which depends on the minute of the hour) and the hourly caps, assuming every
 * call succeeds.
 * Failures only ever reduce calls (backoff). Per-station sources (Hanoi) are counted for HANOI_STATIONS stations.
 */
import { SCHEDULE, JOB_SOURCES, type JobName } from "./jobs.js";
import { DUE_SLACK_MS, SOURCES, ttlOf } from "./poll.js";
/** simulateDay(), precomputed: a cold isolate would spend ~10 ms CPU simulating 1,440 minutes on every /health.
 *  The tests fail if it drifts from the schedule; regenerate with `bun run budget`. */
import PER_SOURCE from "./budget-data.json";

export const FREE_PLAN = { requestsPerDay: 100_000, cpuMsPerInvocation: 10, d1RowsReadPerDay: 5_000_000, d1RowsWrittenPerDay: 100_000 };
/** Hanoi stations with data in the last 2 days (4 on 30 Sep 2026, as seen by the live Worker). */
export const HANOI_STATIONS = 4;

/** (source id, sub-key, calls per due check) polled by each job run. */
const PLAN: Record<JobName, [string, string][]> = {
  crowd: [["crowd.airgradient", ""]],
  TH: [["th.air4thai.aqi", ""]], // history follows each aqi call (counted below)
  MY: [["my.doe", ""]],
  SG: [["sg.nea.v1", "pm25"], ["sg.nea.v1", "psi"], ["sg.nea.v2", "pm25"], ["sg.nea.v2", "psi"]],
  ID: [["id.bmkg", ""], ["id.klh.ispu", ""], ["id.sipongi", ""]],
  VN: [["vn.hanoi.site", ""], ...Array.from({ length: HANOI_STATIONS }, (_, i) => [["vn.hanoi.stat", String(i)], ["vn.hanoi.aqi", String(i)]] as [string, string][]).flat()],
};

export function simulateDay(day = Date.parse("2026-09-30T00:00:00Z")): Record<string, number> {
  const okAt = new Map<string, number>();
  const calls: Record<string, number> = {};
  const hist: Record<string, number[]> = {};
  for (const id of Object.values(JOB_SOURCES).flat()) calls[id] = 0;
  for (let m = 0; m < 1440; m++) {
    const now = day + m * 60_000;
    for (const job of SCHEDULE[m % 5]) {
      for (const [id, sub] of PLAN[job]) {
        const key = `${id}|${sub}`;
        const last = okAt.get(key);
        if (last !== undefined && now - last < ttlOf(SOURCES[id], now) - DUE_SLACK_MS) continue;
        // The hourly cap (poll.ts allowed()): across a source's stations, never more than budgetPerHour.
        const recent = (hist[id] ??= []).filter((t) => now - t < 3600_000);
        hist[id] = recent;
        if (recent.length >= SOURCES[id].budgetPerHour) continue;
        recent.push(now);
        okAt.set(key, now);
        calls[id]++;
        if (id === "th.air4thai.aqi") calls["th.air4thai.history"]++;
      }
    }
  }
  return calls;
}

let cached: ReturnType<typeof compute> | null = null;
function compute() {
  const perSource: Record<string, number> = PER_SOURCE;
  const upstreamCallsPerDay = Object.values(perSource).reduce((a, b) => a + b, 0);
  const cronInvocationsPerDay = 1440;
  return {
    freePlan: FREE_PLAN,
    cronInvocationsPerDay,
    /** Everything the free daily request allowance leaves for users after the cron's own invocations. */
    requestsLeftForUsersPerDay: FREE_PLAN.requestsPerDay - cronInvocationsPerDay,
    upstreamCallsPerDay,
    upstreamCallsPerDayBySource: perSource,
    maxUpstreamCallsPerHour: Object.values(JOB_SOURCES)
      .flat()
      .reduce((s, id) => s + SOURCES[id].budgetPerHour, 0),
    note: "Upstream calls depend only on this schedule, never on user traffic. Hanoi counted for 4 stations.",
  };
}

export function budget() {
  return (cached ??= compute());
}
