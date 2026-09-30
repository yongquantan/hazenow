/**
 * SPEC v2.0 — Southeast Asia. Country adapters, band-scale registry, jurisdiction lookup, snapshot builder.
 * Everything here is additive; the SG v1 API in ../index.ts is unchanged.
 */
export * from "./types.js";
export * from "./scales.js";
export * from "./borders.js";
export * from "./crowd.js";
export * from "./quality.js";
export * from "./registry.js";
export * from "./build.js";
export * from "./locate.js";
export * from "./verdicts.js";
export * from "./places.js";
export * from "./guess.js";
export * from "./ui.js";
export { wallToIso, msToIso, localDate, localClock, offsetLabel } from "./time.js";
export * from "./sources/air4thai.js";
export * from "./sources/doe-my.js";
export * from "./sources/indonesia.js";
export * from "./sources/hanoi.js";
export * from "./sources/airgradient.js";
export { sgAdapter, fromSgSnapshot, sgObservations, NEA_ATTRIBUTION } from "./adapters/sg.js";
export { thAdapter, createThAdapter, TH_HISTORY_STATIONS } from "./adapters/th.js";
export { proxiedAdapter, isObservationSet, ProxyError, myAdapter, idAdapter, vnAdapter, phAdapter, laAdapter, khAdapter } from "./adapters/proxied.js";

import { sgAdapter } from "./adapters/sg.js";
import { thAdapter } from "./adapters/th.js";
import { idAdapter, khAdapter, laAdapter, myAdapter, phAdapter, vnAdapter } from "./adapters/proxied.js";
import type { CountryAdapter, CountryCode } from "./types.js";

/** Preferred adapter per jurisdiction (null = not feasible yet; see docs/sea/COVERAGE.md). */
export const ADAPTERS: Record<CountryCode, CountryAdapter | null> = {
  SG: sgAdapter,
  TH: thAdapter,
  MY: myAdapter,
  ID: idAdapter,
  VN: vnAdapter,
  PH: phAdapter,
  LA: laAdapter,
  KH: khAdapter,
  MM: null,
  BN: null,
  TL: null,
};

export function getAdapter(cc: CountryCode): CountryAdapter | null {
  return ADAPTERS[cc];
}
