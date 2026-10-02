/**
 * What the server covers and the attribution each country's responses carry. Shared by the proxy and the
 * Cloudflare Worker (services/worker), so both answer with the same strings.
 */
import {
  AG_ATTRIBUTION,
  AIR4THAI_ATTRIBUTION,
  BMKG_ATTRIBUTION,
  DOE_ATTRIBUTION,
  HANOI_ATTRIBUTION,
  KLH_ATTRIBUTION,
  NEA_ATTRIBUTION,
  SC_ATTRIBUTION,
  SIPONGI_ATTRIBUTION,
  type Attribution,
  type CountryCode,
} from "../../../packages/core/src/countries/index.js";

export const SERVED: CountryCode[] = ["SG", "TH", "MY", "ID", "VN", "PH", "LA", "KH"];
export const ANCHOR_RADIUS_KM = 10;
/** Crowd attribution: AirGradient (CC BY-SA 4.0) and the Sensor.Community rows its map carries (ODbL 1.0). */
const CROWD = [AG_ATTRIBUTION, SC_ATTRIBUTION];
export const ATTRIBUTION: Record<string, Attribution[]> = {
  SG: [NEA_ATTRIBUTION],
  TH: [AIR4THAI_ATTRIBUTION, ...CROWD],
  MY: [DOE_ATTRIBUTION, ...CROWD],
  ID: [BMKG_ATTRIBUTION, KLH_ATTRIBUTION, SIPONGI_ATTRIBUTION, ...CROWD],
  VN: [HANOI_ATTRIBUTION, ...CROWD],
  PH: CROWD,
  LA: CROWD,
  KH: CROWD,
};
export const ALL_ATTRIBUTION: Attribution[] = [...new Map(Object.values(ATTRIBUTION).flat().map((a) => [a.id, a])).values()];

