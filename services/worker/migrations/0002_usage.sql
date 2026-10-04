-- Aggregate usage counters (privacy: counts only). No IPs, user agents, coordinates, query strings or any
-- identifier are stored, ever. One row per (UTC day, country, endpoint) or (UTC day, card, country), with a count.
-- country is Cloudflare's request.cf.country (two letters, "XX" when unknown). Read via the authenticated /v1/stats.

-- /v1/* requests. endpoint is a fixed label such as "sg/observations", "auto/snapshot" or "sensors/uptime"
-- (never a sensor id, coordinate or anything taken verbatim from the URL).
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, country, endpoint)
) WITHOUT ROWID;

-- Share-card landings (/v1/hit?e=share_landing&card=…), sent once when the site or web app opens with ?s=<card>.
CREATE TABLE IF NOT EXISTS share_landings (
  day TEXT NOT NULL,
  card TEXT NOT NULL,
  country TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, card, country)
) WITHOUT ROWID;
