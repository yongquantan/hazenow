/**
 * GET /api/where → {"country":"TH"} (SPEC v2.1, optional server hint for the first-run country guess).
 *
 * Privacy contract (keep it this small):
 * - Returns ONLY the two-letter country Cloudflare already derived for this connection (request.cf.country), or null.
 * - Never reads, echoes or logs the IP, city, region, coordinates, ASN or headers. No console.log at all.
 * - No cookies, no storage, no analytics. `Cache-Control: no-store` so no cache or proxy keeps an answer.
 * The client asks only when its device guess (time zone + languages) isn't sure, and never waits on it to render.
 * This is a Cloudflare Pages Function: `wrangler pages deploy` picks it up from ./functions and routes only /api/*
 * to it (static files stay free and never invoke a Function).
 */
export function onRequestGet({ request }) {
  const cc = request.cf && typeof request.cf.country === "string" ? request.cf.country.toUpperCase() : "";
  // XX = unknown, T1 = Tor: not countries.
  const country = /^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1" ? cc : null;
  return new Response(JSON.stringify({ country }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });
}
