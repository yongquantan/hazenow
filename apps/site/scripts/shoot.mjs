#!/usr/bin/env node
/**
 * Screenshot the built site at 1440 / 768 / 390 in light and dark with the local Chrome (playwright-core).
 *   npm run build && npm run preview &   then   npm run shots   [URL, default http://localhost:4174/]
 * Output: apps/site/docs/screenshots/{width}-{scheme}.png (full page), {width}-{scheme}-top.png (first screen),
 *         and {390,1440}-light-shared-top.png (a share-card link landing, checked for the right place and link).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://localhost:4174/";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
const problems = [];
// Every width × scheme, plus a share-link landing (?area=Tampines&s=now) at 390 and 1440, light.
const runs = [];
for (const width of [1440, 768, 390]) for (const scheme of ["light", "dark"]) runs.push({ width, scheme, query: "", name: `${width}-${scheme}` });
for (const width of [390, 1440]) runs.push({ width, scheme: "light", query: "?area=Tampines&s=now", name: `${width}-light-shared` });
for (const { width, scheme, query, name } of runs) {
  {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
    await page.goto(url + query, { waitUntil: "networkidle" });
    const live = await page.waitForSelector(".num", { timeout: 20000 }).then(() => true, () => false);
    if (!live) problems.push(`${name}: live number did not render`);
    // Load lazy images before the full-page shot.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll("img")) { img.loading = "eager"; img.decoding = "sync"; }
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 })
      .catch(() => problems.push(`${name}: some images did not load`));
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${name}: horizontal overflow ${overflow}px`);
    const num = await page.textContent(".num").catch(() => null);
    console.log(`${name}: live PM2.5 = ${num ?? "none"}`);
    if (query) {
      const line = await page.textContent("#shared-line");
      const place = await page.inputValue("#place");
      const href = await page.getAttribute(".ctas a[data-app-link]", "href");
      console.log(`  shared line: "${line}" · picker: ${place} · Open HazeNow → ${href}`);
      if (line !== "Shared with you: air in Tampines" || place !== "a:Tampines" || !href?.endsWith("?area=Tampines&s=now"))
        problems.push(`${name}: shared-link landing is wrong`);
      await page.screenshot({ path: `${out}/${name}-top.png` });
    } else {
      await page.screenshot({ path: `${out}/${name}-top.png` });
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
if (problems.length) {
  console.error("Problems:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Screenshots in ${out}`);
