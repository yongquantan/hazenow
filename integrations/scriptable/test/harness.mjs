// Runs HazeNow.js in Node with a mocked Scriptable runtime against the LIVE data.gov.sg API,
// then prints each widget family as a text tree. Usage: node test/harness.mjs [param] [lat,lon]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "HazeNow.js"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hazenow-scriptable-"));

class Color { constructor(hex, a = 1) { this.hex = hex; this.a = a; } static white() { return new Color("#FFFFFF"); } static dynamic(l, d) { return l; } }
class Font { static boldSystemFont(n) { return `bold ${n}`; } static systemFont(n) { return `${n}`; } static boldMonospacedSystemFont(n) { return `mono ${n}`; } }
class Size { constructor(w, h) { Object.assign(this, { w, h }); } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
class Point { constructor(x, y) { Object.assign(this, { x, y }); } }
class Path { constructor() { this.n = 0; } move() { this.n++; } addLine() { this.n++; } addRoundedRect() { this.n++; } }
class LinearGradient {}
class DrawContext {
  constructor() { this.rects = 0; this.lines = 0; this.labels = []; }
  fillRect() { this.rects++; } setFillColor(c) { this.fills = (this.fills || []).concat(c.hex); } addPath(p) { this.lines = p.n; } setStrokeColor() {} setLineWidth() {} strokePath() {}
  fillEllipse() { this.ellipse = true; } fillPath() { this.paths = (this.paths || 0) + 1; }
  setFont() {} setTextColor() {} drawText(t) { this.labels.push(t); }
  getImage() {
    if (this.ellipse) return { mark: `dot ${this.fills[0]} + ${this.paths} haze lines` };
    return { rects: this.rects, linePts: this.lines, labels: this.labels };
  }
}
const SFSymbol = { named: (n) => ({ image: { sf: n } }) };
class WText { constructor(t) { this.text = t; } centerAlignText() {} }
class WStack {
  constructor() { this.children = []; }
  addText(t) { const x = new WText(t); this.children.push(x); return x; }
  addStack() { const s = new WStack(); this.children.push(s); return s; }
  addImage(img) { const x = { image: img }; this.children.push(x); return x; }
  addSpacer() {} layoutVertically() { this.vertical = true; } centerAlignContent() {} bottomAlignContent() {} setPadding() {}
}
class ListWidget extends WStack { async presentMedium() {} }
class Request {
  constructor(url) { this.url = url; this.headers = {}; }
  async loadJSON() { const r = await fetch(this.url, { headers: this.headers }); this.response = { statusCode: r.status }; return r.json(); }
}
const FileManager = { local: () => ({
  documentsDirectory: () => tmp, joinPath: (...a) => path.join(...a), fileExists: (p) => fs.existsSync(p),
  createDirectory: (p) => fs.mkdirSync(p, { recursive: true }), readString: (p) => fs.readFileSync(p, "utf8"), writeString: (p, s) => fs.writeFileSync(p, s),
}) };

function dump(node, depth = 0) {
  const pad = "  ".repeat(depth);
  const out = [];
  for (const c of node.children || []) {
    if (c instanceof WText) out.push(pad + c.text.replace(/\n/g, " "));
    else if (c.image && c.image.sf) out.push(pad + `[sf:${c.image.sf}]`);
    else if (c.image && c.image.mark) out.push(pad + `[mark: ${c.image.mark}]`);
    else if (c.image) out.push(pad + `[chart: ${c.image.rects} rects (bars+dashes), NEA 24-hr avg line ${c.image.linePts} pts, guides: ${c.image.labels.join(", ")}]`);
    else out.push(...dump(c, depth + (c.vertical ? 1 : 1)));
  }
  return out;
}

const [param = "", ll] = process.argv.slice(2);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const family of ["small", "medium", "large", "accessoryRectangular", "accessoryInline", "accessoryCircular"]) {
  let widget = null, output = null;
  const env = {
    Color, Font, Size, Rect, Point, Path, LinearGradient, DrawContext, ListWidget, Request, FileManager, SFSymbol,
    Timer: { schedule: (ms, rep, cb) => setTimeout(cb, ms) },
    Location: { setAccuracyToThreeKilometers() {}, current: async () => { if (!ll) throw new Error("denied"); const [lat, lon] = ll.split(",").map(Number); return { latitude: lat, longitude: lon }; } },
    Device: {}, Speech: { speak() {} },
    config: { widgetFamily: family, runsInWidget: !family.startsWith("accessory"), runsInAccessoryWidget: family.startsWith("accessory"), runsInApp: false },
    args: { widgetParameter: param },
    Script: { setWidget: (w) => (widget = w), setShortcutOutput: (o) => (output = o), complete() {} },
  };
  await new AsyncFunction(...Object.keys(env), src)(...Object.values(env));
  console.log(`\n=== ${family} ===`);
  console.log(dump(widget).join("\n"));
  if (family === "medium") console.log(`(Shortcut output: ${output})`);
  if (family === "medium") console.log(`(refreshAfterDate: ${widget.refreshAfterDate?.toISOString()})`);
}
