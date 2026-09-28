/**
 * Adapters for jurisdictions whose sources need services/proxy (no CORS, HTML scraping, or budgeted polling):
 * MY (DOE APIMS + AirGradient), ID (BMKG + KLH ISPU + SiPongi + AirGradient), VN (Hanoi moitruongthudo +
 * AirGradient), PH and LA (AirGradient crowd only).
 *
 * Privacy (REGIONAL §4.1): these call GET {proxy}/v1/{cc}/observations — **no location is sent**. The snapshot
 * is built on the device with buildCountrySnapshot(). The proxy's /snapshot?lat&lon route exists only for
 * "dumb" clients (SwiftBar, Telegram, Home Assistant) and rounds coordinates to 2 dp.
 */
import { buildCountrySnapshot } from "../build.js";
import { COUNTRIES } from "../registry.js";
import type { AdapterContext, CountryAdapter, CountryCode, CountrySnapshot, FetchLike, ObservationSet } from "../types.js";

export class ProxyError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProxyError";
    this.status = status;
  }
}

/** Minimal shape check so a broken proxy can't feed garbage into the builder. */
export function isObservationSet(x: unknown, cc?: CountryCode): x is ObservationSet {
  if (!x || typeof x !== "object") return false;
  const s = x as ObservationSet;
  return (
    typeof s.country === "string" &&
    (!cc || s.country === cc) &&
    Array.isArray(s.observations) &&
    Array.isArray(s.attribution) &&
    s.observations.every((o) => o && typeof o.stationId === "string" && Number.isFinite(o.lat) && Number.isFinite(o.lon) && typeof o.periodEnd === "string")
  );
}

export function proxiedAdapter(country: CountryCode, meta: { kind: CountryAdapter["kind"] }): CountryAdapter {
  const id = `${country.toLowerCase()}.proxy`;
  const adapter: CountryAdapter = {
    id,
    country,
    kind: meta.kind,
    transport: "proxy",
    scaleId: COUNTRIES[country].chipScale,
    attribution: [],
    async fetchObservations(ctx: AdapterContext = {}): Promise<ObservationSet> {
      if (!ctx.proxyBase) throw new ProxyError(`${id}: proxyBase (HAZENOW_EDGE) is not configured`);
      const f: FetchLike | undefined = ctx.fetch ?? (globalThis.fetch?.bind(globalThis) as unknown as FetchLike);
      if (!f) throw new ProxyError("No fetch implementation available");
      const url = `${ctx.proxyBase.replace(/\/$/, "")}/v1/${country.toLowerCase()}/observations`;
      const res = await f(url, { signal: ctx.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new ProxyError(`HTTP ${res.status} for ${url}`, res.status);
      const body = await res.json();
      if (!isObservationSet(body, country)) throw new ProxyError(`Unexpected response for ${url}`);
      return body;
    },
    async getSnapshot(query = {}, ctx = {}): Promise<CountrySnapshot> {
      const set = await adapter.fetchObservations(ctx);
      return buildCountrySnapshot(set, query, ctx.now ?? Date.now());
    },
  };
  return adapter;
}

export const myAdapter = proxiedAdapter("MY", { kind: "mixed" });
export const idAdapter = proxiedAdapter("ID", { kind: "mixed" });
export const vnAdapter = proxiedAdapter("VN", { kind: "mixed" });
export const phAdapter = proxiedAdapter("PH", { kind: "crowd" });
export const laAdapter = proxiedAdapter("LA", { kind: "crowd" });
