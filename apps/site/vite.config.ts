import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * Deploy settings (environment variables at build time):
 *   HAZENOW_SITE_URL  canonical origin, no trailing slash   (default https://hazenow.pages.dev)
 *   HAZENOW_APP_BASE  where the web app (apps/web) is served (default https://hazenow-app.pages.dev/).
 *                     A same-origin path such as /app/ also works (see README, "Alternative: one host").
 *   HAZENOW_REPO_URL  GitHub repository                     (default https://github.com/yongquantan/hazenow)
 *   HAZENOW_RELEASES_REPO  owner/repo that hosts the GitHub Releases the download buttons point at
 *                     (default yongquantan/hazenow). Links use /releases/latest/download/<asset>, which only
 *                     works for anonymous visitors once that repo is public (see README, "Downloads").
 *   HAZENOW_CF_BEACON_TOKEN  optional Cloudflare Web Analytics token (cookieless, counts visits in total). Only
 *                     needed when Web Analytics is NOT enabled on the Pages project itself, which injects the beacon
 *                     automatically; never set both, or visits are counted twice. See README, "Usage counts".
 */
const SITE_URL = (process.env.HAZENOW_SITE_URL ?? "https://hazenow.pages.dev").replace(/\/$/, "");
const APP_BASE = (process.env.HAZENOW_APP_BASE ?? "https://hazenow-app.pages.dev/").replace(/\/?$/, "/");
const REPO_URL = (process.env.HAZENOW_REPO_URL ?? "https://github.com/yongquantan/hazenow").replace(/\/$/, "");
const RELEASES_REPO = (process.env.HAZENOW_RELEASES_REPO ?? "yongquantan/hazenow").replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
const BEACON = (process.env.HAZENOW_CF_BEACON_TOKEN ?? "").trim();
const BEACON_TAG = /^[A-Za-z0-9]{16,64}$/.test(BEACON)
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${BEACON}"}'></script>\n  </head>`
  : "</head>";
const TOKENS: Record<string, string> = {
  "%SITE_URL%": SITE_URL,
  "%APP_BASE%": APP_BASE,
  "%REPO_URL%": REPO_URL,
  "%RELEASES_REPO%": RELEASES_REPO,
  "%DL%": `https://github.com/${RELEASES_REPO}/releases/latest/download`,
};

function siteMeta(): Plugin {
  return {
    name: "hazenow-site-meta",
    transformIndexHtml: (html) =>
      html.replace(/%(SITE_URL|APP_BASE|REPO_URL|RELEASES_REPO|DL)%/g, (m) => TOKENS[m]).replace("</head>", BEACON_TAG),
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      // A sitemap may only list URLs on its own host, so the app is listed only when it's served under this site.
      const appUrl = new URL(APP_BASE, SITE_URL + "/").href;
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/download/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>
${appUrl.startsWith(SITE_URL + "/") ? `  <url><loc>${appUrl}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>\n` : ""}</urlset>
`,
      });
    },
  };
}

export default defineConfig({
  plugins: [siteMeta()],
  define: {
    __APP_BASE__: JSON.stringify(APP_BASE),
    __REPO_URL__: JSON.stringify(REPO_URL),
    __RELEASES_REPO__: JSON.stringify(RELEASES_REPO),
  },
  resolve: {
    // Reuse the shared core (SPEC maths + COPY.md strings) from source, like apps/web does.
    alias: { hazenow: resolve(here, "../../packages/core/src/index.ts") },
  },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { main: resolve(here, "index.html"), download: resolve(here, "download/index.html") },
    },
  },
});
