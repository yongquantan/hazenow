#!/bin/sh
# HazeNow usage, in total only (README, "Usage counts"). Nothing here identifies anyone: every number is a count.
#
#   scripts/stats.sh            # last 30 days
#   scripts/stats.sh 7          # last 7 days
#
# 1. Downloads per release asset   GitHub Releases API (download_count), via `gh` if logged in, else anonymous curl
# 2. Web visits                    Cloudflare GraphQL Analytics (Web Analytics / RUM) for both Pages hosts
# 3. Data server requests          the Worker's GET /v1/stats, daily totals by country and endpoint
# 4. Share-card landings           same endpoint, by card
#
# Needs: curl, jq. Tokens (never in the repo):
#   ~/.config/hazenow/stats-token.txt  bearer token for /v1/stats (same value as the Worker secret STATS_TOKEN)
#   CLOUDFLARE_API_TOKEN (Account Analytics: Read), or wrangler's OAuth login (`npx wrangler login`), for visits
set -eu
DAYS=${1:-30}
REPO=${HAZENOW_RELEASES_REPO:-yongquantan/hazenow}
WORKER=${HAZENOW_WORKER_URL:-https://hazenow-data.yongquan26.workers.dev}
ACCOUNT=${CLOUDFLARE_ACCOUNT_ID:-cd79508c2b4a1c05d7b63f4646ceb1a5}
HOSTS='["hazenow.pages.dev","hazenow-app.pages.dev"]'
TOKEN_FILE=${HAZENOW_STATS_TOKEN_FILE:-$HOME/.config/hazenow/stats-token.txt}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

command -v jq >/dev/null || { echo "stats.sh needs jq (brew install jq)" >&2; exit 1; }
SINCE=$(date -u -v-"$((DAYS - 1))"d +%F 2>/dev/null || date -u -d "$((DAYS - 1)) days ago" +%F)
TODAY=$(date -u +%F)
echo "HazeNow usage, $SINCE to $TODAY (UTC), totals only"

# ------------------------------------------------------------------ 1. downloads
echo
echo "== Downloads (GitHub Releases, all time) =="
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  releases=$(gh api --paginate "repos/$REPO/releases?per_page=100" \
    --jq '.[] | {tag_name, draft, prerelease, published_at, assets: [.assets[] | {name, download_count}]}' | jq -s .)
else
  releases=$(curl -fsS "https://api.github.com/repos/$REPO/releases?per_page=100" | tr -d '\000-\010\013\014\016-\037' \
    | jq '[.[] | {tag_name, draft, prerelease, published_at, assets: [.assets[] | {name, download_count}]}]')
fi
echo "$releases" | jq -r '
  (map(select(.draft | not)) | sort_by(.published_at) | reverse) as $rs
  | ($rs[] | "\(.tag_name)\(if .prerelease then " (prerelease)" else "" end): \([.assets[].download_count] | add // 0)",
             (.assets | sort_by(-.download_count)[] | "  \(.download_count | tostring | (" " * (6 - length)) + .)  \(.name)")),
    "All releases: \([$rs[].assets[].download_count] | add // 0)",
    "By file, all releases:",
    ([$rs[].assets[]] | group_by(.name) | map({name: .[0].name, n: (map(.download_count) | add)}) | sort_by(-.n)[]
      | "  \(.n | tostring | (" " * (6 - length)) + .)  \(.name)")'

# ------------------------------------------------------------------ 2. web visits
echo
echo "== Web visits (Cloudflare Web Analytics) =="
CF_TOKEN=${CLOUDFLARE_API_TOKEN:-}
if [ -z "$CF_TOKEN" ]; then
  # wrangler's OAuth token; running wrangler first refreshes it if it expired.
  (cd "$ROOT/services/worker" && npx --no-install wrangler whoami >/dev/null 2>&1) || true
  for f in "$HOME/Library/Preferences/.wrangler/config/default.toml" "${XDG_CONFIG_HOME:-$HOME/.config}/.wrangler/config/default.toml" "$HOME/.wrangler/config/default.toml"; do
    [ -f "$f" ] && CF_TOKEN=$(sed -n 's/^oauth_token *= *"\(.*\)"$/\1/p' "$f") && [ -n "$CF_TOKEN" ] && break
  done
fi
if [ -z "$CF_TOKEN" ]; then
  echo "No Cloudflare token: see the dashboard (Workers & Pages → project → Metrics → Web Analytics)."
else
  q=$(jq -n --arg a "$ACCOUNT" --arg s "$SINCE" --argjson h "$HOSTS" '{
    query: "query($a: String!, $s: Date!, $h: [String!]) { viewer { accounts(filter: {accountTag: $a}) {
      rumPageloadEventsAdaptiveGroups(limit: 5000, filter: {date_geq: $s, requestHost_in: $h}, orderBy: [date_ASC]) {
        count sum { visits } dimensions { date requestHost } } } } }",
    variables: {a: $a, s: $s, h: $h}}')
  r=$(curl -fsS -X POST https://api.cloudflare.com/client/v4/graphql -H "Authorization: Bearer $CF_TOKEN" -H "content-type: application/json" -d "$q" || echo '{"errors":[{"message":"request failed"}]}')
  if [ "$(echo "$r" | jq '.errors | length // 0')" != 0 ] || [ "$(echo "$r" | jq '.data.viewer.accounts | length')" = 0 ]; then
    echo "Not readable with this token ($(echo "$r" | jq -r '.errors[0].message // "no account"')): see the dashboard."
  else
    echo "$r" | jq -r --argjson h "$HOSTS" '.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups as $g
      | if ($g | length) == 0 then "No visits recorded. If Web Analytics isn'\''t enabled on the Pages projects yet, enable it: Workers & Pages → project → Metrics → Web Analytics → Enable."
        else ($h[] as $host | ($g | map(select(.dimensions.requestHost == $host))) as $x
          | "\($host): \([$x[].sum.visits] | add // 0) visits, \([$x[].count] | add // 0) page views",
            ($x[] | "  \(.dimensions.date)  \(.sum.visits) visits, \(.count) views")) end'
  fi
fi

# ------------------------------------------------------------------ 3 + 4. Worker counters
echo
echo "== Data server requests (/v1/*, by day and country) =="
if [ ! -r "$TOKEN_FILE" ]; then
  echo "No $TOKEN_FILE: can't read $WORKER/v1/stats."
  exit 0
fi
s=$(curl -fsS -H "Authorization: Bearer $(tr -d '\n' < "$TOKEN_FILE")" "$WORKER/v1/stats?days=$DAYS") || { echo "GET /v1/stats failed."; exit 0; }
fmt='to_entries | sort_by(-.value) | map("\(.key) \(.value)") | join(", ")'
echo "$s" | jq -r "\"Total: \(.totals.requests)\",
  (.usage[] | \"  \(.day)  \(.total | tostring | (\" \" * (6 - length)) + .)   \(.countries | $fmt)\"),
  \"By endpoint: \([.usage[].endpoints | to_entries[]] | group_by(.key) | map({key: .[0].key, value: (map(.value) | add)}) | from_entries | $fmt)\""
echo
echo "== Share-card landings (?s=<card>) =="
echo "$s" | jq -r "\"Total: \(.totals.shareLandings)\",
  (.shareLandings[] | \"  \(.day)  \(.total | tostring | (\" \" * (4 - length)) + .)   cards: \(.cards | $fmt)   countries: \(.countries | $fmt)\"),
  \"By card: \([.shareLandings[].cards | to_entries[]] | group_by(.key) | map({key: .[0].key, value: (map(.value) | add)}) | from_entries | $fmt)\""
