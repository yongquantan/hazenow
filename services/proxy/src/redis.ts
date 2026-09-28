/**
 * Minimal Redis client (RESP2 over TCP/TLS): AUTH, GET, SET PX, PING. Zero dependencies, one connection,
 * pipelined FIFO replies. Enough for a cache; not a general client.
 */
import net from "node:net";
import tls from "node:tls";

export type RespValue = string | number | null | RespValue[] | Error;

export function encodeCommand(args: readonly (string | number)[]): Buffer {
  const parts = [`*${args.length}\r\n`];
  for (const a of args) {
    const s = String(a);
    parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
  }
  return Buffer.from(parts.join(""));
}

/** Parse one RESP value from buf at offset; returns [value, nextOffset] or null if incomplete. */
export function parseResp(buf: Buffer, off = 0): [RespValue, number] | null {
  if (off >= buf.length) return null;
  const type = String.fromCharCode(buf[off]);
  const eol = buf.indexOf("\r\n", off);
  if (eol < 0) return null;
  const line = buf.toString("utf8", off + 1, eol);
  const next = eol + 2;
  switch (type) {
    case "+":
      return [line, next];
    case "-":
      return [new Error(line), next];
    case ":":
      return [Number(line), next];
    case "$": {
      const len = Number(line);
      if (len < 0) return [null, next];
      if (buf.length < next + len + 2) return null;
      return [buf.toString("utf8", next, next + len), next + len + 2];
    }
    case "*": {
      const n = Number(line);
      if (n < 0) return [null, next];
      const out: RespValue[] = [];
      let p = next;
      for (let i = 0; i < n; i++) {
        const r = parseResp(buf, p);
        if (!r) return null;
        out.push(r[0]);
        p = r[1];
      }
      return [out, p];
    }
    default:
      throw new Error(`Bad RESP type byte: ${type}`);
  }
}

export class RedisClient {
  private sock: net.Socket | null = null;
  private buf = Buffer.alloc(0);
  private queue: { resolve: (v: RespValue) => void; reject: (e: Error) => void }[] = [];
  private ready: Promise<void> | null = null;

  constructor(private url: string, private timeoutMs = 2000) {}

  private connect(): Promise<void> {
    if (this.ready) return this.ready;
    const u = new URL(this.url);
    const port = Number(u.port || 6379);
    const host = u.hostname;
    this.ready = new Promise<void>((resolve, reject) => {
      const onErr = (e: Error) => {
        this.fail(e);
        reject(e);
      };
      const sock = u.protocol === "rediss:" ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
      sock.setTimeout(this.timeoutMs, () => sock.destroy(new Error("redis timeout")));
      sock.once("error", onErr);
      sock.on("data", (d: Buffer) => this.onData(d));
      sock.on("close", () => this.fail(new Error("redis connection closed")));
      sock.once(u.protocol === "rediss:" ? "secureConnect" : "connect", async () => {
        sock.setTimeout(0);
        sock.off("error", onErr);
        sock.on("error", (e: Error) => this.fail(e));
        this.sock = sock;
        try {
          if (u.password) {
            const user = decodeURIComponent(u.username || "");
            const r = await this.raw(user ? ["AUTH", user, decodeURIComponent(u.password)] : ["AUTH", decodeURIComponent(u.password)]);
            if (r instanceof Error) throw r;
          }
          resolve();
        } catch (e) {
          onErr(e as Error);
        }
      });
    });
    return this.ready;
  }

  private fail(e: Error) {
    this.sock?.destroy();
    this.sock = null;
    this.ready = null;
    this.buf = Buffer.alloc(0);
    for (const q of this.queue.splice(0)) q.reject(e);
  }

  private onData(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const r = parseResp(this.buf, 0);
      if (!r) break;
      this.buf = this.buf.subarray(r[1]);
      this.queue.shift()?.resolve(r[0]);
    }
  }

  private raw(args: (string | number)[]): Promise<RespValue> {
    return new Promise((resolve, reject) => {
      if (!this.sock) return reject(new Error("redis not connected"));
      const t = setTimeout(() => reject(new Error("redis reply timeout")), this.timeoutMs);
      this.queue.push({
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
      this.sock.write(encodeCommand(args));
    });
  }

  async command(args: (string | number)[]): Promise<RespValue> {
    await this.connect();
    const r = await this.raw(args);
    if (r instanceof Error) throw r;
    return r;
  }

  async get(key: string): Promise<string | null> {
    const r = await this.command(["GET", key]);
    return typeof r === "string" ? r : null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.command(["SET", key, value, "PX", Math.max(1, Math.round(ttlMs))]);
  }

  close() {
    this.sock?.end();
    this.sock = null;
    this.ready = null;
  }
}
