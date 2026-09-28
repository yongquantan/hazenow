import { bandInfo, regionLabel, REGION_ORDER, type LatLon, type Snapshot } from "hazenow";
import { bandShape, esc } from "./util";

/** A deliberately simple outline of Singapore (lon, lat). Good enough to orient; not a survey map. */
const OUTLINE: [number, number][] = [
  [103.64, 1.305], [103.622, 1.33], [103.646, 1.352], [103.672, 1.384], [103.698, 1.422],
  [103.733, 1.444], [103.77, 1.449], [103.8, 1.4545], [103.83, 1.451], [103.858, 1.443],
  [103.88, 1.43], [103.903, 1.412], [103.93, 1.401], [103.962, 1.394], [103.992, 1.385],
  [104.028, 1.378], [104.043, 1.352], [104.012, 1.325], [103.975, 1.311], [103.932, 1.301],
  [103.892, 1.29], [103.862, 1.271], [103.836, 1.262], [103.81, 1.266], [103.78, 1.277],
  [103.752, 1.29], [103.722, 1.3], [103.69, 1.292], [103.662, 1.292],
];
const SENTOSA: [number, number][] = [
  [103.806, 1.254], [103.822, 1.246], [103.842, 1.247], [103.848, 1.252], [103.83, 1.258], [103.812, 1.259],
];

const LON0 = 103.6;
const LAT0 = 1.47;
const K = 1000;
const x = (lon: number) => (lon - LON0) * K;
const y = (lat: number) => (LAT0 - lat) * K;
const path = (pts: [number, number][]) =>
  pts.map(([lo, la], i) => `${i ? "L" : "M"}${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join(" ") + "Z";

export function mapSvg(s: Snapshot, opts: { selected?: string; point?: LatLon | null } = {}): string {
  const names = [...REGION_ORDER].filter((n) => s.regions[n]);
  const dots = names
    .map((n) => {
      const r = s.regions[n];
      const cx = x(r.lon);
      const cy = y(r.lat);
      const sel = opts.selected === n;
      const v = r.pm25;
      const info = v === null ? null : bandInfo(v);
      const label = v === null ? `${regionLabel(n)}: offline` : `${regionLabel(n)}: PM2.5 ${v}, ${info!.label}`;
      const left = n === "west";
      const tx = left ? cx - 19 : cx + 19;
      const anchor = left ? "end" : "start";
      return `<g class="m-region${sel ? " is-sel" : ""}${v === null ? " is-off" : ""}" data-action="region" data-region="${n}" role="button" tabindex="0" aria-label="${esc(label)}" aria-pressed="${sel}">
<rect x="${left ? cx - 78 : cx - 22}" y="${cy - 26}" width="100" height="50" rx="12" class="m-hit"/>
${sel ? `<circle cx="${cx}" cy="${cy}" r="16" class="m-ring"/>` : ""}
${info ? `<g transform="translate(${cx - 10} ${cy - 10})">${bandShape(info.shape, info.color, 20)}</g>` : `<circle cx="${cx}" cy="${cy}" r="7" class="m-offdot"/>`}
<text x="${tx}" y="${cy + 3}" class="m-val" text-anchor="${anchor}">${v ?? "off"}</text>
<text x="${tx}" y="${cy + 19}" class="m-name" text-anchor="${anchor}">${esc(regionLabel(n))}</text>
</g>`;
    })
    .join("");
  const me = opts.point
    ? `<g class="m-me" aria-hidden="true"><circle cx="${x(opts.point.lon)}" cy="${y(opts.point.lat)}" r="11" class="m-me-halo"/><circle cx="${x(opts.point.lon)}" cy="${y(opts.point.lat)}" r="5" class="m-me-dot"/></g>`
    : "";
  return `<svg class="map" viewBox="0 0 460 240" role="group" aria-label="Map of Singapore's five air-quality regions">
<path d="${path(OUTLINE)}" class="m-land"/><path d="${path(SENTOSA)}" class="m-land"/>
${dots}${me}
</svg>`;
}
