# HazeNow for Raycast

Two commands:
- **HazeNow Menu Bar**: `◐ 137 ▲` in the macOS menu bar, refreshed every 2 min. The dropdown opens with the verdict ("OK to be out. Go easy on hard exercise."), then the number, trend, where-you-sit anchor, provenance, 1–3 actions, NEA 24-hr PSI, regions, NEA's forecast link, "Copy share text", and the footer.
- **Haze Now**: a list of every area plus Islandwide, with a detail pane that includes the "Last 24 hours" chart (hourly PM2.5 against NEA's 24-hr PM2.5 average, both µg/m³, shown as same-scale sparklines) and "Why two numbers?".

Preferences: **Region** (central/north/south/east/west/island) and **Who are you checking for?** (the six COPY.md profiles).
Copy is `docs/COPY.md` verbatim. There's no Instant PSI anywhere (SPEC v1.2). Band shapes use Raycast icons: circle, half circle, warning triangle, and stop (octagon).

## Develop
```sh
npm install
npm run typecheck          # tsc --noEmit
npm test                   # SPEC vectors + COPY rules (node --experimental-strip-types); LIVE=1 also hits data.gov.sg
npx ray develop            # needs the Raycast app
npx ray build -e dist      # ✅ builds (verified 28 Sep 2026)
```

`src/haze.ts` is self-contained (maths, COPY strings, v1-first fetch with v2 fallback, per-hour merge). An identical copy lives in `../telegram-bot/src/haze.ts`.

## What's left before the Raycast Store
- `npx ray lint` needs the Raycast ESLint config (`@raycast/eslint-config`) and a store-quality 512×512 icon. `assets/icon.png` is the brand app icon (`brand/png/app-icon-512.png`); the menu-bar no-data state uses `assets/mark-currentcolor.svg`.
- Screenshots in `metadata/`, a CHANGELOG, and the `author` field set to a real Raycast handle.
- Open a PR to `raycast/extensions`.
