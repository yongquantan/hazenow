# HazeNow for Apple platforms

Your haze level **right now** (1-hr PM2.5 and the NEA band), alongside NEA's 24-hr PSI.
Implements [`SPEC.md`](../../SPEC.md) through v1.4 (experience & trust, COPY.md strings, data freshness, location), with
copy verbatim from [`docs/COPY.md`](../../docs/COPY.md). MIT. Data: NEA via data.gov.sg.

Instant PSI stays in the `Snapshot` model for JSON/API users but is never shown in UI, widgets, Live Activity,
share images or notifications (SPEC v1.2 §1).

| Piece | Path | What it does |
|---|---|---|
| **HazeKit** (Swift package) | `HazeKit/Sources/HazeKit` | SPEC computation (IDW, bands, trend, -1 handling, staleness), COPY.md verdicts/actions/trend/provenance/uncertainty (port of `packages/core/src/experience.ts`), band alerts (hysteresis, 3/day cap, all-clear, quiet hours + morning catch-up), `Snapshot` Codable model with the SPEC field names, async `HazeClient` (v1 primary + v2 back-fill merge, 429 backoff), v1.3 poll schedule, v1.4 places (bundled `sg-areas.json`, saved Home/Work), QA mock scenarios. Foundation only. |
| **HazeUI** (same package) | `HazeKit/Sources/HazeUI` | Shared SwiftUI: band colours and shapes, verdict header, big number, provenance, actions, the hourly-vs-24-hr PSI chart (Swift Charts), regions, profile picker, share card (`ImageRenderer` + `ShareLink`), `HazeStore` (polling, CoreLocation, notifications). |
| **macOS app** | `Mac/` | Menu bar agent (`LSUIElement`). `MenuBarExtra` label `● 105 ▲` with a band-tinted dot, a window-style popover, and an optional notch pill (see below). Also launch at login (`SMAppService`) and band-change notifications. |
| **iOS app** | `iOS/` | A single screen in SPEC v1.1 order, with location + IDW, profiles, share image, and the "Haze watch" Live Activity / Dynamic Island (local updates only). |
| **Widgets** | `Widgets/` | Shared by macOS and iOS: small, medium (short verdict, sparkline, Instant/official PSI) and large (lag chart and regions). On iOS there are also lock-screen circular gauge, rectangular and inline widgets, and the Live Activity UI. Timelines refresh about every 15 min. |
| **watchOS** | `Watch/` | A standalone watch app plus complications (circular, corner, rectangular, inline). |

## Requirements

- Xcode 26 or newer (tested with 26.3). The code targets iOS 17, macOS 14 and watchOS 10.
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`). `project.yml` is the source of truth. The generated `HazeNow.xcodeproj` is checked in for convenience.
- To build the iOS or watchOS targets with `xcodebuild`, Xcode 26 needs those platforms installed (Xcode > Settings > Components, or `xcodebuild -downloadPlatform iOS`).

## Build

```sh
cd apps/apple

# 1. Core logic + tests (every SPEC test vector, -1 handling, fixtures, v1.1 verdicts/hysteresis)
(cd HazeKit && swift test)

# 2. Regenerate the Xcode project after editing project.yml
xcodegen generate

# 3. macOS menu bar app, unsigned (embeds the widget extension)
xcodebuild -project HazeNow.xcodeproj -scheme HazeNowMac -destination 'platform=macOS' \
  -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO build
open build/dd/Build/Products/Debug/HazeNow.app

# 4. iOS app + widgets for the simulator, unsigned
xcodebuild -project HazeNow.xcodeproj -scheme HazeNowiOS -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/dd-ios CODE_SIGNING_ALLOWED=NO build

# 5. watchOS (needs the watchOS platform component)
xcodebuild -project HazeNow.xcodeproj -scheme HazeNowWatch -destination 'generic/platform=watchOS Simulator' \
  -derivedDataPath build/dd-watch CODE_SIGNING_ALLOWED=NO build
```

**Debug aids (macOS):** `HAZENOW_DEBUG_NOTCH_CYCLE=1` expands/collapses the notch pill 40× and
`HAZENOW_DEBUG_POPOVER_CYCLE=1` clicks the status item 20× (stress tests for the layout-loop fix below). Launch the binary with `HAZENOW_DEBUG_DIR=/some/dir`. Each new snapshot then writes
`snapshot.json`, `menubar.txt` and PNG renders of the menu bar label, the popover and the notch pill. This is handy
when you can't grant Screen Recording permission for screenshots.

### Unsigned builds: what works

- **macOS app:** runs fine unsigned (the linker ad-hoc signs it). Entitlements aren't applied, so the app runs without
  a sandbox and without an App Group. `HazeSettings` detects the missing App Group and uses standard defaults.
  CoreLocation may refuse an unsigned app. If it does, the app falls back to your chosen region and says so.
  `SMAppService` launch at login needs a signed app, and the toggle shows the error otherwise.
- **Widget extensions** compile and embed unsigned, but macOS/iOS only *load* widgets from a signed app with the
  App Group entitlement. To see widgets in the gallery, sign the build (next section).
- **Live Activities** need a signed iOS build running on a device or simulator.

## The notch pill (macOS)

On a MacBook with a notch, HazeNow can show a small black pill that continues the notch. The band icon sits on the
left "ear" and `105 ▲` on the right. Hover for about 150 ms and it grows down out of the notch into the full popover
content. Move away and it collapses. How it works:

- The notch geometry comes from `NSScreen.safeAreaInsets.top` (height) and
  `frame.width − auxiliaryTopLeftArea.width − auxiliaryTopRightArea.width` (width).
- The pill is a borderless, non-activating `NSPanel` at `.mainMenu + 3` that joins all Spaces and is
  full-screen auxiliary. While collapsed it ignores mouse events, so clicks pass through its transparent area.
- To turn it on or off, go to Settings (gear) > **Show beside the notch**. On displays with no notch the panel isn't
  shown and HazeNow stays in the menu bar. Screen changes (lid closed, external display) are handled via
  `didChangeScreenParametersNotification`.
- It's especially useful when a crowded menu bar hides status items behind the notch, since macOS silently
  drops status items that don't fit. On the dev Mac the status item was created (68×33) but parked off-screen by the
  OS for lack of room.
- The panel keeps a fixed frame and never resizes (see "macOS notch crash" below). Hover is detected by mouse-moved
  monitors.

## Data freshness (SPEC v1.3)

- v1 `api.data.gov.sg/v1/environment/{pm25,psi}` is the fresh primary (published ~1 min after the hour);
  v2 back-fills. Merge per hour and region: v2 value if valid, else v1; `publishedAt` = v1 `update_timestamp`.
- App polling: from hh:00:30 every 60 s (v1 only) until the new hour appears (stop at hh:10); one v2 call at ~hh:35 and
  ~hh:50; idle otherwise. 429/network errors back off 30 s → 10 min, honouring `Retry-After`. Widgets ask for hh:02.

## QA: deterministic mock mode

`-HazeMock <scenario>` (read through the UserDefaults argument domain) replaces the network with bundled fixtures
(`HazeKit/Sources/HazeKit/Resources/Scenarios`, copied from `packages/core/fixtures/scenarios`, raw NEA shape) and uses
the scenario's fixed clock. The app writes it to the App Group defaults so widgets render the same scenario, shows a
**MOCK DATA** badge, skips first-run onboarding and sends no notifications. `-HazeMock off` returns to live data.

Scenarios: `normal`, `elevated`, `high`, `very_high`, `south_offline` (south = -1), `all_offline_stale`, `rising_fast`
(+25 in 1 h), `network_error`.

### Simulator commands

Bundle IDs: iOS app `sg.hazenow.ios`, iOS widgets `sg.hazenow.ios.widgets`, macOS app `sg.hazenow.mac`,
macOS widgets `sg.hazenow.mac.widgets`, watch `sg.hazenow.watch`.

```sh
cd apps/apple
xcodebuild -project HazeNow.xcodeproj -scheme HazeNowiOS -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/dd-ios CODE_SIGNING_ALLOWED=NO build
xcrun simctl boot "iPhone 17 Pro"                     # or a UDID from `xcrun simctl list devices`
open -a Simulator
xcrun simctl install booted build/dd-ios/Build/Products/Debug-iphonesimulator/HazeNow.app
xcrun simctl launch booted sg.hazenow.ios -HazeMock high          # any scenario above
xcrun simctl launch booted sg.hazenow.ios -HazeMock off           # back to live data
xcrun simctl io booted screenshot high.png

# Location: pick "Use my location" in the app, then
xcrun simctl privacy booted grant location sg.hazenow.ios          # skip the prompt
xcrun simctl location booted set 1.3521,103.8198                   # central Singapore
xcrun simctl location booted set 1.3526,103.9447                   # Tampines (East)
xcrun simctl location booted clear
xcrun simctl privacy booted revoke location sg.hazenow.ios         # test the denied chip

# macOS app with a mock scenario
build/dd/Build/Products/Debug/HazeNow.app/Contents/MacOS/HazeNow -HazeMock very_high
```

**Widgets:** long-press the Home Screen → Edit → Add Widget → HazeNow (small/medium/large); Lock Screen → Customize →
add the circular/rectangular/inline widget. Long-press a widget → Edit Widget → **Place** to pin Home, Work/School, an
NEA station or the island average. Widgets only load from a **signed** build with the App Group, since unsigned
simulator builds install the extension but the widget can't share settings. In mock mode each widget fetches the
scenario itself.

**Live Activity ("Haze watch"):** scroll to the Haze watch card and toggle it on. The activity shows on the Lock Screen
(⌘L in Simulator) and in the Dynamic Island on iPhone 14 Pro or later simulators. It updates locally on each new
reading. Live Activities also require a signed build with `NSSupportsLiveActivities` (set).

## Location (SPEC v1.4)

First run offers **Use my location** (a one-line explainer appears before the OS prompt; when-in-use only, reduced
accuracy is fine) or **Pick my area** (an offline search of the 55 URA planning areas plus estate aliases from
`packages/core/data/sg-areas.json`, bundled). Home, Work/School and one more place can be saved. Coordinates are
rounded to 2 decimals before storing. If location is denied, the app falls back quietly to the island view and never
re-prompts. A small "Use my location" chip deep-links to Settings instead.

## macOS notch crash (fixed)

The first debug builds crashed at launch or on hover with `NSGenericException` "…more Update Constraints in Window
passes than there are views in the window" on `NotchPanel`. **Cause:** the SwiftUI `NSHostingView` was the panel's
`contentView`. The panel was resized with `setFrame` on hover while SwiftUI animated its own frame, so hosting-view
sizing and window size fed back into each other during a display-cycle constraint pass (the panel was seen at a
content-driven 400×608). **Fix:** the panel now has one fixed frame for its whole life. The hosting view is a plain
autoresizing subview with `sizingOptions = []`. Only the SwiftUI shape inside animates between pill and expanded.
While collapsed the panel ignores mouse events, and hover comes from mouse-moved monitors rather than tracking areas.
The popover also has a fixed size.

## Brand assets

The app icons come from `brand/png`. iOS uses the single-size 1024 with dark and tinted variants; the tinted variant is
a grayscale mark on transparent, generated from `brand/svg/app-icon.svg`. macOS uses `macos-16…1024` in every
@1x/@2x slot. The menu bar shows the live `● 105 ▲`, with the template mark only while loading. Widget and Live
Activity headers draw the small mark with a band-tinted dot (`#B06BC4` for Very High on dark).

## Signing & distribution

Set your team once in `project.yml` (`DEVELOPMENT_TEAM`) and run `xcodegen generate`, or pick the team in Xcode for
all six targets.

**App Group.** Create `group.sg.hazenow` in the developer portal (or rename it in `project.yml` and in
`HazeSettings.appGroup`). The apps and widgets share settings, the profile and the last snapshot through it.
On macOS outside the App Store you can also use a team-prefixed group (`TEAMID.sg.hazenow`).

### macOS: notarized DMG on GitHub Releases

```sh
# Archive + export with Developer ID
xcodebuild -project HazeNow.xcodeproj -scheme HazeNowMac -configuration Release \
  -archivePath build/HazeNow.xcarchive archive DEVELOPMENT_TEAM=TEAMID
cat > build/export.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>method</key><string>developer-id</string><key>teamID</key><string>TEAMID</string></dict></plist>
EOF
xcodebuild -exportArchive -archivePath build/HazeNow.xcarchive -exportOptionsPlist build/export.plist -exportPath build/export

# DMG, notarize, staple
hdiutil create -volname HazeNow -srcfolder build/export/HazeNow.app -ov -format UDZO build/HazeNow.dmg
codesign --sign "Developer ID Application: YOUR NAME (TEAMID)" build/HazeNow.dmg
xcrun notarytool submit build/HazeNow.dmg --keychain-profile hazenow-notary --wait
xcrun stapler staple build/HazeNow.dmg

# Publish
gh release create v1.0.0 build/HazeNow.dmg --title "HazeNow 1.0.0" --notes "…"
```

Create the notary profile once with
`xcrun notarytool store-credentials hazenow-notary --apple-id you@example.com --team-id TEAMID`
(use an app-specific password). Hardened Runtime is already enabled. In CI (GitHub Actions `macos-26`), import the
Developer ID certificate into a temporary keychain and use an App Store Connect API key (`notarytool --key`).

### Homebrew cask

After a notarized release exists, submit a cask to `homebrew/cask` (or a tap such as `hazenow/homebrew-tap`):

```ruby
cask "hazenow" do
  version "1.0.0"
  sha256 "<shasum -a 256 HazeNow.dmg>"

  url "https://github.com/<org>/hazenow/releases/download/v#{version}/HazeNow.dmg"
  name "HazeNow"
  desc "Singapore haze right now: 1-hr PM2.5 and Instant PSI in the menu bar"
  homepage "https://github.com/<org>/hazenow"

  depends_on macos: ">= :sonoma"

  app "HazeNow.app"

  zap trash: [
    "~/Library/Preferences/sg.hazenow.mac.plist",
    "~/Library/Group Containers/group.sg.hazenow",
    "~/Library/Containers/sg.hazenow.mac",
    "~/Library/Containers/sg.hazenow.mac.widgets",
  ]
end
```

### App Store notes

- **macOS:** the app and widget are already sandboxed (`app-sandbox`, `network.client`, `personal-information.location`,
  App Group). Remove the `HAZENOW_DEBUG_DIR` aid if review objects. A menu-bar-only app is fine, but the notch pill
  must stay optional (it is, and it's off-screen safe). Category: Weather.
- **iOS:** needs `NSSupportsLiveActivities` (set), the location usage string (set) and the App Group. There's no push
  server: the Live Activity is updated locally while the app runs or refreshes. For background updates add
  `BGAppRefreshTask` or an ActivityKit push service later.
- **Privacy nutrition label:** no data collected. Location is used on device only and never transmitted. The only
  network calls are to `api-open.data.gov.sg`.
- **Review note:** say that the figures are NEA's public data, that Instant PSI is clearly labelled as an estimate
  and not an official figure, and that the app is not affiliated with NEA.
- **watchOS:** `WKWatchOnly` (independent) keeps the iOS build free of a watchOS dependency. Switch to a companion
  (`WKCompanionAppBundleIdentifier`) if you want them bundled together.

## Layout

```
apps/apple/
├── project.yml              XcodeGen spec (source of truth)
├── HazeNow.xcodeproj        generated
├── HazeKit/                 Swift package: HazeKit (logic) + HazeUI (SwiftUI) + tests
├── Mac/                     menu bar app, popover, notch panel, launch at login
├── iOS/                     single-screen app, Haze watch (Live Activity)
├── Widgets/                 WidgetKit (macOS + iOS) + Live Activity UI
├── Shared/                  ActivityKit attributes (iOS app + widget)
└── Watch/                   watchOS app + complications
```
