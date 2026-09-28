# hazenow.sg: the HazeNow website

The public landing page for HazeNow. It's static, with no framework and about 13 KB of gzipped JS. The hero
shows **NEA's actual current 1-hr PM2.5** for the island, a NEA station or any of the 55 planning areas. It does
this with `packages/core` (imported from source, like `apps/web`), so the maths and the COPY.md wording
match every HazeNow app. There are no cookies and no analytics. The chosen area is kept in `localStorage` only.

```sh
# from the repo root (deps are hoisted there by the npm workspaces)
cd apps/site
npm run dev            # http://localhost:5173
npm run build          # → dist/  (runs scripts/assets.mjs first)
npm run preview        # http://localhost:4174
npm run shots          # screenshots at 1440/768/390, light + dark → docs/screenshots/ (needs preview running)
node scripts/shoot-download.mjs   # /download/ at 390 (iPhone UA, + dark with Android UA) and 1440 (Mac UA), with checks
```

`apps/site` isn't in the root `workspaces` list yet, but it works as it is because everything it needs is already
hoisted into the root `node_modules`. To add it, put `"apps/site"` in the root `package.json` workspaces.

## Build-time settings

| env | default | what |
|---|---|---|
| `HAZENOW_APP_BASE` | `https://app.hazenow.sg/` | where the web app (`apps/web`) is served. Every "Open HazeNow" link and "How we calculate this" uses it. A same-origin path such as `/app/` also works (see "Alternative: one host"). |
| `HAZENOW_SITE_URL` | `https://hazenow.sg` | the canonical URL, `og:url`/`og:image`, JSON-LD, `robots.txt` and `sitemap.xml`. It's a placeholder until a domain is registered. |
| `HAZENOW_REPO_URL` | `https://github.com/yongquantan/hazenow` | GitHub links |
| `HAZENOW_RELEASES_REPO` | `yongquantan/hazenow` | `owner/repo` whose GitHub Releases the `/download/` buttons use (`https://github.com/<repo>/releases/latest/download/<asset>`), plus the release version shown there and the Obtainium link. |

**Downloads only work publicly once the release repo is public.** GitHub serves release assets of a private repo only to
signed-in collaborators, so for everyone else the buttons 404 and the page falls back to "Latest version on GitHub Releases".
For now the repo stays private (founder decision). To go live, either make `yongquantan/hazenow` public, or publish releases to a
public repo and build with `HAZENOW_RELEASES_REPO=yongquantan/hazenow-releases`. Nothing else changes.

`index.html` and `download/index.html` use `%SITE_URL%`, `%APP_BASE%`, `%REPO_URL%`, `%RELEASES_REPO%` and `%DL%` (the latest-download base) tokens, which `vite.config.ts` fills in. `robots.txt` and
`sitemap.xml` are generated at build time.

## What's where

- `index.html`: every section in order: hero with the live reading, product demo, "Get it everywhere", two clocks,
  built to be shared, why open source, Southeast Asia, updates, About (COPY.md §18 verbatim) and the footer. It also holds the SEO
  meta and the `SoftwareApplication` JSON-LD.
- `download/index.html` + `src/download.ts`: the `/download/` page (a second Vite entry). Every platform with short install
  steps; the card for the visitor's device (from the user agent; `?platform=ios|android|mac|web` forces one) is marked
  "Recommended for this device" and moved first, but all options stay visible. The latest version and date come from the
  GitHub Releases API in the browser, cached per session, with a plain "Latest version on GitHub Releases" link if it fails
  (private repo, rate limit, offline). Buttons use the stable asset names: `HazeNow-android.apk`, `HazeNow-mac.zip`,
  `hazenow-cli.tgz`, `HazeNow-scriptable.js`, `hazenow.2m.py`, `hazenow-home-assistant.zip`, `SHA256SUMS.txt`.
- `src/main.ts`: the live reading and the area picker. It refreshes every 5 min while the page is visible, v1-first via core. It
  also fills the menu-bar/CLI demo with the same live reading and powers "Copy script".
  Links meant for the app (`?embed=`, `?lat=`/`?lon=`, `?mock=`, `?theme=`) that land on `/` are sent on to the app.
- **Share-card links land here.** Every card links to `https://hazenow.sg/?area=<name or slug>` or `?region=<name>`, plus
  `&s=<card>`. The page then preselects that place in the hero reading (without saving it as the visitor's own choice),
  and shows "Shared with you: air in Tampines" above the card. It also keeps the link's params untouched on "Open HazeNow"
  (`https://app.hazenow.sg/?area=Tampines&s=now`). Both `Jurong%20East` and `jurong-east` resolve. If the reader picks
  another place, the line goes away and the link follows their pick.
- `src/style.css`: brand tokens (Ink/Paper/Ivory/Mist), self-hosted Apfel Grotezk and dark mode. The **only** animation
  is the logo's sun rising through the haze lines on hover/focus (440 ms, runs once, off under `prefers-reduced-motion`).
- `scripts/assets.mjs`: copies the fonts, favicon, the OG image (the web app's generic card 6, `apps/web/docs/cards/og-generic.png`)
  and the one-file integrations (`public/get/`: Scriptable, SwiftBar, shell) into `public/`. It also converts the real share cards
  and the Android screenshot to WebP with `cwebp`. If `cwebp` is missing, the WebPs already checked in are used.
- `scripts/shoot.mjs`: the playwright-core screenshot and QA pass (local Chrome). It fails if the live number doesn't render,
  an image doesn't load, or the page scrolls sideways.

Honesty rules the page follows: no store badges, because nothing is on a store yet. Every platform has a text + shape status (Live /
Available / Beta / Coming soon). "Get it everywhere" links to `/download/`, whose buttons point at the files the release workflow
attaches to every GitHub Release. The CLI installs from the release tarball (`npm i -g <url>`), because the package isn't on npm yet. For SEA, only Thailand is named, as "next · checking data licence"
(see `docs/sea/thailand.md`).

## Deploy: site at hazenow.sg, app at app.hazenow.sg (chosen)

Two static deployments from this repo, each on its own domain:

| domain | build | output |
|---|---|---|
| `hazenow.sg` (this site) | `npm ci && npm run build --prefix apps/site` | `apps/site/dist` |
| `app.hazenow.sg` (the PWA) | `npm ci && npm run build -w hazenow-web` | `apps/web/dist` |

`apps/web` needs **no base-path changes** this way: it keeps living at `/` on its own host, so its service worker, manifest scope
and absolute paths are right. Its share links should still point at `https://hazenow.sg/?area=…&s=…`, as they do today, and this page is their landing.
Set `HAZENOW_SITE_URL` (default `https://hazenow.sg`) and `HAZENOW_APP_BASE` (default `https://app.hazenow.sg/`) if the domains change.

**Cloudflare Pages:** create two Pages projects on the same repo with the builds above (Node 20), then add the custom
domains `hazenow.sg` and `app.hazenow.sg`. Optionally add a `_headers` file for long cache on `/assets/*` (hashed names).

**Railway (static):** two services on the same repo, each with its build command. Serve its folder with Caddy
(`caddy file-server --root apps/site/dist --listen :$PORT`) or `npx serve apps/site/dist -l $PORT`. Add each domain under Settings → Networking.

**GitHub Pages:** one repo serves one Pages site, so host the site here and the app on Cloudflare/Railway. Alternatively, use
the one-host layout below with a single Pages deployment (`out/CNAME` = `hazenow.sg`).

### Alternative: one host, app at `/app/`

`scripts/bundle.sh` builds both into `apps/site/out/`, with the site at `/` and `apps/web` built with `--base=/app/` in `out/app/`.
Run it with `HAZENOW_APP_BASE=/app/ sh apps/site/scripts/bundle.sh`.
Before `apps/web` works under `/app/`, its owner needs to change some things (this folder doesn't touch `apps/web`):
- `navigator.serviceWorker.register("/sw.js")` should use `import.meta.env.BASE_URL + "sw.js"`. Otherwise the SW scope is `/` and it would cache the landing page.
- `manifest.webmanifest` `start_url`/`scope`/icon `src` should be `/app/…`. `/how.html` and `href="/"` in `main.ts`/`how.html` should be base-relative.
- The `sw.js` precache list in `vite.config.ts` should be prefixed with the base.

## Domain note (nothing bought)

- `hazenow.sg` appeared **unregistered** in an SGNIC whois check (28 Sep 2026). `.sg` must go through an
  **SGNIC-accredited registrar**, and the registrant needs a **Singapore presence**: a local entity (UEN), or an individual with a
  Singapore address and ID. Otherwise you need a local administrative contact. Check the registrar's requirements before relying on it.
- Also consider **`hazenow.app`**, which was also unregistered (docs/DISTRIBUTION.md §6). It's HTTPS-only (HSTS-preloaded TLD), which suits
  a PWA and has no local-presence rule. A common setup is `hazenow.app` as primary with `hazenow.sg` redirecting to it, or the reverse for local trust.
- Whichever domain wins, set `HAZENOW_SITE_URL` and update the share URL and card footers in the apps, which currently print `hazenow.sg`.

## Screenshots

`docs/screenshots/{1440,768,390}-{light,dark}.png` (full page) and `…-top.png` (first screen), from `npm run shots`.
