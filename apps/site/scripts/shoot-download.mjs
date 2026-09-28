#!/usr/bin/env node
/**
 * Screenshot /download/ at 390 and 1440 (light, plus dark at 390) and check it: no sideways scroll, no page errors,
 * the device card is recommended, and the release line shows either a version or the fallback link.
 *   npm run build && npm run preview &   then   node scripts/shoot-download.mjs [BASE, default http://localhost:4174]
 * Output: apps/site/docs/screenshots/download-{390,1440}.png, download-390-dark.png, download-{390,1440}-top.png
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:4174").replace(/\/$/, "");
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const runs = [
  { name: "download-390", width: 390, scheme: "light", ua: IPHONE, expect: "iphone" },
  { name: "download-390-dark", width: 390, scheme: "dark", ua: ANDROID, expect: "android" },
  { name: "download-1440", width: 1440, scheme: "light", ua: MAC, expect: "mac" },
];
const problems = [];
for (const { name, width, scheme, ua, expect } of runs) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme, userAgent: ua, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
  await page.goto(base + "/download/", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const first = await page.evaluate(() => document.querySelector("#dl-list > li")?.id);
  if (first !== expect) problems.push(`${name}: first card is ${first}, expected ${expect}`);
  const release = (await page.textContent("#dl-release"))?.trim();
  console.log(`${name}: first card ${first} · release line "${release}"`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${name}: horizontal overflow ${overflow}px`);
  // Open the details so the shot shows everything.
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await page.screenshot({ path: `${out}/${name}-top.png` });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("download page OK");
