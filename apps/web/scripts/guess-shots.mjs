// SPEC v2.1 QA: screenshot the first run under emulated time zones / languages at 390 px, plus the two-step sheet.
// `node scripts/guess-shots.mjs <outDir>`. Uses your installed Chrome via playwright-core (override with CHROME_PATH).
// /api/where doesn't exist under Vite, so the device guess stands unless a shot fakes the connection country.
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = resolve(process.cwd(), process.argv[2] ?? "guess-shots");
mkdirSync(outDir, { recursive: true });

const shots = [
  { name: "tz-bangkok", tz: "Asia/Bangkok", locale: "en-US" },
  { name: "tz-bangkok-th", tz: "Asia/Bangkok", locale: "th-TH" },
  { name: "tz-bangkok-vn-connection", tz: "Asia/Bangkok", locale: "en-US", where: "VN" },
  { name: "tz-makassar", tz: "Asia/Makassar", locale: "en-US" },
  { name: "tz-kuala-lumpur", tz: "Asia/Kuala_Lumpur", locale: "en-US" },
  { name: "tz-london", tz: "Europe/London", locale: "en-GB" },
  { name: "tz-yangon", tz: "Asia/Yangon", locale: "en-US" },
  { name: "tz-singapore", tz: "Asia/Singapore", locale: "en-US" },
  { name: "link-wins", tz: "Asia/Bangkok", locale: "th-TH", q: "?area=Tampines" },
  { name: "sheet-1-countries", tz: "Asia/Bangkok", locale: "th-TH", act: async (p) => { await p.click('[data-key="guess-change"]'); } },
  { name: "sheet-2-thailand", tz: "Asia/Bangkok", locale: "th-TH", act: async (p) => { await p.click('[data-key="guess-change"]'); await p.click('[data-key="cc-TH"]'); await p.waitForTimeout(300); } },
  { name: "sheet-2-singapore", tz: "Asia/Bangkok", locale: "th-TH", act: async (p) => { await p.click('[data-key="guess-change"]'); await p.click('[data-key="cc-SG"]'); } },
  { name: "sheet-search-bali", tz: "Asia/Bangkok", locale: "th-TH", act: async (p) => { await p.click('[data-key="guess-change"]'); await p.fill("#area-search", "bali"); await p.waitForTimeout(400); } },
  { name: "sheet-search-saigon", tz: "Europe/London", locale: "en-GB", act: async (p) => { await p.click('[data-key="wc-VN"]'); await p.click('[data-key="sheet-back"]'); await p.fill("#area-search", "saigon"); await p.waitForTimeout(600); } },
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const server = await createServer({ root, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
try {
  for (const s of shots) {
    if (only && !only.has(s.name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block", timezoneId: s.tz, locale: s.locale });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`${s.name}: page error:`, e.message));
    if (s.where) await page.route("**/api/where", (r) => r.fulfill({ contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ country: s.where }) }));
    await page.goto(`http://127.0.0.1:${port}/${s.q ?? ""}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    if (s.act) await s.act(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${s.name}.png`, fullPage: !s.name.startsWith("sheet") });
    console.log("wrote", s.name, "·", await page.evaluate(() => document.querySelector(".guess-line, .where-card h2, .first-run h2")?.textContent?.trim() ?? "-"));
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
