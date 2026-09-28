// Bundles src/server.ts (+ the shared packages/core/src/countries code) into one ESM file: dist/server.js.
import { build } from "esbuild";

await build({
  entryPoints: [new URL("../src/server.ts", import.meta.url).pathname],
  outfile: new URL("../dist/server.js", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  legalComments: "none",
  logLevel: "info",
});
