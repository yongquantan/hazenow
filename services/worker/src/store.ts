/**
 * D1 access. The Worker keeps everything in one D1 database (free tier):
 *  - kv: the cron jobs' output (composed ObservationSets, ready to serve as-is) and their state.
 *  - sensor_hours / station_hours: the hourly logs (migrations/0001_init.sql).
 * Why not KV or the Cache API: Workers KV's free tier allows 1,000 writes/day (the jobs need ~8,000), and the Cache
 * API is per data centre (a cron run's result would be invisible to users served elsewhere). D1 is global.
 */
export interface Env {
  DB: D1Database;
  /** Optional data.gov.sg production key (sent only to api-open.data.gov.sg). Absent by default. */
  NEA_API_KEY?: string;
}

export interface KvRow {
  k: string;
  v: string;
  at: number;
  status: number;
}

export async function kvGet(db: D1Database, k: string): Promise<KvRow | null> {
  return (await db.prepare("SELECT k, v, at, status FROM kv WHERE k = ?1").bind(k).first<KvRow>()) ?? null;
}

/** Several keys in one query. */
export async function kvGetMany(db: D1Database, keys: readonly string[]): Promise<Map<string, KvRow>> {
  const out = new Map<string, KvRow>();
  if (!keys.length) return out;
  const r = await db.prepare("SELECT k, v, at, status FROM kv WHERE k IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(keys)).all<KvRow>();
  for (const row of r.results ?? []) out.set(row.k, row);
  return out;
}

export async function kvPrefix(db: D1Database, prefix: string): Promise<KvRow[]> {
  // Range scan on the primary key (no LIKE: it would not use the index).
  const r = await db.prepare("SELECT k, v, at, status FROM kv WHERE k >= ?1 AND k < ?2").bind(prefix, prefix + "￿").all<KvRow>();
  return r.results ?? [];
}

export function kvPut(db: D1Database, k: string, v: string, at: number, status = 200): D1PreparedStatement {
  return db
    .prepare("INSERT INTO kv (k, v, at, status) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at, status = excluded.status")
    .bind(k, v, at, status);
}

export function parseOr<T>(row: KvRow | null | undefined, fallback: T): T {
  if (!row) return fallback;
  try {
    return JSON.parse(row.v) as T;
  } catch {
    return fallback;
  }
}

/** Key names, in one place. */
export const K = {
  set: (cc: string) => `set:${cc}`,
  setLowcost: (cc: string) => `set:${cc}:lowcost`,
  job: (job: string) => `job:${job}`,
  official: (cc: string) => `off:${cc}`,
  ring: (cc: string) => `ring:${cc}`,
  crowdSlice: (cc: string) => `crowd:${cc}`,
  crowdHourly: (cc: string) => `crowdh:${cc}`,
  crowdState: "crowd:state",
  sgRaw: "sg:raw",
  nea: (kind: string) => `nea:${kind}`,
  meta: "meta",
} as const;
