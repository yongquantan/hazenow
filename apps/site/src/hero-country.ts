/**
 * SPEC v2.1 on the site: the hero's live card for a place outside Singapore (a guessed country, or one picked in the
 * card's menu). Loaded on demand, so Singapore visitors never download the SEA catalogue, borders or preview data.
 * Same shared core as the web app: the snapshot is built on the device, and the location never leaves it.
 */
import { sea } from "hazenow";

type CountryCode = import("hazenow").sea.CountryCode;
type CityPlace = import("hazenow").sea.CityPlace;
type CountrySnapshot = import("hazenow").sea.CountrySnapshot;

export { sea };

const PROXY_URL: string | null = ((import.meta.env.VITE_PROXY_URL as string | undefined) ?? "").trim() || null;
const previewFiles = import.meta.glob<import("hazenow").sea.ObservationSet>("../../../packages/core/fixtures/sea/preview/*.json", { import: "default" });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export const findPlace = (cc: string, id: string): CityPlace | null => (sea.isCountryCode(cc) ? sea.findCity(id, cc as CountryCode) : null);
export const countryName = (cc: CountryCode) => sea.COUNTRIES[cc].name;

/** One starting place per covered country, for the card's menu (the guessed place is added by the caller). */
export function menuPlaces(): CityPlace[] {
  return sea.PICKER_COUNTRIES.filter((cc) => cc !== "SG" && sea.COUNTRIES[cc].status !== "not_feasible").map((cc) => sea.defaultCity(cc));
}

export interface HeroResult {
  /** The band colour for the card's top rule and pip (neutral when there's no band). */
  color: string;
  mode: import("hazenow").sea.DataMode;
  agency: string | null;
}

async function load(c: CityPlace, signal: AbortSignal): Promise<{ s: CountrySnapshot; mode: "live" | "preview" } | null> {
  const mode = sea.cityMode(c, !!PROXY_URL);
  if (mode === "unavailable") return null;
  const q = sea.placeQuery(c);
  if (mode === "preview") {
    const f = previewFiles[`../../../packages/core/fixtures/sea/preview/${c.country.toLowerCase()}.json`];
    if (!f) return null;
    return { s: sea.buildCountrySnapshot(await f(), q, Date.parse(sea.PREVIEW_CAPTURED_AT)), mode };
  }
  const adapter = sea.getAdapter(c.country);
  if (!adapter) return null;
  return { s: await adapter.getSnapshot(q, { signal, near: { lat: c.lat, lon: c.lon }, proxyBase: PROXY_URL ?? undefined }), mode };
}

/** Render the card body for a place outside Singapore. `shape` draws the band's shape cue (from main.ts). */
export async function renderCountryHero(
  body: HTMLElement,
  c: CityPlace,
  signal: AbortSignal,
  shape: (shape: string, color: string) => string,
): Promise<HeroResult | null> {
  const got = await load(c, signal);
  if (signal.aborted) return null;
  const neutral = "#8FA3AD";
  if (!got) {
    const na = sea.notAvailable(c);
    body.innerHTML = `<p class="verdict">${esc(na.headline)}</p><p class="second">${esc(na.reason)}</p>`;
    return { color: neutral, mode: "unavailable", agency: null };
  }
  const { s, mode } = got;
  const offset = -new Date().getTimezoneOffset() / 60;
  const d = sea.countryDisplay(s, { placeName: c.name, viewerOffsetHours: offset, lon: c.lon });
  const v = sea.countryVerdict(s, ["general"]);
  const color = d.chip?.color ?? neutral;
  const chip = d.chip
    ? `<span class="chip${s.stale ? " chip-old" : ""}">${shape(d.chip.shape, d.chip.color)}${esc(d.chip.en)}${
        d.chip.local ? ` <span class="chip-local" lang="${esc(d.chip.lang)}">${esc(d.chip.local)}</span>` : ""
      }${s.stale ? " (old)" : ""}</span>`
    : "";
  const number =
    s.pm25 !== null
      ? `<div class="num-row"><span class="num">${s.pm25}</span><span class="unit">µg/m³<span>${esc(d.numberSub)}</span></span></div>
    ${d.kindLabel ? `<p class="unc">${esc(d.kindLabel)}${s.range ? ` · range ${s.range[0]}–${s.range[1]}` : ""}</p>` : ""}
    ${chip ? `<p class="chips">${chip}</p>` : ""}
    ${d.chip ? `<p class="anchor">${esc(d.chip.basisNote)}</p>` : ""}`
      : `<p class="second">${esc(d.noNumber?.title ?? "")}. ${esc(d.noNumber?.line ?? "")}</p>${chip ? `<p class="chips">${chip}</p>` : ""}`;
  body.innerHTML = `
    ${mode === "preview" ? `<p class="preview-note">${esc(sea.previewRibbon(s, offset, c.lon))}</p>` : ""}
    <p class="verdict">${esc(v.headline)}</p>
    ${v.secondLine && v.secondLine !== d.whoLine ? `<p class="second">${esc(v.secondLine)}</p>` : ""}
    ${number}
    ${d.whoLine ? `<p class="anchor">${esc(d.whoLine)}</p>` : ""}
    ${d.official ? `<div class="official"><p><strong>${esc(`${d.official.label}: ${d.official.value}${d.official.en ?? d.official.local ? ` · ${d.official.en ?? d.official.local}` : ""}`)}</strong><span>${esc(d.officialExplainer ?? "")}</span></p></div>` : ""}
    ${d.provenance ? `<p class="prov">${esc(d.provenance)}</p>` : ""}`;
  return { color, mode, agency: sea.mainAgency(s) };
}
