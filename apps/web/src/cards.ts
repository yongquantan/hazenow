/**
 * Share-card renderer (SPEC v1.6, docs/share-cards/*.html are the source of truth).
 *
 * Canvas 2D at exact pixel sizes (1080×1350 cards, 1200×630 link preview), independent of devicePixelRatio.
 * We lay text out ourselves to mirror the designs' flexbox: CSS "normal" line height comes from the font's
 * own ascent/descent, explicit line-heights use CSS half-leading, and vertical `space-between` is computed.
 * Canvas (not SVG foreignObject) because Safari taints canvases that draw foreignObject SVGs.
 */
import { bandInfo, type Band, type ShareCardContent, type TrendDirection } from "hazenow";

export const CARD_W = 1080;
export const CARD_H = 1350;
export const WIDE_W = 1200;
export const WIDE_H = 630;

const FAMILY = `"Apfel Grotezk", system-ui, -apple-system, "Segoe UI", sans-serif`;
const C = {
  ink: "#14232B",
  ivory: "#F5F0E6",
  paper: "#F3F1EC",
  mist: "#9FB3BB",
  sub: "#3D4F57",
  body: "#24363E",
  label: "#4A5C64",
  rule: "#D9D4C9",
  boxRule: "#E2DDD2",
  white: "#FFFFFF",
  darkSub: "#C9D5DA",
  darkBody: "#D5DEE1",
  darkRule: "#2E4550",
  darkBox: "#3A5260",
  bar: "#4E6874",
  clearBg: "#EEF3EC",
  clearRule: "#C9D6C8",
};
type Weight = 400 | 500 | 700;
type G = CanvasRenderingContext2D;

/** Load all three Apfel weights before drawing (text must never render in a fallback font). */
export async function ensureCardFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  await Promise.all(([400, 500, 700] as const).map((w) => document.fonts.load(`${w} 40px "Apfel Grotezk"`)));
  await document.fonts.ready;
}

/* ------------------------------------------------------------------ text engine */

const hasLS = typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;

interface Style {
  size: number;
  weight: Weight;
  /** letter-spacing in em */
  ls?: number;
  /** line-height multiplier; undefined = CSS "normal" */
  lh?: number;
  upper?: boolean;
}

function setFont(g: G, st: Style) {
  g.font = `${st.weight} ${st.size}px ${FAMILY}`;
  if (hasLS) (g as G & { letterSpacing: string }).letterSpacing = `${(st.ls ?? 0) * st.size}px`;
}

function textWidth(g: G, text: string, st: Style): number {
  setFont(g, st);
  if (hasLS || !st.ls) return g.measureText(text).width;
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + st.ls * st.size;
  return w;
}

function fontMetrics(g: G, st: Style) {
  setFont(g, st);
  const m = g.measureText("Hgµ");
  const asc = m.fontBoundingBoxAscent ?? st.size * 0.8;
  const desc = m.fontBoundingBoxDescent ?? st.size * 0.22;
  return { asc, desc, normal: asc + desc };
}

function lineHeightPx(g: G, st: Style) {
  return st.lh ? st.lh * st.size : fontMetrics(g, st).normal;
}

function drawRun(g: G, text: string, x: number, baseline: number, st: Style, color: string, align: "left" | "right" | "center" = "left") {
  const t = st.upper ? text.toUpperCase() : text;
  const w = textWidth(g, t, st);
  let x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  // CSS letter-spacing trails every glyph; right-aligned text in the designs includes that trailing space.
  setFont(g, st);
  g.fillStyle = color;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  if (hasLS || !st.ls) {
    g.fillText(t, x0, baseline);
    return w;
  }
  for (const ch of t) {
    g.fillText(ch, x0, baseline);
    x0 += g.measureText(ch).width + st.ls * st.size;
  }
  return w;
}

interface Laid {
  lines: string[];
  st: Style;
  lh: number;
  height: number;
  asc: number;
  desc: number;
}

function wrap(g: G, text: string, st: Style, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (line && textWidth(g, test, st) > maxWidth) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * Lay out text in a box. Shrinks the font (down to `minSize`) until it fits in `maxLines`
 * and no single word overflows. Shrink-to-fit keeps long area names and verdicts from clipping.
 */
function layout(g: G, text: string, st: Style, maxWidth: number, opts: { maxLines?: number; minSize?: number } = {}): Laid {
  const maxLines = opts.maxLines ?? 99;
  const minSize = opts.minSize ?? st.size;
  let cur = { ...st };
  for (;;) {
    const lines = wrap(g, st.upper ? text.toUpperCase() : text, cur, maxWidth);
    const widest = Math.max(...lines.map((l) => textWidth(g, l, cur)));
    const fits = lines.length <= maxLines && widest <= maxWidth + 0.5;
    if (fits || cur.size <= minSize) {
      const m = fontMetrics(g, cur);
      const lh = lineHeightPx(g, cur);
      // Last resort (still too wide at min size): ellipsise single-line boxes.
      if (!fits && maxLines === 1) {
        let l = lines.join(" ");
        while (l.length > 1 && textWidth(g, `${l}…`, cur) > maxWidth) l = l.slice(0, -1);
        return { lines: [`${l.trimEnd()}…`], st: cur, lh, height: lh, asc: m.asc, desc: m.desc };
      }
      return { lines, st: cur, lh, height: lh * lines.length, asc: m.asc, desc: m.desc };
    }
    cur = { ...cur, size: Math.max(minSize, cur.size - 2) };
  }
}

/** Baseline of line i in a laid box whose top is `top` (CSS half-leading). */
const baselineOf = (t: Laid, top: number, i = 0) => top + i * t.lh + (t.lh - (t.asc + t.desc)) / 2 + t.asc;

function drawLaid(g: G, t: Laid, x: number, top: number, color: string, align: "left" | "right" | "center" = "left") {
  t.lines.forEach((l, i) => drawRun(g, l, x, baselineOf(t, top, i), t.st, color, align));
}

/* ------------------------------------------------------------------ shapes */

function rrect(g: G, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [a, b, c, d] = typeof r === "number" ? [r, r, r, r] : r;
  g.beginPath();
  g.moveTo(x + a, y);
  g.lineTo(x + w - b, y);
  g.arcTo(x + w, y, x + w, y + b, b);
  g.lineTo(x + w, y + h - c);
  g.arcTo(x + w, y + h, x + w - c, y + h, c);
  g.lineTo(x + d, y + h);
  g.arcTo(x, y + h, x, y + h - d, d);
  g.lineTo(x, y + a);
  g.arcTo(x, y, x + a, y, a);
  g.closePath();
}

function dot(g: G, cx: number, cy: number, r: number, color: string) {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

/** Brand mark C on its 100-unit grid. */
function mark(g: G, x: number, y: number, size: number, dotColor: string, lineColor: string) {
  const k = size / 100;
  dot(g, x + 50 * k, y + 38 * k, 17 * k, dotColor);
  for (const [rx, ry, w, a] of [
    [17, 61, 66, 1],
    [27, 73.5, 46, 0.7],
    [38, 86, 24, 0.45],
  ]) {
    g.globalAlpha = a;
    g.fillStyle = lineColor;
    rrect(g, x + rx * k, y + ry * k, w * k, 7.5 * k, 3.75 * k);
    g.fill();
  }
  g.globalAlpha = 1;
}

function trendTriangle(g: G, x: number, cy: number, size: number, dir: TrendDirection, color: string) {
  const h = size;
  g.beginPath();
  if (dir === "up") {
    g.moveTo(x + h / 2, cy - h / 2);
    g.lineTo(x + h, cy + h / 2);
    g.lineTo(x, cy + h / 2);
  } else if (dir === "down") {
    g.moveTo(x, cy - h / 2);
    g.lineTo(x + h, cy - h / 2);
    g.lineTo(x + h / 2, cy + h / 2);
  } else {
    g.moveTo(x, cy - h / 2);
    g.lineTo(x + h * 0.9, cy);
    g.lineTo(x, cy + h / 2);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function hline(g: G, x0: number, x1: number, y: number, w: number, color: string) {
  g.fillStyle = color;
  g.fillRect(x0, y, x1 - x0, w);
}

/** "Tampines · Mon 28 Sep, 5pm", or the stale line alone (core puts it in `place` with an empty `when`). */
const placeWhen = (c: { place: string; when: string }) => (c.when ? `${c.place} · ${c.when}` : c.place);

const bandDot = (band: Band, onDark = false) => (onDark && band === "very_high" ? "#B06BC4" : bandInfo(band).color);

/* ------------------------------------------------------------------ layout helpers */

interface Block {
  h: number;
  draw: (top: number) => void;
}

/** CSS `flex-direction: column; justify-content: space-between`. Returns the gap (negative = overflow). */
function spaceBetween(blocks: Block[], top: number, bottom: number): number {
  const total = blocks.reduce((s, b) => s + b.h, 0);
  const gap = blocks.length > 1 ? (bottom - top - total) / (blocks.length - 1) : 0;
  let y = top;
  for (const b of blocks) {
    b.draw(y);
    y += b.h + gap;
  }
  return gap;
}

const PAD = { top: 80, x: 84, bottom: 72 };
const INNER = CARD_W - PAD.x * 2; // 912

/** Header row: mark + "HazeNow" on the left, `right` text on the right, all vertically centred on 52px. */
function headerBlock(g: G, dotColor: string, lineColor: string, textColor: string, right: { text: string; st: Style; color: string }): Block {
  const brand: Style = { size: 34, weight: 700, ls: -0.02 };
  return {
    h: 52,
    draw: (top) => {
      mark(g, PAD.x, top, 52, dotColor, lineColor);
      const bt = layout(g, "HazeNow", brand, 400, { maxLines: 1 });
      drawLaid(g, bt, PAD.x + 52 + 14, top + (52 - bt.height) / 2, textColor);
      const brandW = 52 + 14 + textWidth(g, "HazeNow", brand);
      if (!right.text) return;
      const rt = layout(g, right.text, right.st, INNER - brandW - 40, { maxLines: 1, minSize: 20 });
      drawLaid(g, rt, CARD_W - PAD.x, top + (52 - rt.height) / 2, right.color, "right");
    },
  };
}

function footerBlock(
  g: G,
  left: { text: string; st: Style; color: string }[],
  right: string[],
  ruleColor: string,
  color: string,
): Block {
  const st: Style = { size: 24, weight: 400, lh: 1.45 };
  const leftLaid = left.map((l) => layout(g, l.text, { ...l.st, lh: 1.45 }, INNER * 0.62, { maxLines: 1, minSize: 18 }));
  const rightLaid = right.map((r) => layout(g, r, st, INNER * 0.4, { maxLines: 1, minSize: 18 }));
  const lh = (t: Laid) => Math.max(t.lh, 24 * 1.45);
  const leftH = leftLaid.reduce((s, t) => s + lh(t), 0);
  const rightH = rightLaid.reduce((s, t) => s + lh(t), 0);
  const inner = Math.max(leftH, rightH);
  return {
    h: 2 + 28 + inner,
    draw: (top) => {
      hline(g, PAD.x, CARD_W - PAD.x, top, 2, ruleColor);
      // align-items: flex-end
      let y = top + 30 + inner - leftH;
      leftLaid.forEach((t, i) => {
        const boxH = lh(t);
        drawRun(g, t.lines[0], PAD.x, y + (boxH - (t.asc + t.desc)) / 2 + t.asc, t.st, left[i].color);
        y += boxH;
      });
      y = top + 30 + inner - rightH;
      rightLaid.forEach((t) => {
        drawRun(g, t.lines[0], CARD_W - PAD.x, y + (lh(t) - (t.asc + t.desc)) / 2 + t.asc, t.st, color, "right");
        y += lh(t);
      });
    },
  };
}

function newCanvas(w: number, h: number, bg: string): [HTMLCanvasElement, G] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { alpha: false })!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  return [c, g];
}

/**
 * Build blocks with a headline that shrinks until everything fits with at least `minGap` between blocks.
 * `make(scale)` returns the blocks for a given headline scale (1 = design size).
 */
function fitVertical(make: (scale: number) => Block[], top: number, bottom: number, minGap = 12) {
  for (let scale = 1; scale >= 0.6; scale -= 0.04) {
    const blocks = make(scale);
    const total = blocks.reduce((s, b) => s + b.h, 0);
    if ((bottom - top - total) / (blocks.length - 1) >= minGap || scale <= 0.61) {
      spaceBetween(blocks, top, bottom);
      return;
    }
  }
}

/* ------------------------------------------------------------------ card 1: Now */

function drawNow(g: G, c: Extract<ShareCardContent, { kind: "now" }>) {
  const color = bandDot(c.band);
  fitVertical(
    (scale) => [
      headerBlock(g, color, C.ink, C.ink, { text: "hazenow.sg", st: { size: 30, weight: 500 }, color: C.ink }),
      (() => {
        const hook = layout(g, c.hook, { size: 34, weight: 500 }, INNER, { maxLines: 1, minSize: 24 });
        const h1 = layout(g, c.headline, { size: Math.round(132 * scale), weight: 500, lh: 0.95, ls: -0.045 }, INNER, { maxLines: 2, minSize: 72 });
        const num: Style = { size: 88, weight: 700, ls: -0.04 };
        const numW = textWidth(g, String(c.pm25), num);
        const detail = layout(g, c.pmDetail, { size: 32, weight: 400 }, INNER - 28 - 20 - numW - 20, { maxLines: 1, minSize: 22 });
        const nm = fontMetrics(g, num);
        const rowAbove = Math.max(nm.asc, detail.asc);
        const rowH = rowAbove + Math.max(nm.desc, detail.desc);
        return {
          h: hook.height + 28 + h1.height + 28 + rowH,
          draw: (top: number) => {
            drawLaid(g, hook, PAD.x, top, C.sub);
            drawLaid(g, h1, PAD.x, top + hook.height + 28, C.ink);
            const rowTop = top + hook.height + 28 + h1.height + 28;
            const base = rowTop + rowAbove;
            dot(g, PAD.x + 14, rowTop + rowH / 2, 14, color);
            drawRun(g, String(c.pm25), PAD.x + 28 + 20, base, num, C.ink);
            drawRun(g, detail.lines[0], PAD.x + 28 + 20 + numW + 20, base, detail.st, C.sub);
          },
        };
      })(),
      (() => {
        const innerW = INNER - 88 - 4;
        const label = layout(g, c.adviceLabel, { size: 24, weight: 700, ls: 0.08, upper: true }, innerW, { maxLines: 1, minSize: 18 });
        const group = (who: string, text: string) => {
          const a = layout(g, who, { size: 28, weight: 400 }, innerW, { maxLines: 2, minSize: 22 });
          const b = layout(g, text, { size: 40, weight: 500, lh: 1.2, ls: -0.01 }, innerW, { maxLines: 2, minSize: 30 });
          return { a, b, h: a.height + 6 + b.height };
        };
        const g1 = group("Most people", c.adviceMost);
        const g2 = group("Elderly, children, pregnant, heart or lung conditions", c.adviceVulnerable);
        const h = 2 + 40 + label.height + 24 + g1.h + 24 + g2.h + 40 + 2;
        return {
          h,
          draw: (top: number) => {
            rrect(g, PAD.x + 1, top + 1, INNER - 2, h - 2, 27);
            g.fillStyle = C.white;
            g.fill();
            g.lineWidth = 2;
            g.strokeStyle = C.boxRule;
            g.stroke();
            let y = top + 42;
            const x = PAD.x + 2 + 44;
            drawLaid(g, label, x, y, C.label);
            y += label.height + 24;
            for (const gr of [g1, g2]) {
              drawLaid(g, gr.a, x, y, C.sub);
              drawLaid(g, gr.b, x, y + gr.a.height + 6, C.ink);
              y += gr.h + 24;
            }
          },
        };
      })(),
      (() => {
        const t = layout(g, c.psiLine, { size: 30, weight: 400, lh: 1.4 }, INNER, { maxLines: 3, minSize: 24 });
        return { h: t.height, draw: (top: number) => drawLaid(g, t, PAD.x, top, C.body) };
      })(),
      footerBlock(
        g,
        [
          { text: "Data: NEA via data.gov.sg", st: { size: 24, weight: 400 }, color: C.sub },
          { text: c.station, st: { size: 24, weight: 400 }, color: C.sub },
        ],
        ["Free and open source", `Made by ${c.credit}`],
        C.rule,
        C.sub,
      ),
    ],
    PAD.top,
    CARD_H - PAD.bottom,
  );
}

/* ------------------------------------------------------------------ card 2: Two clocks */

function drawClocks(g: G, c: Extract<ShareCardContent, { kind: "clocks" }>) {
  const color = bandDot(c.band, true);
  const label = bandInfo(c.band).label;
  // Stale (COPY §19): the long "… reading from … (latest available)" line gets its own row under the
  // header (it doesn't fit beside the logo), and the headline and chart shrink a little to make room.
  const stale = !c.when;
  const headScale = stale ? 0.78 : 1;
  const chartH = stale ? 180 : 250;
  const staleRow = (): Block => {
    const t = layout(g, c.place, { size: 28, weight: 400 }, INNER, { maxLines: 2, minSize: 22 });
    return { h: t.height, draw: (top: number) => drawLaid(g, t, PAD.x, top, C.darkSub) };
  };
  fitVertical(
    (scale) => [
      headerBlock(g, color, C.mist, C.ivory, { text: stale ? "" : placeWhen(c), st: { size: 30, weight: 400 }, color: C.darkSub }),
      ...(stale ? [staleRow()] : []),
      (() => {
        const st: Style = { size: Math.round(120 * scale * headScale), weight: 500, lh: 0.95, ls: -0.045 };
        const t = layout(g, c.headlineLines.join("\n"), st, INNER, { maxLines: 2, minSize: 72 });
        return { h: t.height, draw: (top: number) => drawLaid(g, t, PAD.x, top, C.ivory) };
      })(),
      (() => {
        const boxW = (INNER - 28) / 2;
        const inner1 = boxW - 80;
        const inner2 = boxW - 80 - 4;
        const big: Style = { size: 156, weight: 700, lh: 1, ls: -0.05 };
        const fitBig = (s: string, w: number) => layout(g, s, big, w, { maxLines: 1, minSize: 96 });
        const t1 = layout(g, c.nowLabel, { size: 28, weight: 500 }, inner1, { maxLines: 1, minSize: 20 });
        const n1 = fitBig(String(c.pm25), inner1);
        const u1 = layout(g, "µg/m³ PM2.5", { size: 26, weight: 400 }, inner1, { maxLines: 1 });
        const b1 = layout(g, label, { size: 30, weight: 700 }, inner1 - 28, { maxLines: 1, minSize: 22 });
        const t2 = layout(g, "The last 24 hours", { size: 28, weight: 500 }, inner2, { maxLines: 1 });
        const n2 = fitBig(c.avg === null ? "–" : String(c.avg), inner2);
        const u2 = layout(g, "µg/m³ PM2.5, averaged", { size: 26, weight: 400 }, inner2, { maxLines: 1, minSize: 20 });
        const p2 = layout(g, c.psi === null ? "24-hr PSI not available" : `24-hr PSI ${c.psi}`, { size: 30, weight: 700 }, inner2, { maxLines: 1, minSize: 22 });
        const h1 = 40 + t1.height + 10 + n1.height + 10 + u1.height + 10 + 6 + b1.height + 40;
        const h2 = 2 + 40 + t2.height + 10 + n2.height + 10 + u2.height + 10 + 6 + p2.height + 40 + 2;
        const h = Math.max(h1, h2);
        return {
          h,
          draw: (top: number) => {
            // box 1: ivory
            rrect(g, PAD.x, top, boxW, h, 28);
            g.fillStyle = C.ivory;
            g.fill();
            let y = top + 40;
            const x1 = PAD.x + 40;
            drawLaid(g, t1, x1, y, C.ink);
            y += t1.height + 10;
            drawLaid(g, n1, x1, y, C.ink);
            y += n1.height + 10;
            drawLaid(g, u1, x1, y, C.sub);
            y += u1.height + 10 + 6;
            dot(g, x1 + 9, y + b1.height / 2, 9, bandDot(c.band));
            drawLaid(g, b1, x1 + 18 + 10, y, C.ink);
            // box 2: outlined
            const bx = PAD.x + boxW + 28;
            rrect(g, bx + 1, top + 1, boxW - 2, h - 2, 27);
            g.lineWidth = 2;
            g.strokeStyle = C.darkBox;
            g.stroke();
            y = top + 42;
            const x2 = bx + 42;
            drawLaid(g, t2, x2, y, C.darkSub);
            y += t2.height + 10;
            drawLaid(g, n2, x2, y, C.darkSub);
            y += n2.height + 10;
            drawLaid(g, u2, x2, y, C.mist);
            y += u2.height + 10 + 6;
            drawLaid(g, p2, x2, y, C.ivory);
          },
        };
      })(),
      (() => {
        const lab = layout(g, "24 hours ago", { size: 22, weight: 400 }, 400, { maxLines: 1 });
        return {
          h: chartH + 3 + 14 + lab.height,
          draw: (top: number) => {
            const vals = c.bars.length ? c.bars : [c.pm25];
            const max = Math.max(1, ...vals, c.avg ?? 0);
            const n = vals.length;
            const gap = 8;
            const bw = (INNER - gap * (n - 1)) / n;
            const base = top + chartH;
            vals.forEach((v, i) => {
              const bh = Math.round((v / max) * (chartH - 10));
              rrect(g, PAD.x + i * (bw + gap), base - bh, bw, bh, [Math.min(5, bh / 2), Math.min(5, bh / 2), 0, 0]);
              g.fillStyle = i === n - 1 ? color : C.bar;
              g.fill();
            });
            hline(g, PAD.x, CARD_W - PAD.x, base, 3, C.mist);
            if (c.avg !== null) {
              const lineY = base - Math.round((c.avg / max) * (chartH - 10)) - 4;
              g.save();
              g.strokeStyle = C.ivory;
              g.lineWidth = 4;
              g.setLineDash([8, 6]);
              g.beginPath();
              g.moveTo(PAD.x, lineY + 2);
              g.lineTo(CARD_W - PAD.x, lineY + 2);
              g.stroke();
              g.restore();
              const st: Style = { size: 22, weight: 700 };
              const lt = layout(g, "24-hr average", st, 400, { maxLines: 1 });
              const lw = textWidth(g, "24-hr average", st) + 8;
              const boxBottom = Math.max(top + lt.height + 4, lineY - 8);
              g.fillStyle = C.ink;
              g.fillRect(PAD.x, boxBottom - lt.height - 4, lw, lt.height + 4);
              drawLaid(g, lt, PAD.x, boxBottom - lt.height - 2, C.ivory);
            }
            const ly = base + 3 + 14;
            drawLaid(g, lab, PAD.x, ly, C.mist);
            const now = layout(g, c.axisEnd, { size: 22, weight: 700 }, 200, { maxLines: 1 });
            drawLaid(g, now, CARD_W - PAD.x, ly, C.ivory, "right");
          },
        };
      })(),
      (() => {
        const t = layout(g, c.caption, { size: 30, weight: 400, lh: 1.4 }, INNER, { maxLines: 3, minSize: 24 });
        return { h: t.height, draw: (top: number) => drawLaid(g, t, PAD.x, top, C.darkBody) };
      })(),
      footerBlock(
        g,
        [
          { text: "hazenow.sg", st: { size: 30, weight: 700 }, color: C.ivory },
          { text: "Data: NEA via data.gov.sg", st: { size: 24, weight: 400 }, color: C.darkSub },
        ],
        ["Free and open source", `Made by ${c.credit}`],
        C.darkRule,
        C.darkSub,
      ),
    ],
    PAD.top,
    CARD_H - PAD.bottom,
  );
}

/* ------------------------------------------------------------------ card 3: For our group */

function drawGroup(g: G, c: Extract<ShareCardContent, { kind: "group" }>) {
  const color = bandDot(c.band);
  const label = bandInfo(c.band).label;
  fitVertical(
    (scale) => [
      headerBlock(g, color, C.ink, C.ink, { text: "hazenow.sg", st: { size: 30, weight: 500 }, color: C.ink }),
      (() => {
        const chip = layout(g, c.chip, { size: 30, weight: 700 }, INNER - 56, { maxLines: 1, minSize: 22 });
        const chipW = textWidth(g, chip.lines[0], chip.st) + 56;
        const chipH = chip.height + 24;
        const hook = layout(g, placeWhen(c), { size: 32, weight: 500 }, INNER, { maxLines: 1, minSize: 22 });
        const h1 = layout(g, c.headline, { size: Math.round(136 * scale), weight: 500, lh: 0.95, ls: -0.045 }, INNER, { maxLines: 3, minSize: 64 });
        const strong: Style = { size: 34, weight: 700 };
        const strongText = `PM2.5 ${c.pm25}`;
        const sw = textWidth(g, strongText, strong);
        const rest = layout(g, c.statsRest, { size: 34, weight: 400 }, INNER - 24 - 16 - sw - 16, { maxLines: 1, minSize: 22 });
        const sm = fontMetrics(g, strong);
        const rowH = Math.max(sm.normal, rest.height, 24);
        return {
          h: chipH + 28 + hook.height + 28 + h1.height + 28 + rowH,
          draw: (top: number) => {
            rrect(g, PAD.x, top, chipW, chipH, chipH / 2);
            g.fillStyle = C.ink;
            g.fill();
            drawLaid(g, chip, PAD.x + 28, top + 12, C.ivory);
            let y = top + chipH + 28;
            drawLaid(g, hook, PAD.x, y, C.sub);
            y += hook.height + 28;
            drawLaid(g, h1, PAD.x, y, C.ink);
            y += h1.height + 28;
            dot(g, PAD.x + 12, y + rowH / 2, 12, color);
            const base = y + (rowH - (sm.asc + sm.desc)) / 2 + sm.asc;
            drawRun(g, strongText, PAD.x + 24 + 16, base, strong, C.ink);
            drawRun(g, rest.lines[0], PAD.x + 24 + 16 + sw + 16, base, rest.st, C.sub);
          },
        };
      })(),
      (() => {
        const num: Style = { size: 36, weight: 700 };
        const items = c.actions.slice(0, 3);
        // Fixed number column (Apfel has no tabular figures): the widest digit used, so every
        // action's text starts at the same x. Digits are left-aligned in the column, as in the design.
        const col = Math.ceil(Math.max(...items.map((_, i) => textWidth(g, String(i + 1), num))));
        const rows = items.map((a, i) => {
          const n = String(i + 1);
          const t = layout(g, a, { size: 36, weight: 400, lh: 1.3 }, INNER - col - 20, { maxLines: 3, minSize: 28 });
          return { n, nw: col, t };
        });
        const h = 2 + 32 + rows.reduce((s, r) => s + r.t.height, 0) + 18 * (rows.length - 1);
        return {
          h,
          draw: (top: number) => {
            hline(g, PAD.x, CARD_W - PAD.x, top, 2, C.rule);
            let y = top + 34;
            for (const r of rows) {
              drawRun(g, r.n, PAD.x, baselineOf(r.t, y, 0), num, C.mist);
              drawLaid(g, r.t, PAD.x + r.nw + 20, y, C.ink);
              y += r.t.height + 18;
            }
          },
        };
      })(),
      footerBlock(
        g,
        [
          { text: "Based on NEA’s 1-hr PM2.5 advice", st: { size: 24, weight: 400 }, color: C.sub },
          { text: `Data: NEA via data.gov.sg · ${c.station}`, st: { size: 24, weight: 400 }, color: C.sub },
        ],
        ["Free and open source", `Made by ${c.credit}`],
        C.rule,
        C.sub,
      ),
    ],
    PAD.top,
    CARD_H - PAD.bottom,
  );
  void label;
}

/* ------------------------------------------------------------------ card 4: All clear */

function drawClear(g: G, c: Extract<ShareCardContent, { kind: "clear" }>) {
  const green = bandInfo("normal").color;
  fitVertical(
    (scale) => [
      headerBlock(g, green, C.ink, C.ink, { text: "hazenow.sg", st: { size: 30, weight: 500 }, color: C.ink }),
      (() => {
        const hook = layout(g, placeWhen(c), { size: 34, weight: 500 }, INNER, { maxLines: 1, minSize: 24 });
        const h1 = layout(g, c.headline, { size: Math.round(150 * scale), weight: 500, lh: 0.92, ls: -0.05 }, INNER, { maxLines: 2, minSize: 80 });
        const body = layout(g, c.bodyLines.join("\n"), { size: 40, weight: 400, lh: 1.3 }, INNER, { maxLines: 3, minSize: 30 });
        return {
          h: 160 + 32 + hook.height + 32 + h1.height + 32 + body.height,
          draw: (top: number) => {
            dot(g, PAD.x + 80, top + 80, 80, green);
            let y = top + 160 + 32;
            drawLaid(g, hook, PAD.x, y, C.sub);
            y += hook.height + 32;
            drawLaid(g, h1, PAD.x, y, C.ink);
            y += h1.height + 32;
            drawLaid(g, body, PAD.x, y, C.body);
          },
        };
      })(),
      (() => {
        const stats = c.stats ? layout(g, c.stats, { size: 28, weight: 400 }, INNER, { maxLines: 2, minSize: 22 }) : null;
        const foot = footerBlock(
          g,
          [{ text: "Data: NEA via data.gov.sg", st: { size: 24, weight: 400 }, color: C.sub }],
          ["Free and open source", `Made by ${c.credit}`],
          C.clearRule,
          C.sub,
        );
        return {
          h: (stats ? stats.height + 24 : 0) + foot.h,
          draw: (top: number) => {
            if (stats) drawLaid(g, stats, PAD.x, top, C.sub);
            foot.draw(top + (stats ? stats.height + 24 : 0));
          },
        };
      })(),
    ],
    PAD.top,
    CARD_H - PAD.bottom,
  );
}

/* ------------------------------------------------------------------ card 6: link preview (1200×630) */

export interface GenericPreview {
  kind: "generic";
}

function drawPreview(g: G, c: Extract<ShareCardContent, { kind: "preview" }> | GenericPreview) {
  const P = { x: 68, y: 60 };
  // The design's panel is `width: 360px` with 38px padding in content-box sizing → 436px outer.
  const panelW = 360 + 76;
  const leftW = WIDE_W - P.x * 2 - 52 - panelW;
  const generic = c.kind === "generic";
  const color = generic ? bandInfo("elevated").color : bandDot(c.band);
  // left column (space-between)
  const brand: Style = { size: 26, weight: 700, ls: -0.01 };
  const bt = layout(g, "HazeNow", brand, 300, { maxLines: 1 });
  const hookText = generic ? "Singapore · NEA’s hourly reading, by area" : c.hook;
  const headText = generic ? "Air right now, near you." : c.headline;
  const hook = layout(g, hookText, { size: 26, weight: 500 }, leftW, { maxLines: 1, minSize: 18 });
  const credit = layout(g, "Data: NEA · Free and open source · Made by Yong Quan Tan", { size: 22, weight: 400 }, leftW, { maxLines: 1, minSize: 16 });
  const avail = WIDE_H - P.y * 2 - Math.max(40, bt.height) - credit.height - hook.height - 16 - 40;
  let h1 = layout(g, headText, { size: 84, weight: 500, lh: 0.95, ls: -0.045 }, leftW, { maxLines: 3, minSize: 48 });
  while (h1.height > avail && h1.st.size > 48) h1 = layout(g, headText, { ...h1.st, size: h1.st.size - 2 }, leftW, { maxLines: 3, minSize: 48 });
  const blocks: Block[] = [
    {
      h: 40,
      draw: (top) => {
        mark(g, P.x, top, 40, color, C.ink);
        drawLaid(g, bt, P.x + 40 + 12, top + (40 - bt.height) / 2, C.ink);
      },
    },
    {
      h: hook.height + 16 + h1.height,
      draw: (top) => {
        drawLaid(g, hook, P.x, top, C.sub);
        drawLaid(g, h1, P.x, top + hook.height + 16, C.ink);
      },
    },
    { h: credit.height, draw: (top) => drawLaid(g, credit, P.x, top, C.sub) },
  ];
  spaceBetween(blocks, P.y, WIDE_H - P.y);

  // right panel
  const px = WIDE_W - P.x - panelW;
  const ph = WIDE_H - P.y * 2;
  rrect(g, px, P.y, panelW, ph, 28);
  g.fillStyle = C.ink;
  g.fill();
  const ix = px + 38;
  const iw = panelW - 76;
  const lab = layout(g, generic ? "1-hr PM2.5, every hour" : "1-hr PM2.5", { size: 24, weight: 400 }, iw, { maxLines: 1 });
  const big = layout(g, generic ? "" : String(c.pm25), { size: 150, weight: 700, lh: 1, ls: -0.05 }, iw, { maxLines: 1, minSize: 90 });
  const bandSt: Style = { size: 26, weight: 700 };
  const bandText = generic ? "Normal to Very High" : bandInfo(c.band).label;
  const bandLaid = layout(g, bandText, bandSt, iw - 26 - 30, { maxLines: 1, minSize: 18 });
  const tail = layout(g, generic ? "NEA via data.gov.sg · hazenow.sg" : `24-hr PSI ${c.psi ?? "–"} · hazenow.sg`, { size: 22, weight: 400 }, iw, { maxLines: 1, minSize: 16 });
  const bottomH = bandLaid.height + 6 + tail.height;
  const pBlocks: Block[] = [
    { h: lab.height, draw: (top) => drawLaid(g, lab, ix, top, C.darkSub) },
    generic
      ? { h: 150, draw: (top) => mark(g, ix - 6, top, 150, C.ivory, C.mist) }
      : { h: big.height, draw: (top) => drawLaid(g, big, ix, top, C.ivory) },
    {
      h: bottomH,
      draw: (top) => {
        if (generic) {
          // four band dots, never colour alone: the words sit next to them
          ["normal", "elevated", "high", "very_high"].forEach((b, i) => dot(g, ix + 8 + i * 22, top + bandLaid.height / 2, 8, bandDot(b as Band, true)));
          drawLaid(g, bandLaid, ix + 4 * 22 + 8, top, C.ivory);
        } else {
          dot(g, ix + 8, top + bandLaid.height / 2, 8, bandDot(c.band, true));
          drawLaid(g, bandLaid, ix + 16 + 10, top, C.ivory);
          if (c.direction) {
            const bw = textWidth(g, bandLaid.lines[0], bandLaid.st);
            trendTriangle(g, ix + 26 + bw + 10, top + bandLaid.height / 2, 18, c.direction, C.ivory);
          }
        }
        drawLaid(g, tail, ix, top + bandLaid.height + 6, C.darkSub);
      },
    },
  ];
  spaceBetween(pBlocks, P.y + 38, P.y + ph - 38);
}

/* ------------------------------------------------------------------ public API */

export type CardInput = ShareCardContent | GenericPreview;

export function cardSize(c: CardInput): [number, number] {
  return c.kind === "preview" || c.kind === "generic" ? [WIDE_W, WIDE_H] : [CARD_W, CARD_H];
}

/** Render a card to a canvas of exactly its design size. Call ensureCardFonts() first. */
export function renderCard(c: CardInput): HTMLCanvasElement {
  const [w, h] = cardSize(c);
  const bg = c.kind === "clocks" ? C.ink : c.kind === "group" ? C.ivory : c.kind === "clear" ? C.clearBg : C.paper;
  const [canvas, g] = newCanvas(w, h, bg);
  switch (c.kind) {
    case "now":
      drawNow(g, c);
      break;
    case "clocks":
      drawClocks(g, c);
      break;
    case "group":
      drawGroup(g, c);
      break;
    case "clear":
      drawClear(g, c);
      break;
    case "preview":
    case "generic":
      drawPreview(g, c);
      break;
  }
  return canvas;
}

export async function renderCardPng(c: CardInput): Promise<Blob> {
  await ensureCardFonts();
  const canvas = renderCard(c);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}
