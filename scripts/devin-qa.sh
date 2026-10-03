#!/usr/bin/env bash
# Launch one recorded Devin QA session per surface, each on its own VM.
# Local machine (Claude Code) is the manager: it launches, polls and aggregates.
#
#   scripts/devin-qa.sh launch [ios|macos|android|web ...]   # default: all four
#   scripts/devin-qa.sh status  SESSION_ID
#   scripts/devin-qa.sh report  SESSION_ID                   # structured output JSON
#
# Env: DEVIN_API_KEY (cog_*), DEVIN_ORG_ID. Optional: REPO (owner/name), BRANCH, MAX_ACU (default 40).
set -euo pipefail

API="${DEVIN_API_URL:-https://api.devin.ai}/v3/organizations/${DEVIN_ORG_ID:?DEVIN_ORG_ID not set}"
: "${DEVIN_API_KEY:?DEVIN_API_KEY not set}"
REPO="${REPO:-$(git remote get-url origin | sed -E 's#^(ssh://)?git@[^:/]+[:/]##; s#^https?://[^/]+/##; s/\.git$//')}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
MAX_ACU="${MAX_ACU:-40}"
RUN_TAG="qa-$(date +%Y%m%d-%H%M)"
LOG_DIR="$(dirname "$0")/../.qa-runs"; mkdir -p "$LOG_DIR"

api() { curl -sS -f -X "$1" -H "Authorization: Bearer $DEVIN_API_KEY" -H "Content-Type: application/json" ${3:+-d "$3"} "$API$2"; }

SCHEMA='{
  "type":"object","additionalProperties":false,
  "required":["surface","build_ok","tests","scenarios","bugs","recordings","summary"],
  "properties":{
    "surface":{"type":"string"},
    "build_ok":{"type":"boolean"},
    "build_notes":{"type":"string"},
    "tests":{"type":"object","properties":{"command":{"type":"string"},"passed":{"type":"integer"},"failed":{"type":"integer"},"notes":{"type":"string"}}},
    "scenarios":{"type":"array","items":{"type":"object","required":["id","status"],"properties":{
      "id":{"type":"string"},"status":{"enum":["pass","fail","blocked","n/a"]},"notes":{"type":"string"}}}},
    "bugs":{"type":"array","items":{"type":"object","required":["title","severity","repro","expected","actual"],"properties":{
      "title":{"type":"string"},"severity":{"enum":["P0","P1","P2","P3"]},"scenario":{"type":"string"},
      "repro":{"type":"string"},"expected":{"type":"string"},"actual":{"type":"string"},"file_hint":{"type":"string"}}}},
    "recordings":{"type":"array","items":{"type":"string"},"description":"What each recording shows, in order"},
    "code_changes":{"type":"string","description":"Any change made to unblock build; empty if none"},
    "summary":{"type":"string"}
  }}'

surface_prompt() {
  local name="$1" section="$2"
  cat <<EOF
You are the QA tester for the **$name** surface of HazeNow (repo $REPO, branch $BRANCH).
HazeNow shows each Southeast Asian authority's 1-hr PM2.5 "right now" with calm, trustworthy guidance. Live: site https://hazenow.pages.dev, app https://hazenow-app.pages.dev, data server https://hazenow-data.yongquan26.workers.dev. This is QA round 2: also re-verify every round-1 bug listed in docs/qa/round-1-bugs.md and the 'Round 2 additions' in docs/QA_MATRIX.md.

Read, in order: docs/QA_MATRIX.md (your section is **$section**, plus the shared Scenarios table), SPEC.md (later amendments win, through v2.1), docs/COPY.md (exact expected strings), then the README for your surface.

Do:
1. Build from a clean checkout. Run the unit tests.
2. Start a screen recording. Walk every applicable scenario S1–S16 and every item in section $section, using the mock mode. Annotate each checkpoint with the scenario id. Keep recordings short: split into several if needed.
3. For every failure, file a bug in the structured output with exact repro, expected (quote SPEC/COPY), actual, and a file hint.
4. Send me the recordings in the session, then provide the structured output with is_final=true.

Rules: don't open a PR, don't push. Only change product code if it's strictly needed to get a build running, and describe it in code_changes. If something is impossible on this VM (e.g. no notch hardware), mark the scenario "blocked" with the reason; don't fake it.
EOF
}

launch_one() {
  local key="$1" name section platform
  case "$key" in
    ios)     name="iOS app + widgets + Live Activity"; section="A"; platform="macos" ;;
    macos)   name="macOS menu bar/notch app + desktop widgets + Mac integrations"; section="B"; platform="macos" ;;
    android) name="Android app + widgets + tile + notifications"; section="C"; platform="" ;;
    web)     name="Web PWA + core/CLI + services"; section="D"; platform="" ;;
    *) echo "unknown surface $key" >&2; return 1 ;;
  esac
  local body
  body=$(jq -n --arg p "$(surface_prompt "$name" "$section")" --arg t "HazeNow QA · $name" \
    --arg repo "$REPO" --arg plat "$platform" --argjson acu "$MAX_ACU" --argjson schema "$SCHEMA" \
    --arg tag "$RUN_TAG" --arg skey "qa-$key" \
    '{prompt:$p,title:$t,repos:[$repo],max_acu_limit:$acu,tags:["handoff","hazenow",$tag,$skey],
      structured_output_schema:$schema,structured_output_required:true}
     + (if $plat=="" then {} else {platform:$plat} end)')
  local res; res=$(api POST /sessions "$body")
  local id url; id=$(jq -r .session_id <<<"$res"); url=$(jq -r .url <<<"$res")
  echo "$key $id $url" | tee -a "$LOG_DIR/$RUN_TAG.txt"
}

case "${1:-}" in
  launch) shift; for s in "${@:-ios macos android web}"; do for k in $s; do launch_one "$k"; done; done ;;
  status) api GET "/sessions/$2" | jq '{status,status_detail,acus_consumed,url,pull_requests}' ;;
  report) api GET "/sessions/$2" | jq .structured_output ;;
  *) sed -n '2,9p' "$0" ;;
esac
