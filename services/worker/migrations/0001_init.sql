-- HazeNow data server (services/worker). D1 free tier: 5 GB, 5M rows read/day, 100k rows written/day.

-- Small key → value store for the cron jobs' output and state (composed ObservationSets, rings, source state).
-- One row per key; every value is a JSON text. `status` is the HTTP status a route should answer with.
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  at INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 200
) WITHOUT ROWID;

-- Hourly community-sensor log (docs/sea/COMMUNITY_SENSORS.md, "the single most useful next step").
-- One row per sensor per clock hour. hour = hour-ENDING epoch seconds (UTC). Coordinates rounded to 3 dp.
-- pm25 = mean of the samples polled in that hour (as served: AirGradient EPA-corrected, Sensor.Community raw),
-- n = samples, fresh = 1 when n >= 6 (half the hour covered), else 0 (stale: seen, but not reporting).
CREATE TABLE IF NOT EXISTS sensor_hours (
  id TEXT NOT NULL,
  hour INTEGER NOT NULL,
  network TEXT NOT NULL,
  country TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  pm25 REAL,
  rh REAL,
  n INTEGER NOT NULL,
  fresh INTEGER NOT NULL,
  PRIMARY KEY (id, hour)
) WITHOUT ROWID;

-- Hourly official-station log, for each sensor's agreement with its nearest official station.
-- pm25 = 1-hr PM2.5 (TH, ID BMKG, VN); pm25_24h = the authority's 24-hr value (TH, MY implied, ID ISPU).
CREATE TABLE IF NOT EXISTS station_hours (
  id TEXT NOT NULL,
  hour INTEGER NOT NULL,
  country TEXT NOT NULL,
  pm25 REAL,
  pm25_24h REAL,
  PRIMARY KEY (id, hour)
) WITHOUT ROWID;
