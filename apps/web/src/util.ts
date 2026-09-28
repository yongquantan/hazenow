export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** localStorage that never throws (private mode, blocked storage, previews). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

/**
 * The band's non-colour shape cue (COPY §3): Normal = filled circle, Elevated = circle with one bar,
 * High = triangle, Very High = octagon. Every shape gets a dark (light, in dark mode) edge so it reaches
 * ≥3:1 against the page even when the band colour itself (amber) doesn't.
 */
export function bandShape(shape: string, color: string, size = 14, opts: { outline?: boolean } = {}): string {
  const s = size;
  const h = s / 2;
  const sw = Math.max(1.2, s / 12);
  const fill = opts.outline ? "none" : color;
  const stroke = opts.outline ? color : "var(--shape-edge)";
  let body: string;
  switch (shape) {
    case "half": {
      const r = h - sw;
      body = `<circle cx="${h}" cy="${h}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
<rect x="${h - r * 0.62}" y="${h - sw * 0.9}" width="${r * 1.24}" height="${sw * 1.8}" rx="${sw * 0.9}" fill="var(--shape-edge)"/>`;
      break;
    }
    case "triangle":
      body = `<path d="M${h} ${sw * 1.2} L${s - sw} ${s - sw * 1.4} L${sw} ${s - sw * 1.4}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      break;
    case "octagon": {
      const r = h - sw * 0.8;
      const pts = Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i + Math.PI / 8;
        return `${(h + r * Math.cos(a)).toFixed(2)},${(h + r * Math.sin(a)).toFixed(2)}`;
      }).join(" ");
      body = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      break;
    }
    default:
      body = `<circle cx="${h}" cy="${h}" r="${h - sw}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  return `<svg class="shape" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${body}</svg>`;
}

/**
 * Trend arrow as inline SVG (SPEC v1.5: the brand font has no ▲▼ glyphs).
 * Up/down are triangles, steady is a right-pointing one, matching the compact `● 105 ▲` vocabulary.
 */
export function trendIcon(direction: "up" | "down" | "steady", cls = "arrow"): string {
  const d =
    direction === "up" ? "M6 1.5 11 10.5H1Z" : direction === "down" ? "M6 10.5 1 1.5h10Z" : "M2 1.5 10.5 6 2 10.5Z";
  return `<svg class="${cls}" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="${d}" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>`;
}
