# HazeNow iOS widget via Scriptable: no App Store wait

The fastest way to put HazeNow on an iPhone home screen or lock screen today. [Scriptable](https://scriptable.app) is a free App Store app that runs JavaScript widgets.

## Install (2 minutes)
1. Install **Scriptable** from the App Store.
2. Open `HazeNow.js` on your phone (GitHub → Raw), select all, copy.
3. Scriptable → **+** → paste → tap the title and name it **HazeNow** → Done. Tap ▶ once to allow location (optional).
4. Home screen: long-press → **+** → Scriptable → pick Small, Medium or Large → Add → tap the widget → **Script: HazeNow**.
   Lock screen: customise → add a Scriptable widget (circular, rectangular or inline) → Script: HazeNow.
5. Optional **Parameter**, comma-separated: an area (`west`, `island`, …) and/or who you're checking for
   (`kids`, `elderly`, `pregnant`, `heart_lung`, `exercising`, `outdoor_worker`). Example: `west,kids`. Empty means your location, or Central.

## What it shows (real output, 28 Sep 2026 5pm, from `test/harness.mjs`)
```
Medium:  Go easy outdoors            Last 24 hours
         For you                     [bars: hourly PM2.5, coloured by band]
         ~136 PM2.5                  [line: NEA 24-hr PM2.5 average; dashed guides "Elevated 56", "High 151"]
         ◐ Elevated ▲                Bars: hourly PM2.5
         Rising fast: up 56 in 2 hours    Line: NEA 24-hr average PM2.5
         5pm · NEA                   NEA 24-hr PSI: 86 (Moderate)
Large:   + "OK to be out. Go easy on hard exercise." · second line · band anchor ·
           provenance · 1–3 actions · regions row · "Why two numbers" · footer
Lock:    ◐ 136 ▲ Elevated   (inline)  ·  ● 136 ▲ Elevated / Go easy outdoors / 5pm · NEA  (rectangular)
```
- Verdict first. The band chip always has its label plus an SF Symbol shape (circle, half circle, triangle, octagon), so colour is never the only cue.
- The chart is in µg/m³ on both series, so the lag of the 24-hour average is visible without an invented index. There is no Instant PSI.
- Data comes from NEA v1 first (fresh about 1 minute after the hour) with v2 as fallback. Yesterday is cached on the device. The widget asks iOS to refresh at hh:02, or in 10 min if this hour's reading is late.
- Your location never leaves the phone. It only weights the five NEA stations. From Siri or Shortcuts, it returns the verdict plus share text.

## Test without a phone
```
node test/harness.mjs                     # Central
node test/harness.mjs "west,kids"         # area + profile
node test/harness.mjs "" 1.3521,103.8198  # simulated location
```
The harness mocks Scriptable's API (ListWidget, DrawContext, Request, FileManager, Location…), runs the real script against the live API, and prints every widget family as text.
