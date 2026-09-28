import "./styles.css";
import { bandInfo, type Snapshot } from "hazenow";
import { store } from "./util";

// Tint the page with the last reading this device saw (no network needed).
// Find the most recently saved snapshot for the current place.
type Place = { kind: string; region?: string; point?: { lat: number; lon: number } };
const w = store.get<Place | null>("hn.where", null);
const key = !w ? "island" : w.kind === "region" ? w.region : w.kind === "island" ? "island" : `pt:${w.point?.lat},${w.point?.lon}`;
const s = store.get<Snapshot | null>(`hn.snap.${key}`, null);
if (s) {
  document.documentElement.style.setProperty("--band", bandInfo(s.band).color);
  document.documentElement.dataset.band = s.band;
}
