/**
 * HazeNow data server — a free Cloudflare Worker (replaces the planned Railway proxy in services/proxy).
 *  - fetch: the proxy's HTTP API, answered from D1 (routes.ts). Never calls an upstream.
 *  - scheduled: every minute, one job (jobs.ts) polls the sources that are due and stores the composed sets.
 * Privacy: nothing is logged. The client IP is used only in memory for the per-isolate rate limit.
 */
import { runScheduled } from "./jobs.js";
import { handle } from "./routes.js";
import type { Env } from "./store.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let out;
    try {
      out = await handle({ method: request.method, url: request.url, ip: request.headers.get("cf-connecting-ip") ?? undefined }, env);
    } catch {
      out = { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: '{"error":"Internal error","attribution":[]}' };
    }
    return new Response(request.method === "HEAD" || out.status === 204 ? null : out.body, { status: out.status, headers: out.headers });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env, { fetch: (url, init) => fetch(url, init), now: controller.scheduledTime, neaKey: env.NEA_API_KEY }));
  },
} satisfies ExportedHandler<Env>;
