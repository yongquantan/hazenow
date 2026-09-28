# HazeNow for SwiftBar / xbar (macOS menu bar)

The zero-install-friction Mac path: one Python file, standard library only, no build, no account.

```
● 137 ▲          ← menu bar: dot in band colour, NEA 1-hr PM2.5, trend
OK to be out. Go easy on hard exercise.
For you
Getting worse. Check again in an hour.
137 PM2.5 · ◐ Elevated
Rising fast: up 57 in 2 hours
Elevated band (56–150). High starts at 151.
NEA Central station · measured 5pm · 6 min ago
What you can do
  Haze isn't always easy to see. Check here before a long run.
NEA 24-hr PSI: 86 (Moderate) · 24-hour average
Last 24 hours (µg/m³)
  hourly PM2.5   ▂▂▂▂▂▂▂▂▂▂▃▂▂▂▂▂▃▃▃▄▅▅▇█
  NEA 24-hr avg  ▅▅▅▄▄▄▃▃▃▃▃▃▃▃▃▂▂▂▂▂▂▃▃▃
Why two numbers? ▸  ·  Planning for tomorrow? …  ·  Across Singapore ▸  ·  Show area ▸  ·  Who are you checking for? ▸
Copy share text · Open HazeNow · Refresh
Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account
```
(That's real output from 28 Sep 2026, 5pm.)

## Install
1. `brew install --cask swiftbar` (or xbar), then pick a plugin folder.
2. Copy `hazenow.2m.py` into that folder and `chmod +x` it. The `2m` in the name is the refresh interval.
3. Pick your area and "Who are you checking for?" from the dropdown. Choices are saved in `~/.config/hazenow/swiftbar.json`.

Optional (SwiftBar's plugin settings or xbar variables): `HAZENOW_LAT` / `HAZENOW_LON` give a reading
estimated for that spot from all five NEA stations (inverse-distance weighting). The coordinates never leave the Mac.

## How it fetches
- NEA **v1** (`api.data.gov.sg/v1/environment/pm25` and `/psi`) first: it's fresh about 1 minute after the hour and has no observed rate limit. v2 is only a fallback.
- Network is used only when the current hour isn't in the cache yet, or every 20 minutes otherwise. Yesterday's data is cached on disk.
- The chart is hourly PM2.5 against NEA's 24-hr PM2.5 average. Both are in µg/m³, so the lag is visible without inventing an index.

## Check it
```
python3 hazenow.2m.py --selftest   # SPEC test vectors
python3 hazenow.2m.py              # what SwiftBar renders
python3 hazenow.2m.py --json       # snapshot (includes instantPsi for data users; never shown in the menu)
```
The maths and copy block is a verbatim copy of `../home-assistant/custom_components/hazenow/hazemath.py`, so keep them in sync.
