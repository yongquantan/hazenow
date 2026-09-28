# HazeNow in tmux, starship and any prompt

`hazenow-status.sh` is POSIX sh, needing only `curl` and `jq` (jq ships with macOS 15+). It prints NEA's 1-hr PM2.5 for your area
in the COPY §16 compact form `● 105 ▲` (dot, number, trend). It never shows "~", `-1`, `null` or `NaN`:
- an offline station falls back to the mean of the valid stations (SPEC §1);
- if the latest hour has no valid data at all, it walks back to the newest hour that has, and appends ` (old)` once that reading is more than 2 h 15 min old;
- with no usable data it prints `haze --`.

| `--format` | output (real, 28 Sep 2026 6pm) |
|---|---|
| `plain` (default) and `starship` | `● 138 ▶` |
| `tmux` | `#[fg=#E8A317]●#[default] 138 ▶` (dot in band colour) |
| `ansi` | `● 138 ▶` with a 24-bit colour dot, for bash/zsh prompts |
| `band` | `● 138 ▶ Elevated` |
| `emoji` | `🟠 138 ▶` |
| `long` | `● Go easy outdoors · PM2.5 138 Elevated ▶ · central · NEA via data.gov.sg` |
| `json` | `{"pm25":138,"band":"elevated",…,"stale":false}` |

`--region central|north|south|east|west|island` (or `HAZENOW_REGION`). It uses NEA v1 first, v2 as fallback, and caches for 2 min in `~/.cache/hazenow`.

## Install
```sh
mkdir -p ~/.local/bin && curl -fsSLo ~/.local/bin/hazenow-status.sh \
  https://raw.githubusercontent.com/hazenow/hazenow/main/integrations/shell/hazenow-status.sh && chmod +x ~/.local/bin/hazenow-status.sh
```

## tmux (one line in `~/.tmux.conf`)
```tmux
set -g status-right '#(~/.local/bin/hazenow-status.sh --format tmux --region central) | %H:%M'
```
The script caches, so tmux's default 15 s `status-interval` is fine.

No-script one-liner (Central, dot in band colour, no trend; set `status-interval 120`).
It follows the same SPEC fallback: Central offline → mean of the valid stations; nothing valid, no network or bad JSON → `haze --`. It never prints `-1`, `null` or `NaN`.
```tmux
set -g status-interval 120
set -g status-right '#(curl -fsA hazenow https://api.data.gov.sg/v1/environment/pm25 | jq -rn "(try input catch null) as \$d | (\$d.items[0].readings.pm25_one_hourly? // {}) as \$r | [\$r[] | select(type == \"number\" and . >= 0)] as \$ok | (if (\$r.central | type) == \"number\" and \$r.central >= 0 then \$r.central elif (\$ok | length) > 0 then (\$ok | add / length + 0.5 | floor) else null end) as \$v | if \$v == null then \"haze --\" else (if \$v <= 55 then \"#2E9E5B\" elif \$v <= 150 then \"#E8A317\" elif \$v <= 250 then \"#E4572E\" else \"#7B2D8E\" end) as \$c | \"#[fg=\(\$c)]●#[default] \(\$v | round)\" end" 2>/dev/null || echo "haze --") | %H:%M'
```

## starship (`~/.config/starship.toml`)
```toml
[custom.haze]
command = "~/.local/bin/hazenow-status.sh --format starship"   # → ● 138 ▶
when = "true"
shell = ["sh"]
format = "[$output]($style) "
style = "bold"
```
starship runs this on every prompt. The 2-minute cache keeps that cheap (about 20 ms warm).

## zsh / bash prompt
```sh
PROMPT='$(~/.local/bin/hazenow-status.sh --format ansi) '"$PROMPT"      # zsh (setopt PROMPT_SUBST)
```
