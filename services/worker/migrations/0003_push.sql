-- Opt-in Web Push haze alerts (src/push.ts). One row per browser that turned alerts on, deleted when it turns them
-- off (POST /v1/push/unsubscribe) or when its push service says the subscription is gone (404/410).
-- Stored, and nothing else: the push endpoint and its keys (from the browser), the place (country + area/region id,
-- never coordinates), the alert prefs (profiles, the Elevated opt-in), the alert state machine's last state, and the
-- day it was created. No IP, user agent, coordinates or any other identifier.
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- "SG:area:Tampines" | "SG:region:west" | "SG:island"
  place TEXT NOT NULL,
  -- JSON {"profiles":["kids"],"elevated":null}
  prefs TEXT NOT NULL,
  -- JSON AlertState (packages/core/src/alerts.ts); '{}' until the first hourly evaluation
  state TEXT NOT NULL DEFAULT '{}',
  -- UTC midnight of the day it was created (epoch seconds), deliberately coarse
  created_at INTEGER NOT NULL
);

-- Per-place caps and place-ordered sends (one snapshot per place per batch).
CREATE INDEX IF NOT EXISTS push_subs_place ON push_subs (place, id);
