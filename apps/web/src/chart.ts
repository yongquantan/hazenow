import { bandInfo, CHART_COPY, chartSummary, formatSgtTime, type HistoryPoint } from "hazenow";
import { esc } from "./util";

/**
 * The core trust visual (SPEC v1.2 §2): hourly 1-hr PM2.5 bars with NEA's 24-hr average PM2.5 as a line.
 * Same unit (µg/m³) on one axis, so the lag is visible without inventing an index.
 */
export interface ChartModel {
  bars: { time: string; v: number; color: string }[];
  line: { time: string; v: number }[];
  yMax: number;
}

/** Per-country overrides (SPEC v2.0). Omitted = Singapore, unchanged. */
export interface ChartOptions {
  id?: string;
  /** Bar colour for a 1-hr value (default: NEA bands). */
  color?: (v: number) => string;
  /** Guide lines (default: NEA Elevated 56 / High 151 / Very High 251). */
  guides?: { v: number; label: string }[];
  /** Clock label for a timestamp (default: SGT). */
  time?: (iso: string) => string;
  /** Lowest y-axis top (default: 130, or 180 above 120, so NEA's guides show). */
  floor?: number;
  /** Accessibility sentence for the line (default: NEA's 24-hr average). */
  lineName?: string;
}

export function chartModel(history: readonly HistoryPoint[], color: (v: number) => string = (v) => bandInfo(v).color, floor?: number): ChartModel {
  const bars = history.map((h) => ({ time: h.time, v: h.pm25, color: color(h.pm25) }));
  const line = history
    .filter((h) => typeof h.pm25Avg24h === "number")
    .map((h) => ({ time: h.time, v: h.pm25Avg24h as number }));
  const peak = Math.max(0, ...bars.map((b) => b.v), ...line.map((l) => l.v));
  // Always show the Elevated guide; show High's when the data gets near it.
  const yMax = Math.max(floor ?? (peak > 120 ? 180 : 130), Math.ceil((peak + 12) / 20) * 20);
  return { bars, line, yMax };
}

const W = 640;
const H = 250;
const PAD = { l: 36, r: 92, t: 18, b: 30 };

export function chartSvg(history: readonly HistoryPoint[], opts: ChartOptions = {}): string {
  const fmt = opts.time ?? formatSgtTime;
  if (history.length < 2) {
    return `<p class="chart-empty">Hourly history isn't available yet. The chart fills in as NEA's readings arrive.</p>`;
  }
  const m = chartModel(history, opts.color, opts.floor);
  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const tEnd = Date.parse(m.bars[m.bars.length - 1].time);
  const slots = 24;
  const slotW = pw / slots;
  const xOf = (t: string) => PAD.l + (slots - 1 - (tEnd - Date.parse(t)) / 3600_000) * slotW + slotW / 2;
  const yOf = (v: number) => PAD.t + ph - (v / m.yMax) * ph;

  const axis = (opts.floor !== undefined && m.yMax <= 100 ? [25, 50, 75] : [50, 100, 150, 200, 250, 300])
    .filter((g) => g < m.yMax)
    .map((g) => `<text x="${PAD.l - 8}" y="${yOf(g) + 5}" class="c-axis" text-anchor="end">${g}</text>`)
    .join("");
  const guides = (
    opts.guides ?? [
      { v: 56, label: CHART_COPY.guideElevated },
      { v: 151, label: CHART_COPY.guideHigh },
      { v: 251, label: "Very High 251" },
    ]
  )
    .filter((g) => g.v < m.yMax)
    .map(
      (g) =>
        `<line x1="${PAD.l}" x2="${W - PAD.r + 4}" y1="${yOf(g.v)}" y2="${yOf(g.v)}" class="c-guide"/>` +
        `<text x="${W - PAD.r + 16}" y="${yOf(g.v) + 4}" class="c-guide-l">${esc(g.label)}</text>`,
    )
    .join("");

  const bw = slotW * 0.68;
  const last = m.bars.length - 1;
  const bars = m.bars
    .map((b, i) => {
      const x = xOf(b.time) - bw / 2;
      const y = yOf(b.v);
      const h = Math.max(1.5, PAD.t + ph - y);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${b.color}" class="${i === last ? "c-bar c-bar-now" : "c-bar"}"><title>${esc(fmt(b.time))}: PM2.5 ${b.v}</title></rect>`;
    })
    .join("");

  let line = "";
  if (m.line.length >= 2) {
    const d = m.line.map((p, i) => `${i ? "L" : "M"}${xOf(p.time).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(" ");
    line = `<path d="${d}" class="c-line-halo"/><path d="${d}" class="c-line"/>`;
  }
  const lastLine = m.line[m.line.length - 1];
  const lastBar = m.bars[last];
  const barTop = yOf(lastBar.v);
  const valueLabel = `<text x="${xOf(lastBar.time)}" y="${Math.max(12, barTop - 7)}" class="c-end c-end-now" text-anchor="middle">${lastBar.v}</text>`;
  const lineDot = lastLine
    ? `<circle cx="${xOf(lastLine.time)}" cy="${yOf(lastLine.v)}" r="4.5" class="c-dot"/>`
    : "";

  const ticks = m.bars
    .filter((b, i) => i === last || (i < last - 2 && (tEnd - Date.parse(b.time)) % (6 * 3600_000) === 0))
    .map((b) => `<text x="${xOf(b.time)}" y="${H - 8}" class="c-axis" text-anchor="middle">${esc(fmt(b.time))}</text>`)
    .join("");

  const id = opts.id ?? "chart";
  const summary = opts.time ? chartSummary(history).replace(/ at [^.]*\./, ` at ${fmt(history.reduce((a, h) => (h.pm25 > a.pm25 ? h : a), history[0]).time)}.`).replace(/ NEA 24-hr PSI[^.]*\./, "") : chartSummary(history);
  const lineSummary =
    m.line.length >= 2 ? ` ${opts.lineName ?? "NEA's 24-hr average PM2.5"} went from ${m.line[0].v} to ${lastLine!.v}.` : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d">
<title id="${id}-t">${esc(CHART_COPY.title)}</title>
<desc id="${id}-d">${esc(summary + lineSummary)}</desc>
${axis}${guides}
<line x1="${PAD.l}" x2="${W - PAD.r + 4}" y1="${PAD.t + ph}" y2="${PAD.t + ph}" class="c-base"/>
${bars}${line}${lineDot}${valueLabel}${ticks}
</svg>`;
}
