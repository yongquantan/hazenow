#!/usr/bin/env node
/**
 * Copy brand fonts, the OG card, the one-file integrations (served at /get/) and real repo screenshots/cards
 * into public/. Runs before every build. Images are converted to WebP with `cwebp` (`brew install webp`);
 * if cwebp is missing, existing WebPs in public/img are kept, so a normal build doesn't need it.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeScriptable } from "../../../integrations/scriptable/make-scriptable.mjs";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(site, "../..");
const pub = resolve(site, "public");
mkdirSync(resolve(pub, "fonts"), { recursive: true });
mkdirSync(resolve(pub, "img"), { recursive: true });
mkdirSync(resolve(pub, "get"), { recursive: true });

for (const w of ["Regular", "Mittel", "Fett"]) {
  copyFileSync(resolve(repo, `brand/fonts/ApfelGrotezk-${w}.woff2`), resolve(pub, `fonts/apfel-grotezk-${w.toLowerCase()}.woff2`));
}
copyFileSync(resolve(repo, "brand/fonts/OFL.txt"), resolve(pub, "fonts/OFL.txt"));
copyFileSync(resolve(repo, "brand/svg/favicon.svg"), resolve(pub, "favicon.svg"));
copyFileSync(resolve(repo, "brand/png/app-icon-180.png"), resolve(pub, "apple-touch-icon.png"));
copyFileSync(resolve(repo, "brand/png/favicon-32.png"), resolve(pub, "favicon-32.png"));
// OG image: the web app's generic link-preview card ("card 6"), rendered by apps/web/src/cards.ts.
copyFileSync(resolve(repo, "apps/web/docs/cards/og-generic.png"), resolve(pub, "og.png"));
// One-file integrations, so "Copy script" / "Download" work from the site itself.
copyFileSync(resolve(repo, "integrations/scriptable/HazeNow.js"), resolve(pub, "get/HazeNow.js"));
copyFileSync(resolve(repo, "integrations/swiftbar/hazenow.2m.py"), resolve(pub, "get/hazenow.2m.py"));
copyFileSync(resolve(repo, "integrations/shell/hazenow-status.sh"), resolve(pub, "get/hazenow-status.sh"));
// The one-tap Scriptable import (served with a download content type by public/_headers).
mkdirSync(resolve(pub, "widget"), { recursive: true });
writeFileSync(resolve(pub, "widget/HazeNow.scriptable"), JSON.stringify(makeScriptable(), null, 2) + "\n");

let hasCwebp = true;
try {
  execFileSync("cwebp", ["-version"], { stdio: "ignore" });
} catch {
  hasCwebp = false;
}

/** [source, output name, width, optional crop "WxH" from the top] */
const images = [
  ["apps/web/docs/cards/elevated-now-picked.png", "card-now", 720],
  ["apps/web/docs/cards/elevated-clocks.png", "card-clocks", 720],
  ["apps/web/docs/cards/elevated-group-kids.png", "card-kids", 720],
  ["apps/web/docs/cards/all_clear-clear-picked.png", "card-clear", 720],
  ["apps/web/docs/cards/high-clocks.png", "clocks-rising", 720],
  ["apps/web/docs/cards/all_clear-clocks.png", "clocks-cleared", 720],
  ["apps/android/docs/screenshots/16-main-v15-estimate.png", "android-main", 540, [1080, 1800, 0, 300]],
  // Southeast Asia switcher: the web app's per-country screens (390×844 @2x, full page), first screen only.
  // Cropped at 790 CSS px so the QA "MOCK DATA" ribbon on the Singapore capture stays out of frame.
  ...["sg-tampines", "th-bangkok", "th-chiang-mai", "my-kuala-lumpur", "my-johor-bahru", "id-palembang", "id-jakarta",
    "vn-hanoi", "ph-metro-manila", "la-vientiane", "kh-phnom-penh"].map((n) => [`apps/web/docs/countries/${n}.png`, `sea-${n}`, 540, [780, 1580, 0, 0]]),
];
for (const [src, name, width, crop] of images) {
  const out = resolve(pub, `img/${name}.webp`);
  // Some sources (e.g. most apps/web/docs/cards PNGs) are git-ignored and only exist after `npm run cards -w hazenow-web`.
  // Without cwebp or the source, keep the WebP that's checked in, so CI and clean checkouts build as-is.
  if (!hasCwebp || !existsSync(resolve(repo, src))) {
    if (!existsSync(out)) throw new Error(`${out} is missing and can't be made (needs cwebp and ${src})`);
    if (hasCwebp) console.log(`img/${name}.webp kept (no ${src}; run npm run cards -w hazenow-web to refresh)`);
    continue;
  }
  const args = ["-quiet", "-q", "82", "-m", "6", "-resize", String(width), "0"];
  if (crop) args.push("-crop", String(crop[2]), String(crop[3]), String(crop[0]), String(crop[1]));
  execFileSync("cwebp", [...args, resolve(repo, src), "-o", out]);
  console.log("img/" + name + ".webp");
}
