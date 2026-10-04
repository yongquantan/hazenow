# HazeNow iOS widget via Scriptable: no App Store wait

The fastest way to put HazeNow on an iPhone home screen or lock screen today. [Scriptable](https://scriptable.app) is a free App Store app that runs JavaScript widgets.

## Install (1 minute)
1. Install **Scriptable** from the App Store. It's free, and made by a third-party developer, not by HazeNow.
2. On the iPhone, open **https://hazenow.pages.dev/widget/HazeNow.scriptable** (the site's download page has an
   "Add the HazeNow widget" button), tap **Download**, then open it from Safari's downloads and choose
   **Open in Scriptable** (or Share → Scriptable). Scriptable imports it as a script named **HazeNow**.
   Fallback: open `HazeNow.js` (GitHub → Raw), copy it, then Scriptable → **+** → paste → name it **HazeNow**.
3. Home screen: long-press → **+** (or **Edit → Add Widget**) → Scriptable → pick Small, Medium or Large → Add →
   long-press the widget → **Edit Widget** → **Script: HazeNow**.
   Lock screen: long-press → Customize → Lock Screen → add a Scriptable widget (circular, rectangular or inline) → Script: HazeNow.
4. Optional **Parameter**, comma-separated: an area (any Singapore planning area or common name: `Tampines`,
   `Ang Mo Kio`, `CBD`, `Sentosa`; or a region `west`, `island`, …) and/or who you're checking for
   (`kids`, `elderly`, `pregnant`, `heart_lung`, `exercising`, `outdoor_worker`). Examples: `Tampines`, `west,kids`.
   Empty means your location if you allowed it in Scriptable, otherwise Singapore island (the average of NEA's stations).

`HazeNow.scriptable` is built from `HazeNow.js` by `make-scriptable.mjs`, in the format Scriptable itself writes when
it shares a script as a file (`always_run_in_app`, `icon {color, glyph}`, `name`, `script`, `share_sheet_inputs`).
The site serves it at `/widget/HazeNow.scriptable` as a download (`application/octet-stream`, attachment), and each
release attaches it as `HazeNow.scriptable`. `node test/check.mjs [file]` checks the format, that the script inside is
`HazeNow.js` byte for byte, and that the area table matches `packages/core`. Not yet verified on a real iPhone.

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
node test/harness.mjs                     # Singapore island
node test/harness.mjs "Tampines"          # one planning area
node test/harness.mjs "west,kids"         # area + profile
node test/harness.mjs "" 1.3521,103.8198  # simulated location
```
The harness mocks Scriptable's API (ListWidget, DrawContext, Request, FileManager, Location…), runs the real script against the live API, and prints every widget family as text.
