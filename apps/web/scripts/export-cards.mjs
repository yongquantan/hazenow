// Regenerate every share card PNG from the mock scenarios: `npm run cards -w hazenow-web`.
// Starts the Vite dev server in-process, renders /cards.html in headless Chrome, writes docs/cards/*.png.
// Only the representative cards listed in docs/cards/.gitignore are committed; the rest are ignored.
// Uses your installed Google Chrome via playwright-core (no browser download). Override with CHROME_PATH.
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("../docs/cards/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${port}/cards.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__cards, null, { timeout: 120_000 });
  const cards = await page.evaluate(() => window.__cards);
  for (const c of cards) writeFileSync(`${outDir}${c.name}.png`, Buffer.from(c.dataUrl.split(",")[1], "base64"));
  console.log(`wrote ${cards.length} cards to docs/cards/`);
} finally {
  await browser.close();
  await server.close();
}
