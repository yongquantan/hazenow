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
      // Mock-scenario chunks (?mock=… QA only) and share assets aren't needed offline.
      const skip = /^\/(sw\.js|og\.png|docs\/|fonts\/OFL\.txt|assets\/(normal|elevated|high|very_high|south_offline|all_offline_stale|rising_fast|network_error)-)/;
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

export default defineConfig({
  plugins: [precacheManifest()],
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
