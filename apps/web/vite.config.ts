import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
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
