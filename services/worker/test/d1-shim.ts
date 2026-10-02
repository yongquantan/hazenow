/**
 * A D1Database over bun:sqlite, for unit tests: the Worker's real SQL (json_each inserts, upserts, retention) runs
 * against the real migration. Only the D1 surface the Worker uses: prepare/bind/first/all/run and batch.
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

class Stmt {
  constructor(private db: Database, readonly sql: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params);
  }
  private args() {
    return this.params.map((p) => (p === undefined ? null : p)) as (string | number | null)[];
  }
  async first<T>(): Promise<T | null> {
    return (this.db.query(this.sql).get(...this.args()) as T) ?? null;
  }
  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    return { results: this.db.query(this.sql).all(...this.args()) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.query(this.sql).run(...this.args());
    return { success: true, meta: { changes: r.changes } };
  }
  runSync() {
    return this.db.query(this.sql).run(...this.args());
  }
}

export class FakeD1 {
  readonly db = new Database(":memory:");
  constructor() {
    const sql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
    this.db.exec(sql);
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    const tx = this.db.transaction(() => stmts.map((s) => s.runSync()));
    return tx().map((r) => ({ success: true, meta: { changes: r.changes } }));
  }
  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
  /** Test helper: synchronous query. */
  q<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.db.query(sql).all(...params) as T[];
  }
}

export const asD1 = (f: FakeD1) => f as unknown as D1Database;
