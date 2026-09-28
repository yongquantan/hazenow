#!/bin/sh
# Build and deploy HazeNow to Cloudflare Pages (the two projects already exist):
#   hazenow      → https://hazenow.pages.dev       (apps/site, incl. /download/)
#   hazenow-app  → https://hazenow-app.pages.dev   (apps/web, the PWA)
#
#   scripts/deploy-pages.sh            # both
#   scripts/deploy-pages.sh site       # only the site
#   scripts/deploy-pages.sh app        # only the web app
#
# Auth: `npx wrangler login` once, or CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) in the environment,
# e.g. in CI. The token needs "Account → Cloudflare Pages → Edit"; create it in the Cloudflare dashboard.
# wrangler runs from a temp directory OUTSIDE the npm workspace, because its auto-config fails inside it.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WHAT=${1:-both}
WRANGLER=${WRANGLER:-wrangler@4}

cd "$ROOT"
[ -d node_modules ] || npm ci

if [ "$WHAT" = both ] || [ "$WHAT" = app ]; then
  npm run build            # packages/core + apps/web → apps/web/dist
fi
if [ "$WHAT" = both ] || [ "$WHAT" = site ]; then
  npm run build --prefix apps/site   # → apps/site/dist
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
if [ "$WHAT" = both ] || [ "$WHAT" = app ]; then
  npx --yes "$WRANGLER" pages deploy "$ROOT/apps/web/dist" --project-name hazenow-app --branch main --commit-dirty=true
fi
if [ "$WHAT" = both ] || [ "$WHAT" = site ]; then
  npx --yes "$WRANGLER" pages deploy "$ROOT/apps/site/dist" --project-name hazenow --branch main --commit-dirty=true
fi
