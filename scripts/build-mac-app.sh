#!/bin/sh
# Build the HazeNow menu bar app for release, ad-hoc signed, and zip it as HazeNow-mac.zip.
# Used by .github/workflows/release.yml and scripts/release-mac-local.sh.
#
#   sh scripts/build-mac-app.sh <version> <build-number> <out-dir>
#
# Ad-hoc signing (CODE_SIGN_IDENTITY=-) needs no Apple Developer account. Entitlements are dropped, as in
# apps/apple/README.md ("Unsigned builds: what works"): no App Group, no sandbox; widgets won't load until the app is
# Developer ID signed. Users open it once via System Settings → Privacy & Security → Open Anyway.
set -eu
VERSION=${1:?version, e.g. 0.3.0}
BUILD=${2:?build number, e.g. 30099}
OUT=${3:-out}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
WORK=$(mktemp -d)
APPLE="$ROOT/apps/apple"
PLISTS="$APPLE/Mac/Info.plist $APPLE/Widgets/Info-macOS.plist"

# The Info.plists hard-code the version, so stamp this release's version in for the build and put them back after.
for p in $PLISTS; do cp "$p" "$WORK/$(basename "$p").orig"; done
restore() { for p in $PLISTS; do cp "$WORK/$(basename "$p").orig" "$p"; done; }
trap restore EXIT
for p in $PLISTS; do
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $BUILD" "$p"
done

xcodebuild -project "$APPLE/HazeNow.xcodeproj" -scheme HazeNowMac -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath "$WORK/dd" \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= CODE_SIGN_ENTITLEMENTS= \
  CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO \
  build -quiet

APP="$WORK/dd/Build/Products/Release/HazeNow.app"
codesign --verify --deep --strict "$APP"
codesign -dv "$APP" 2>&1 | grep -E 'Signature|Identifier='
lipo -archs "$APP/Contents/MacOS/HazeNow"
mkdir -p "$OUT"
rm -f "$OUT/HazeNow-mac.zip"
ditto -c -k --keepParent "$APP" "$OUT/HazeNow-mac.zip"
ls -l "$OUT/HazeNow-mac.zip"
