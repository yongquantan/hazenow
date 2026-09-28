# HazeNow integrations

Each integration is self-contained, so none depends on `packages/core`. Copy is `docs/COPY.md` verbatim. Data: NEA via data.gov.sg (v1 first, v2 fallback).
None shows Instant PSI (SPEC v1.2). Where it exists, `instantPsi` appears only in JSON output for data users.

| folder | what | status (28 Sep 2026) |
|---|---|---|
| `swiftbar/` | macOS menu bar `● 137 ▲` via SwiftBar/xbar, one Python file, stdlib only | ✅ runs live, `--selftest` passes |
| `raycast/` | Raycast menu-bar command + "Haze Now" list/detail | ✅ `tsc` + `ray build` pass, unit tests + live test |
| `home-assistant/` | HACS custom integration (4 sensors × home + 5 regions) + REST package | ✅ 19 tests incl. end-to-end in HA 2025.1.4; REST templates validated live |
| `telegram-bot/` | Cloudflare Worker bot: `/now`, location, `/profile`, `/alert` with hysteresis, cap, all-clear, quiet hours | ✅ `tsc`, logic tests, live end-to-end with mocked Telegram/KV, `wrangler --dry-run`; not deployed (needs token) |
| `shell/` | tmux / starship / prompt status line (`curl` + `jq`) | ✅ all formats run live |
| `scriptable/` | iOS home + lock-screen widget via Scriptable, no App Store | ✅ runs live in a mocked Scriptable runtime (`test/harness.mjs`); not yet run on a real iPhone |
| `kwgt-tasker/` | Android recipes (README only) | 📄 docs |
