#!/bin/sh
# HazeNow status line for tmux / starship / any prompt. MIT licensed.
# Needs: curl + jq (jq ships with macOS 15+; `apt install jq` elsewhere).
#
#   hazenow-status.sh [--region central|north|south|east|west|island] [--format tmux|plain|starship|band|json|long]
#
# Prints e.g. `● 105 ▲` (tmux: dot coloured by band). Uses NEA's v1 API (fresh ~1 min after the
# hour, no observed rate limit), v2 only as a fallback, and caches 2 min so a tmux status-interval
# of 15 s never hammers data.gov.sg. Data: NEA via data.gov.sg. The number is NEA's 1-hr PM2.5 (µg/m³).

REGION="${HAZENOW_REGION:-central}"
FORMAT="plain"
while [ $# -gt 0 ]; do
  case "$1" in
    --region) REGION="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) shift ;;
  esac
done

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/hazenow"
CACHE="$CACHE_DIR/pm25-today.json"
TTL=120
API_V1="https://api.data.gov.sg/v1/environment/pm25"
API_V2="https://api-open.data.gov.sg/v2/real-time/api/pm25"
mkdir -p "$CACHE_DIR" 2>/dev/null

fresh() {
  [ -s "$CACHE" ] || return 1
  now=$(date +%s)
  mtime=$(stat -f %m "$CACHE" 2>/dev/null || stat -c %Y "$CACHE" 2>/dev/null || echo 0)
  [ $((now - mtime)) -lt "$TTL" ]
}

if ! fresh; then
  today=$(TZ=Asia/Singapore date +%Y-%m-%d)
  tmp="$CACHE.$$"
  # Today's hourly readings (for the trend). v1 first; v2 (rate-limited) only if v1 fails.
  # Both are normalised to {items:[{timestamp, readings}]}; just after midnight fall back to "latest".
  if curl -fsS -m 8 -A "HazeNow-shell/0.2" "$API_V1?date=$today" 2>/dev/null |
       jq -e '{items: .items} | select((.items | length) > 0)' > "$tmp" 2>/dev/null ||
     curl -fsS -m 8 -A "HazeNow-shell/0.2" "$API_V1" 2>/dev/null |
       jq -e '{items: .items} | select((.items | length) > 0)' > "$tmp" 2>/dev/null ||
     curl -fsS -m 8 -A "HazeNow-shell/0.2" "$API_V2" 2>/dev/null |
       jq -e 'select(.code == 0) | {items: .data.items}' > "$tmp" 2>/dev/null; then
    mv "$tmp" "$CACHE"
  else
    rm -f "$tmp"
    touch "$CACHE" 2>/dev/null # back off for one TTL; show stale cache if any
  fi
fi

[ -s "$CACHE" ] || { echo "haze --"; exit 0; }

jq -r --arg region "$REGION" --arg fmt "$FORMAT" '
  def valid: type == "number" and . >= 0;
  def rhu: . + 0.5 | floor;
  def spot($r): .readings.pm25_one_hourly as $x
    | if ($x[$r] | valid) then ($x[$r] | rhu)
      else [$x[] | select(valid)] | if length > 0 then (add / length | rhu) else null end end;
  def band: if . <= 55 then "normal" elif . <= 150 then "elevated" elif . <= 250 then "high" else "very_high" end;
  def ipsi: . as $c
    | [[0,12,0,50],[12,55,50,100],[55,150,100,200],[150,250,200,300],[250,350,300,400],[350,500,400,500]]
    | map(select($c <= .[1])) | if length == 0 then 500
      else .[0] as $b | ($b[2] + ($c - $b[0]) * ($b[3] - $b[2]) / ($b[1] - $b[0]) | rhu) | if . > 500 then 500 else . end end;
  {normal: "#2E9E5B", elevated: "#E8A317", high: "#E4572E", very_high: "#7B2D8E"} as $color
  | {normal: "🟢", elevated: "🟠", high: "🔴", very_high: "🟣"} as $emoji
  | {normal: "Fine to be out", elevated: "Go easy outdoors", high: "No outdoor exercise", very_high: "Stay indoors for now"} as $verdict
  | {normal: "Normal", elevated: "Elevated", high: "High", very_high: "Very High"} as $label
  | [.items | sort_by(.timestamp) | reverse | .[] | select(spot($region) != null)] as $items
  | if ($items | length) == 0 then "haze --" else
    ($items[0] | spot($region)) as $v
    | (if ($items | length) > 1 then $v - ($items[1] | spot($region)) else 0 end) as $d
    | (if $d >= 5 then "▲" elif $d <= -5 then "▼" else "▶" end) as $arrow
    | ($v | band) as $b
    | if $fmt == "tmux" then "#[fg=\($color[$b])]●#[default] \($v) \($arrow)"
      elif $fmt == "starship" then "\($emoji[$b]) \($v)\($arrow)"
      elif $fmt == "band" then "● \($v) \($arrow) \($label[$b])"
      elif $fmt == "long" then "\($emoji[$b]) \($verdict[$b]) · PM2.5 \($v) \($label[$b]) \($arrow) · \($region) · NEA via data.gov.sg"
      elif $fmt == "json" then {pm25: $v, band: $b, instantPsi: ($v | ipsi), delta: $d, region: $region, observedAt: $items[0].timestamp} | tojson
      else "\($emoji[$b]) \($v) \($arrow)" end
    end
' "$CACHE" 2>/dev/null || echo "haze --"
