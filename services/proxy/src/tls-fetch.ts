/**
 * FetchImpl for the server: global fetch, except for hosts with a broken certificate chain (certs.ts), which go
 * through node:https with the missing public intermediates added. Handles gzip/deflate/br.
 */
import https from "node:https";
import tls from "node:tls";
import zlib from "node:zlib";
import { CHAIN_FIX_HOSTS, ISRG_ROOT_YR_CROSS_X1, LETS_ENCRYPT_YR1 } from "./certs.js";
import type { FetchImpl } from "./upstream.js";

const CA = [...tls.rootCertificates, LETS_ENCRYPT_YR1, ISRG_ROOT_YR_CROSS_X1];

export function httpsWithExtraCa(url: string, init: { headers?: Record<string, string>; signal?: AbortSignal } = {}): ReturnType<FetchImpl> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers: { "accept-encoding": "gzip, deflate, br", ...init.headers }, ca: CA, signal: init.signal }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        const enc = String(res.headers["content-encoding"] ?? "");
        try {
          if (enc.includes("gzip")) buf = zlib.gunzipSync(buf);
          else if (enc.includes("deflate")) buf = zlib.inflateSync(buf);
          else if (enc.includes("br")) buf = zlib.brotliDecompressSync(buf);
        } catch (e) {
          return reject(e);
        }
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (n: string) => (res.headers[n.toLowerCase()] as string | undefined) ?? null },
          text: async () => buf.toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export function chainFixedFetch(base: FetchImpl, hosts: readonly string[] = CHAIN_FIX_HOSTS, fix: FetchImpl = httpsWithExtraCa): FetchImpl {
  return (url, init) => {
    const host = new URL(url).hostname;
    return hosts.includes(host) ? fix(url, init) : base(url, init);
  };
}
