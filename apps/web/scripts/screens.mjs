// Screenshot the web app at 390 px (iPhone width) in headless Chrome: `node scripts/screens.mjs <outDir> name=query ...`
// e.g. `node scripts/screens.mjs docs/countries sg-tampines="?mock=elevated&area=Tampines"`.
// With no pairs, writes the per-country set to docs/countries/. Uses your installed Chrome via playwright-core
// (override with CHROME_PATH). Starts the Vite dev server in-process.
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [outArg = "docs/countries", ...pairs] = process.argv.slice(2);
const outDir = resolve(root, outArg);
mkdirSync(outDir, { recursive: true });

const DEFAULT = {
  "sg-tampines": "?mock=elevated&area=Tampines",
  "th-bangkok": "?country=th&area=bangkok",
  "th-chiang-mai": "?country=th&area=chiang-mai",
  "my-kuala-lumpur": "?country=my&area=kuala-lumpur",
  "my-johor-bahru": "?country=my&area=johor-bahru",
  "id-palembang": "?country=id&area=palembang",
  "id-jakarta": "?country=id&area=jakarta",
  "vn-hanoi": "?country=vn&area=hanoi",
  "ph-metro-manila": "?country=ph&area=metro-manila",
  "la-vientiane": "?country=la&area=vientiane",
  "kh-phnom-penh": "?country=kh&area=phnom-penh",
};
const shots = pairs.length ? Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)])) : DEFAULT;

const server = await createServer({ root, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
try {
  for (const [name, q] of Object.entries(shots)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`${name}: page error:`, e.message));
    await page.goto(`http://127.0.0.1:${port}/${q}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
    console.log("wrote", `${outArg}/${name}.png`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
