#!/bin/sh
# Build the site at / and the web app at /app/ into one static folder: apps/site/out
# Usage (from the repo root): sh apps/site/scripts/bundle.sh
# Alternative to the default two-domain setup (see README). Env: HAZENOW_APP_BASE (use /app/), HAZENOW_SITE_URL (default https://hazenow.sg)
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
BASE=${HAZENOW_APP_BASE:-/app/}
OUT="$ROOT/apps/site/out"

(cd "$ROOT/apps/web" && npx tsc --noEmit && npx vite build --base="$BASE")
(cd "$ROOT/apps/site" && HAZENOW_APP_BASE="$BASE" npm run build)

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$ROOT/apps/site/dist/." "$OUT/"
mkdir -p "$OUT/${BASE#/}"
cp -R "$ROOT/apps/web/dist/." "$OUT/${BASE#/}"
echo "Static site ready: $OUT  (site at /, app at $BASE)"
