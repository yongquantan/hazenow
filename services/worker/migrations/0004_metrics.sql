-- Product metrics, counts only (docs/PRIVACY.md lists every counter). 0003 is left for the Web Push table.
-- Nothing here can identify a person or a device: no IPs, user agents, coordinates, device or user ids, fingerprints.
-- Any "once per day/week/device" dedupe happens on the device (a localStorage flag decides whether to send the +1).

-- One row per (UTC day, event, country, a, b) with a count. event, a and b come from a fixed allow-list in
-- src/metrics.ts (e.g. app_open / app|browser / new|returning); "" when a dimension isn't used. country is Cloudflare's
-- request.cf.country ("" for events that don't record it).
CREATE TABLE IF NOT EXISTS metric_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  country TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, event, country, a, b)
) WITHOUT ROWID;

-- GitHub's traffic API keeps 14 days only, so a daily archive (the Worker cron, src/github.ts). Public repo numbers.
-- Views and clones per day, as GitHub reports them (re-written while a day is still inside GitHub's 14-day window).
CREATE TABLE IF NOT EXISTS gh_traffic (
  day TEXT PRIMARY KEY,
  views INTEGER NOT NULL,
  view_uniques INTEGER NOT NULL,
  clones INTEGER NOT NULL,
  clone_uniques INTEGER NOT NULL
) WITHOUT ROWID;

-- One snapshot per UTC day (the last run of the day wins): stars, forks, watchers, the top referrers (14-day totals,
-- JSON [{referrer, count, uniques}]) and cumulative release downloads per asset name (JSON {name: count}).
CREATE TABLE IF NOT EXISTS gh_daily (
  day TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  forks INTEGER NOT NULL,
  watchers INTEGER NOT NULL,
  referrers TEXT NOT NULL,
  downloads TEXT NOT NULL
) WITHOUT ROWID;
