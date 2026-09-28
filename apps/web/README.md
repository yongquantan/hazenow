# HazeNow web (PWA)

The primary shareable surface: a mobile-first page that answers "is it OK to be out right now?" from NEA's
latest 1-hr PM2.5, with NEA's 24-hr PSI shown alongside. Vanilla TypeScript + Vite; it imports the
`hazenow` core package from source (`packages/core/src`), so there is no separate build step for core.

```sh
npm install            # from the repo root (npm workspaces)
npm run dev -w hazenow-web
npm run build -w hazenow-web && npm run preview -w hazenow-web   # http://localhost:4173
```

## URL parameters

| param | effect |
|---|---|
| `?region=west` | pick a region (`north`, `south`, `east`, `west`, `central`) |
| `?area=Tampines` | a URA planning area or estate name (offline lookup in `packages/core/data/sg-areas.json`) |
| `?lat=1.33&lon=103.72` | reading for a point (inverse-distance weighting) |
| `?embed=1` | compact card for iframes (combine with `region` or `lat`/`lon`) |
| `?theme=dark` / `?theme=light` | force a theme (mainly for embeds) |
| `?mock=<scenario>` | deterministic QA data, see below |

## Mock mode (QA)

`?mock=<scenario>` replaces the network with fixtures from `packages/core/fixtures/scenarios/*.json`,
freezes the clock at the scenario's `_meta.now` (2026-09-28 16:35 SGT), skips the on-device cache and the
service worker, and shows a small "MOCK DATA" ribbon.

| scenario | what you should see |
|---|---|
| `normal` | Normal band everywhere (West 29) |
| `elevated` | the real capture: West 117, South 105, Central 105, East 83, North 49 |
| `high` | High band (West 205), NEA 24-hr PSI still Moderate |
| `very_high` | Very High band (West 310) |
| `south_offline` | `&region=south` shows ~89, the average of the other stations, with an offline note |
| `all_offline_stale` | latest hour all −1: falls back to 3pm, marked old/stale |
| `rising_fast` | every region +25 on the previous hour: "Getting worse. Check again in an hour." |
| `all_clear` | back to Normal after an Elevated afternoon: the share sheet suggests the All clear card |
| `network_error` | every request fails: the error state with "Try again" |

Example: `http://localhost:4173/?mock=south_offline&region=south`.
The same files are used by the core tests and can be reused by the Apple and Android apps
(regenerate with `node packages/core/scripts/make-scenarios.mjs`).

## Location (SPEC v1.4)

First run shows the island average with two equal choices: "Use my location" (a one-line explainer
first, then the browser prompt with `enableHighAccuracy: false`) or "Pick my area" (offline search over
the 55 planning areas plus estate aliases). If location is denied we never ask again automatically:
the area list opens and a quiet "Use my location" button stays in the place sheet. Home, Work/School and
one more place can be saved and switched with one tap. Coordinates are rounded to 2 decimals (~1 km)
before use or storage and never leave the device.

## Sharing (SPEC v1.6)

The Share button (under the number) opens a sheet with the auto-picked card from `pickShareCard()` in
`packages/core/src/share.ts`, a row of the other eligible cards, and **Send** (Web Share with the PNG,
the card's text and a link carrying `?area=`/`?region=` and `?s=<card>`). Fallbacks: download the image,
copy the text, copy the link. Cards are drawn on a canvas at exactly 1080×1350 (link preview 1200×630),
independent of screen density, after the Apfel Grotezk fonts have loaded (`src/cards.ts`).

- Designs: `docs/share-cards/*.html` (repo root). Exported examples for every scenario and persona:
  `apps/web/docs/cards/*.png`.
- QA page (dev server only, not in the production build): `npm run dev -w hazenow-web`, then open
  `/cards.html` (all scenarios) or `/cards.html?sample=1` (the designs' own sample data).
- **Link previews:** `public/og.png` is the generic card 6 ("Air right now, near you"). A static site
  can't render a per-area OG image; the planned Railway service will render live per-area previews
  for `?area=` links later.

## Data and polling

Follows SPEC v1.3: NEA's v1 API (`api.data.gov.sg/v1/environment`) is polled every 60 s from hh:00:30
until the new hour appears, and the rate-limited v2 API is called only around hh:35 and hh:50 to pick up
back-filled values, with exponential backoff on HTTP 429. The last snapshot is kept on the device and
shown with its real age when offline.

## What's in here

- `src/main.ts`: state, polling, views (main page and `?embed=1`)
- `src/chart.ts`: the "Last 24 hours" chart (hourly PM2.5 bars, NEA 24-hr average line, both µg/m³)
- `src/map.ts`: the simple SVG map of the five regions
- `src/sharecard.ts`: the 1200×630 share image (canvas → PNG → Web Share with files, or a download)
- `how.html`: "How we calculate this"
- `public/sw.js`: app-shell service worker (never caches the air data itself)
