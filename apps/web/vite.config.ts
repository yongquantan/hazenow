import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

/** Fill sw.js with the full list of built files (hashed JS/CSS included) and a content hash version. */
function precacheManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "hazenow-precache",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir.startsWith("/") ? c.build.outDir : resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = resolve(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(p.slice(outDir.length).replace(/\\/g, "/"));
        }
      };
      walk(outDir);
      // Mock-scenario chunks (?mock=… QA only) and share assets aren't needed offline. The other-country module and its
      // recorded preview sets load on demand (SPEC v2.0), so Singapore users never download them, not even to precache.
      const skip = /^\/(sw\.js|og\.png|docs\/|fonts\/OFL\.txt|assets\/(normal|elevated|high|very_high|south_offline|all_offline_stale|rising_fast|network_error|country|my|id|vn|ph|la)-)/;
      const urls = files.filter((f) => !skip.test(f)).map((f) => (f === "/index.html" ? "/" : f)).sort();
      const hash = createHash("sha256");
      for (const f of files.filter((f) => !f.endsWith("sw.js")).sort()) hash.update(f).update(readFileSync(resolve(outDir, "." + f)));
      const swPath = resolve(outDir, "sw.js");
      const sw = readFileSync(swPath, "utf8")
        .replace("__BUILD__", hash.digest("hex").slice(0, 12))
        .replace(/\/\*__PRECACHE__\*\/ \[[^\]]*\]/, JSON.stringify(urls));
      writeFileSync(swPath, sw);
    },
  };
}

/**
 * Optional Cloudflare Web Analytics beacon (cookieless; counts visits in total). Set HAZENOW_CF_BEACON_TOKEN at build
 * time only when Web Analytics is NOT enabled on the Pages project itself (that injects the beacon automatically);
 * never both, or visits are counted twice. See the root README, "Usage counts".
 */
function webAnalytics(): Plugin {
  const token = (process.env.HAZENOW_CF_BEACON_TOKEN ?? "").trim();
  return {
    name: "hazenow-web-analytics",
    transformIndexHtml: (html) =>
      /^[A-Za-z0-9]{16,64}$/.test(token)
        ? html.replace("</head>", `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>\n  </head>`)
        : html,
  };
}

export default defineConfig({
  plugins: [precacheManifest(), webAnalytics()],
  resolve: {
    // Use the core package's TypeScript source directly (no pre-build step needed).
    alias: { hazenow: resolve(here, "../../packages/core/src/index.ts") },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        main: resolve(here, "index.html"),
        how: resolve(here, "how.html"),
      },
    },
  },
});
