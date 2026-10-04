/**
 * GET /widget/HazeNow.scriptable: serves the static file unchanged, and adds 1 to the data server's aggregate
 * `scriptable_file` counter (docs/PRIVACY.md). The beacon carries only the fixed event name: no IP, user agent,
 * country or anything else about the request. Fire-and-forget (waitUntil), so the download never waits on it.
 * Static files elsewhere never invoke a Function (wrangler routes only /api/* and /widget/* here).
 */
const HIT = "https://hazenow-data.yongquan26.workers.dev/v1/hit?e=scriptable_file";

export async function onRequestGet({ request, env, params, waitUntil }) {
  const res = await env.ASSETS.fetch(request);
  if (params.file !== "HazeNow.scriptable" || !res.ok) return res;
  waitUntil(fetch(HIT, { method: "POST" }).catch(() => {}));
  const out = new Response(res.body, res);
  // Same headers as public/_headers (they don't apply to Function responses).
  out.headers.set("content-type", "application/octet-stream");
  out.headers.set("content-disposition", 'attachment; filename="HazeNow.scriptable"');
  out.headers.set("cache-control", "no-store"); // every download reaches this Function, so every download counts
  out.headers.set("x-content-type-options", "nosniff");
  return out;
}
