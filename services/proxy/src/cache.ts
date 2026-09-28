/**
 * Upstream payload cache. In-memory by default; Redis when REDIS_URL is set (survives restarts, lets a second
 * replica read what the poller wrote). Redis errors never fail a request: we fall back to memory and say so in /health.
 */
import { RedisClient } from "./redis.js";

export interface CacheEntry<T = unknown> {
  data: T;
  /** When the upstream answered (ms). The real age is always reported; never re-stamped. */
  fetchedAt: number;
}

export interface Cache {
  kind: "memory" | "redis";
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  /** keepMs: how long to keep the entry for stale-if-error serving (not the freshness TTL). */
  set<T>(key: string, entry: CacheEntry<T>, keepMs: number): Promise<void>;
  lastError?: string | null;
}

export class MemoryCache implements Cache {
  kind = "memory" as const;
  private m = new Map<string, { e: CacheEntry; until: number }>();
  constructor(private clock: () => number = Date.now, private maxEntries = 500) {}
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const v = this.m.get(key);
    if (!v) return null;
    if (v.until < this.clock()) {
      this.m.delete(key);
      return null;
    }
    return v.e as CacheEntry<T>;
  }
  async set<T>(key: string, entry: CacheEntry<T>, keepMs: number): Promise<void> {
    if (this.m.size >= this.maxEntries && !this.m.has(key)) this.m.delete(this.m.keys().next().value as string);
    this.m.set(key, { e: entry, until: this.clock() + keepMs });
  }
}

export class RedisCache implements Cache {
  kind = "redis" as const;
  lastError: string | null = null;
  private mem: MemoryCache;
  constructor(private client: Pick<RedisClient, "get" | "set">, clock: () => number = Date.now, private prefix = "hazenow:") {
    this.mem = new MemoryCache(clock);
  }
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = await this.mem.get<T>(key);
    if (hit) return hit;
    try {
      const s = await this.client.get(this.prefix + key);
      this.lastError = null;
      return s ? (JSON.parse(s) as CacheEntry<T>) : null;
    } catch (e) {
      this.lastError = (e as Error).message;
      return null;
    }
  }
  async set<T>(key: string, entry: CacheEntry<T>, keepMs: number): Promise<void> {
    await this.mem.set(key, entry, keepMs);
    try {
      await this.client.set(this.prefix + key, JSON.stringify(entry), keepMs);
      this.lastError = null;
    } catch (e) {
      this.lastError = (e as Error).message;
    }
  }
}

export function createCache(redisUrl: string | undefined, clock: () => number = Date.now): Cache {
  if (!redisUrl) return new MemoryCache(clock);
  return new RedisCache(new RedisClient(redisUrl), clock);
}
