/** Dynamic SVG badge (shields-style). Pure string output: usable in a browser, a Worker (/badge.svg) or Node. */
import { bandInfo } from "./math.js";
import { placeLabel } from "./format.js";
import type { Snapshot } from "./types.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rough width estimate for 11px Verdana-ish text.
const textWidth = (s: string) => Math.round(s.length * 6.6 + 10);

export function badgeSvg(s: Snapshot, opts: { label?: string } = {}): string {
  const info = bandInfo(s.band);
  const left = opts.label ?? `haze · ${placeLabel(s).toLowerCase()}`;
  const right = `PM2.5 ${s.pm25} · ${info.label}${s.stale ? " (old)" : ""}`;
  const lw = textWidth(left);
  const rw = textWidth(right);
  const w = lw + rw;
  const textColor = s.band === "elevated" || s.band === "normal" ? "#1c1f24" : "#fff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(`${left}: ${right}`)}">
<title>${esc(`${left}: ${right}`)}</title>
<clipPath id="r"><rect width="${w}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#3b3f45"/><rect x="${lw}" width="${rw}" height="20" fill="${info.color}"/></g>
<g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${lw / 2}" y="14" fill="#fff">${esc(left)}</text>
<text x="${lw + rw / 2}" y="14" fill="${textColor}">${esc(right)}</text>
</g></svg>`;
}
