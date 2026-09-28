import {
  bandInfo,
  CHART_COPY,
  formatSgtTime,
  officialPsiLabel,
  placeLabel,
  psiLabel,
  trendWords,
  WHY_TWO_NUMBERS_SHORT,
  type Snapshot,
} from "hazenow";
import { chartModel } from "./chart";

const SERIF = `"Instrument Serif", Georgia, serif`;
const SANS = `"Instrument Sans", system-ui, sans-serif`;
const PAPER = "#f3f1ec";
const INK = "#14232b";
const INK2 = "#4f555e";
const RULE = "#d9d3c7";
const EDGE = "#14232b";

/**
 * Shareable image (1200×630): the number, the band, and the hourly-vs-24-hr chart in µg/m³.
 * No verdict (advice depends on the reader's profile, COPY §15) and no Instant PSI (SPEC v1.2 §1).
 */
export async function shareCardPng(s: Snapshot, place: string = placeLabel(s)): Promise<Blob> {
  try {
    await document.fonts?.ready;
  } catch {
    /* fonts optional */
  }
  const W = 1200;
  const H = 630;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const info = bandInfo(s.band);

  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  const wash = g.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, rgba(info.color, 0.16));
  wash.addColorStop(1, rgba(info.color, 0.02));
  g.fillStyle = wash;
  g.fillRect(0, 0, W, H);

  // Header: brand mark (dot = live band colour, haze lines in ink) + wordmark
  drawMark(g, 60, 50, 40, info.color);
  g.fillStyle = INK;
  g.font = `650 26px ${SANS}`;
  g.fillText("HazeNow", 108, 80);
  const hw = g.measureText("HazeNow").width;
  g.fillStyle = INK2;
  g.font = `400 24px ${SANS}`;
  g.fillText(`·  ${place}  ·  ${formatSgtTime(s.observedAt)} reading`, 108 + hw + 14, 80);

  // Number block
  g.fillStyle = INK;
  g.font = `400 230px ${SERIF}`;
  const num = String(s.pm25);
  g.fillText(num, 56, 330);
  const nw = g.measureText(num).width;
  const sx = 56 + nw + 20;
  g.font = `650 30px ${SANS}`;
  g.fillText("µg/m³", sx, 196);
  g.font = `400 22px ${SANS}`;
  g.fillStyle = INK2;
  g.fillText("PM2.5, last hour", sx, 228);
  // band chip
  g.fillStyle = rgba(info.color, 0.2);
  roundRect(g, sx, 256, 44 + measure(g, info.label, `650 24px ${SANS}`), 44, 22);
  g.fill();
  drawShape(g, info.shape, info.color, sx + 12, 267, 22);
  g.fillStyle = INK;
  g.font = `650 24px ${SANS}`;
  g.fillText(info.label, sx + 42, 287);

  g.fillStyle = INK;
  g.font = `500 26px ${SANS}`;
  g.fillText(trendWords(s.history), 64, 400);
  g.fillStyle = INK2;
  g.font = `400 24px ${SANS}`;
  g.fillText(officialPsiLabel(s.officialPsi24h, psiLabel), 64, 442);
  g.fillText("24-hour average", 64, 474);

  // Chart
  const m = chartModel(s.history);
  const cx = 640;
  const cy = 130;
  const cw = 400;
  const ch = 320;
  const tEnd = m.bars.length ? Date.parse(m.bars[m.bars.length - 1].time) : 0;
  const slot = cw / 24;
  const xOf = (t: string) => cx + (23 - (tEnd - Date.parse(t)) / 3600_000) * slot + slot / 2;
  const yOf = (v: number) => cy + ch - (v / m.yMax) * ch;
  g.font = `500 17px ${SANS}`;
  for (const guide of [
    { v: 56, label: CHART_COPY.guideElevated },
    { v: 151, label: CHART_COPY.guideHigh },
  ]) {
    if (guide.v >= m.yMax) continue;
    g.strokeStyle = "#b9b2a4";
    g.setLineDash([4, 6]);
    g.beginPath();
    g.moveTo(cx, yOf(guide.v));
    g.lineTo(cx + cw + 6, yOf(guide.v));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = INK2;
    g.fillText(guide.label, cx + cw + 12, yOf(guide.v) + 6);
  }
  m.bars.forEach((b, i) => {
    g.fillStyle = rgba(b.color, i === m.bars.length - 1 ? 1 : 0.6);
    g.fillRect(xOf(b.time) - slot * 0.34, yOf(b.v), slot * 0.68, cy + ch - yOf(b.v));
  });
  if (m.line.length > 1) {
    g.lineJoin = "round";
    g.beginPath();
    m.line.forEach((p, i) => (i ? g.lineTo(xOf(p.time), yOf(p.v)) : g.moveTo(xOf(p.time), yOf(p.v))));
    g.strokeStyle = PAPER;
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.stroke();
  }
  g.strokeStyle = "#8a8f96";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx, cy + ch);
  g.lineTo(cx + cw + 6, cy + ch);
  g.stroke();
  // legend
  g.font = `400 19px ${SANS}`;
  g.fillStyle = rgba(info.color, 0.85);
  g.fillRect(cx, cy + ch + 26, 12, 16);
  g.fillStyle = INK2;
  g.fillText(CHART_COPY.legendBars, cx + 22, cy + ch + 41);
  g.fillStyle = INK;
  g.fillRect(cx, cy + ch + 62, 18, 4);
  g.fillStyle = INK2;
  g.fillText(CHART_COPY.legendLine, cx + 26, cy + ch + 70);

  // Footer
  g.strokeStyle = RULE;
  g.beginPath();
  g.moveTo(64, 556);
  g.lineTo(W - 64, 556);
  g.stroke();
  g.fillStyle = INK2;
  g.font = `400 20px ${SANS}`;
  g.fillText(`${WHY_TWO_NUMBERS_SHORT} Data: NEA via data.gov.sg`, 64, 594);
  g.textAlign = "right";
  g.fillStyle = INK;
  g.font = `650 21px ${SANS}`;
  g.fillText("hazenow.sg", W - 64, 594);
  g.textAlign = "left";

  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

/** Brand mark C on a 100-unit grid, scaled to `size` px at (x, y). */
function drawMark(g: CanvasRenderingContext2D, x: number, y: number, size: number, dot: string) {
  const k = size / 100;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.fillStyle = dot;
  g.beginPath();
  g.arc(50, 38, 17, 0, Math.PI * 2);
  g.fill();
  for (const [rx, ry, w, a] of [
    [17, 61, 66, 1],
    [27, 73.5, 46, 0.7],
    [38, 86, 24, 0.45],
  ]) {
    g.globalAlpha = a;
    g.fillStyle = INK;
    roundRect(g, rx, ry, w, 7.5, 3.75);
    g.fill();
  }
  g.restore();
}

function measure(g: CanvasRenderingContext2D, text: string, font: string) {
  const f = g.font;
  g.font = font;
  const w = g.measureText(text).width;
  g.font = f;
  return w;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawShape(g: CanvasRenderingContext2D, shape: string, color: string, x: number, y: number, s: number) {
  const h = s / 2;
  g.beginPath();
  if (shape === "triangle") {
    g.moveTo(x + h, y + 1);
    g.lineTo(x + s - 1, y + s - 2);
    g.lineTo(x + 1, y + s - 2);
    g.closePath();
  } else if (shape === "octagon") {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      const px = x + h + (h - 1) * Math.cos(a);
      const py = y + h + (h - 1) * Math.sin(a);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
  } else {
    g.arc(x + h, y + h, h - 1, 0, Math.PI * 2);
  }
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = EDGE;
  g.stroke();
  if (shape === "half") {
    g.fillStyle = EDGE;
    g.fillRect(x + h - s * 0.28, y + h - 1.5, s * 0.56, 3);
  }
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
