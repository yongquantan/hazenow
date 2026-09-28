# HazeNow in tmux, starship and any prompt

`hazenow-status.sh` is POSIX sh, needing only `curl` and `jq` (jq ships with macOS 15+). It prints NEA's 1-hr PM2.5 for your area:

| `--format` | output (real, 28 Sep 2026 5pm) |
|---|---|
| `plain` (default) | `🟠 137 ▲` |
| `tmux` | `#[fg=#E8A317]●#[default] 137 ▲` |
| `starship` | `🟠 137▲` |
| `band` | `● 137 ▲ Elevated` |
| `long` | `🟠 Go easy outdoors · PM2.5 137 Elevated ▲ · central · NEA via data.gov.sg` |
| `json` | `{"pm25":137,"band":"elevated",…}` |

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

No-script one-liner (Central, number only, so set `status-interval 120`):
```tmux
set -g status-right 'PM2.5 #(curl -fsA hazenow https://api.data.gov.sg/v1/environment/pm25 | jq -r .items[0].readings.pm25_one_hourly.central) | %H:%M'
```

## starship (`~/.config/starship.toml`)
```toml
[custom.haze]
command = "~/.local/bin/hazenow-status.sh --format starship"
when = "true"
shell = ["sh"]
format = "[$output]($style) "
style = "bold"
```
starship runs this on every prompt. The 2-minute cache keeps that cheap (about 20 ms warm).

## zsh / bash prompt
```sh
PROMPT='$(~/.local/bin/hazenow-status.sh) '"$PROMPT"      # zsh (setopt PROMPT_SUBST)
```
