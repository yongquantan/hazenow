#!/bin/sh
# Fallback for when the macOS job in release.yml is skipped or fails: build HazeNow-mac.zip on this Mac
# and upload it to an existing GitHub release, updating SHA256SUMS.txt too.
#
#   scripts/release-mac-local.sh [tag]      # default: the newest release (including prereleases)
#
# Needs Xcode 26+ and an authenticated `gh`. RELEASE_REPO overrides where the release lives
# (default: yongquantan/hazenow; set it to yongquantan/hazenow-releases if releases move there).
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO=${RELEASE_REPO:-yongquantan/hazenow}
TAG=${1:-$(gh release list --repo "$REPO" --limit 1 --json tagName -q '.[0].tagName')}
[ -n "$TAG" ] || { echo "No release found in $REPO" >&2; exit 1; }
VERSION=${TAG#v}
# Same versionCode scheme as release.yml: X.Y.Z-rcN → X*1e6 + Y*1e4 + Z*100 + N (final = 99).
BUILD=$(echo "$VERSION" | awk -F'[.-]' '{ n = 99; if ($4 ~ /^rc\.?[0-9]+$/) { n = $4; sub(/^rc\.?/, "", n) } else if ($4 != "") n = 50; print $1*1000000 + $2*10000 + $3*100 + n }')
OUT=$(mktemp -d)

echo "Building HazeNow $VERSION ($BUILD) for $REPO $TAG"
sh "$ROOT/scripts/build-mac-app.sh" "$VERSION" "$BUILD" "$OUT"

cd "$OUT"
gh release download "$TAG" --repo "$REPO" --pattern SHA256SUMS.txt --clobber 2>/dev/null || touch SHA256SUMS.txt
grep -v ' HazeNow-mac.zip$' SHA256SUMS.txt > sums.tmp || true
shasum -a 256 HazeNow-mac.zip >> sums.tmp
sort -k2 sums.tmp > SHA256SUMS.txt
cat SHA256SUMS.txt
gh release upload "$TAG" --repo "$REPO" --clobber HazeNow-mac.zip SHA256SUMS.txt
echo "Uploaded to $(gh release view "$TAG" --repo "$REPO" --json url -q .url)"
