# HazeNow QA matrix (cloud, recorded)

Each surface is tested by one Devin session on its own VM. Every session:
1. Builds from a clean checkout following the surface README (don't modify product code except to unblock a build; note any such change in the report).
2. Runs the unit tests for its surface.
3. Walks every scenario below that applies, **recording the screen** with a short text annotation at each checkpoint.
4. Returns the structured report (schema in `scripts/devin-qa.sh`) and does **not** open a PR unless told to.

Source of truth for expected behaviour: `SPEC.md` (the v1.2 amendments win) and `docs/COPY.md` (exact strings).

## Scenarios (use the surface's mock mode; see each README)

| id | setup | must see | must NOT see |
|----|-------|----------|--------------|
| S1 live | no mock, real network | a real PM2.5 value, band chip with label + icon, verdict headline, provenance "station · distance/region · N min ago", official 24-hr PSI visible, chart of hourly bars + 24-hr PM2.5 line | "-1", "Instant PSI", "lagging", NaN, empty chart |
| S2 normal | mock normal | "Fine to be out." style verdict, green band, no action list (or calm one) | alarm styling |
| S3 elevated | mock elevated | amber band, verdict per COPY.md, 1–3 actions, anchor to next band | green or magenta text on Elevated (oklch bug) |
| S4 high | mock high | High band, stricter verdict; with profile Kids: no N95/mask action | masks as first action |
| S5 very_high | mock very_high | "Stay indoors" verdict, readable contrast, calm (no flashing) | flashing/alarm red, unreadable text |
| S6 south_offline | mock south_offline, region South | falls back to nearby stations, says so in words | "-1" anywhere |
| S7 stale | mock all_offline_stale | stale state wording from COPY.md, time of last good reading | a fresh-looking reading |
| S8 rising | mock rising_fast | trend phrase "Rising fast — up 25 in 1 h" (COPY.md form), arrow | |
| S9 net_error | mock network_error | error/offline state from COPY.md, last snapshot if cached | crash, spinner forever |
| S10 profiles | cycle General → Kids → Elderly → Pregnant → Heart/lung → Exercising → Works outdoors on mock high | verdict and actions change per COPY.md, strictest wins for multi-select | N95 for Kids |
| S11 location | grant location at a West coordinate (1.35, 103.70) then East (1.35, 103.94) | reading changes, provenance names nearest station + distance | |
| S12 location denied | deny permission | graceful fallback to region picker, no nag loop | crash |
| S13 dark mode | toggle system dark | all text legible, band colors distinguishable | |
| S14 accessibility | largest text size + screen reader (VoiceOver/TalkBack) or axe for web | headline announced once; label like "PM2.5 105, Elevated, rising"; nothing color-only | whole screen re-announced on refresh |
| S15 share | tap share | share sheet with text/image per COPY.md §15; image shows bars vs 24-hr line in µg/m³ | Instant PSI, "real number" framing |
| S16 small widgets / compact | add every widget size / compact surface | `● 105 ▲`-style compact, short verdict ≤28 chars on medium | truncated or clipped text |

## Surface-specific

### A. iOS (macOS VM, iOS Simulator)
- Build app + widget extension for simulator; install; launch with `-HazeMock <scenario>`.
- Home widgets small/medium/large; Lock Screen circular/rectangular/inline; verify they reflect the mock.
- Start "Haze watch" Live Activity; check Lock Screen + Dynamic Island (iPhone 16 Pro sim).
- Location via `xcrun simctl location booted set 1.35,103.70`.
- Notifications: trigger a band crossing via mocks (elevated → high → normal) and confirm rise + all-clear copy; confirm General-only profile gets no Elevated alert.
- watchOS complication if the target exists.

### B. macOS desktop (macOS VM)
- Menu bar app: compact item, popover content, region picker, launch-at-login toggle, mock mode.
- Notch pill: the VM has no notch → verify the setting degrades gracefully (no stray window, no crash). Record it.
- macOS desktop widgets.
- `integrations/swiftbar` plugin output, `integrations/shell` tmux/starship one-liners, `npx hazenow --oneline` from packages/core.
- Raycast extension: `npm ci && npx ray build` in integrations/raycast (type-check/build only).

### C. Android (Linux VM, x86_64 emulator)
- Install SDK per apps/android/README.md; use an **x86_64** system image (android-35 google_apis x86_64). Use KVM if available, else `-no-accel` / swiftshader.
- `./gradlew :core:test assembleDebug`; install; mocks via `am start --es mock`.
- Glance widgets (small + medium), QS tile, "Haze watch" ongoing notification, rise/all-clear alerts, `adb emu geo fix 103.70 1.35`.
- Screenshots via `adb exec-out screencap -p` in addition to desktop recording.

### D. Web + services (Linux VM, browser)
- `packages/core` tests; CLI `--json`, `--oneline`, `--watch` (30 s).
- `apps/web`: build, serve, test at 390×844 and 1440×900; all scenarios via `?mock=`; install as PWA; go offline → last snapshot marked stale; `?embed=1` card; run axe (or Lighthouse a11y + PWA) and report scores.
- `integrations/home-assistant` pytest; `integrations/telegram-bot` type-check; `integrations/scriptable` script runs in Node with a Scriptable shim if feasible (else static review).

## Round 2 additions

- **iOS widget Place (round-1 P2, unconfirmed):** configure a widget to "East" while the app is set to another area; run `log stream --predicate 'subsystem == "sg.hazenow.widgets"'` and confirm `place=east` is logged and the widget shows East. If it logs `place=automatic`, report it as a WidgetKit delivery issue with the log.
- **Largest text sizes (round-1 P1/P2):** iOS at the largest Dynamic Type (use `-HazeOpenSheet profiles` to reach the profile screen), Android at `font_scale 2.0`: number on one line, band chip readable, NEA 24-hr PSI visible without scrolling at High/Very High, profile rows not overlapping. Scroll to check the band chip.
- **Permission prompts:** for every permission prompt (notifications, location), tap "allow" AND "deny" and confirm something visibly happens each time. Round 1 missed a Mac "Yes, notify me" button that did nothing.
- **Share:** tap Share in each band and persona; confirm the auto-picked card matches SPEC v1.6, the image is 1080×1350 (1200×630 for the preview), and image + text + link all arrive. Check a stale reading: no trend, "that hour" wording.
- **Mac region picker:** choose each NEA station from the menu and by clicking region cards.
- **Site (web session, section D):** build `apps/site`, serve it, check 1440/768/390 in light and dark: live reading renders, area picker works, `?area=Tampines&s=now` shows "Shared with you: air in Tampines" and preselects Tampines, "Open HazeNow" keeps the params, no horizontal scroll, logo animation is off under reduced motion, axe has no serious violations.
- **Proxy (web session, section D):** `cd services/proxy && npm test`, then run it locally and call `/health` and `/v1/th/observations`; confirm attribution strings are present. Thailand in the apps' UI is not in this build (SPEC v2.0 client work is pending) — don't test it in the apps.
- **Multi-country (round 2):** in the web app and the native apps, open Bangkok, Pai, Kuala Lumpur, Johor Bahru, Palembang, Canggu (Bali), Hanoi, Metro Manila, Vientiane and Siem Reap via the place sheet and via deep links (`?country=th&area=pai`). Check: verdict headline always present; "Estimate:" for community estimates; WHO bands where no national scale; never readings across a border; the source credited. Emulate timezones (Asia/Bangkok, Asia/Makassar, Europe/London) to check the country guess. Check `/download/` on each OS.
- **Data server:** `GET https://hazenow-data.yongquan26.workers.dev/health` and `/v1/{my,id,vn,ph,la,kh,th}/observations` respond with attribution; no IPs or coordinates echoed.
