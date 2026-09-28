# HazeNow Telegram bot (Cloudflare Worker, webhook mode)

A tiny bot, free to host on Workers + KV. There's no server to babysit.

| you send | you get |
|---|---|
| `/now` · `/now west` | Verdict first, then who it's for, second line, `137 PM2.5 · ◐ Elevated ▲`, trend, band anchor, provenance, 1–3 actions, `NEA 24-hr PSI: 86 (Moderate) · 24-hour average`, a same-scale sparkline of hourly PM2.5 vs NEA's 24-hr average, NEA forecast link, footer |
| 📍 a location | The same, estimated for that spot from all five NEA stations (`~136`, "Estimated for your spot… nearest: Central, 0.6 km"), plus an "Alert me for this spot" button. The location is used once and stored only if you set an alert |
| `/regions` | "Across Singapore": `◐ West · 107 · Elevated` … |
| `/profile kids` | Advice for kids, elderly, pregnant, heart_lung, exercising or general (COPY.md verdicts, actions filtered, no N95 line for kids) |
| `/alert [area] [all]` | Band-change alerts, then `/quiet 22-7`, `/quiet off`, `/stop` |

**Alerts follow COPY.md §11 and SPEC v1.1 §10 / v1.2 #7.**
- A change counts only if it holds 2 consecutive hours or crosses the boundary by at least 10 µg/m³ (hysteresis).
- Default: High and above for `general`. Elevated is included for sensitive or exercise profiles, or `/alert west all`.
- Easing messages and the **all-clear** go to anyone we alerted this episode. The all-clear always gets through.
- Max **3 a day**. Quiet hours 22:00–07:00 SGT: changes are recorded and summarised in one **"Overnight air update"** in the morning.
- Cron runs at **:02** (NEA data lands about hh:01) with a retry at :12. Data comes from NEA **v1**, cached in KV. v2 is used only if v1 fails, so the bot never hammers the rate-limited v2.

Sample (real, 28 Sep 2026 5pm, from `LIVE=1 npm test`):
```
🟠 Haze rising in the South
Now Elevated (PM2.5 105). Calm play outside is OK. Skip running games for now.
Data: NEA via data.gov.sg · /now for details · /stop to turn off
```

## Deploy (needs your bot token; not deployed here)
```sh
npm install
npx wrangler kv namespace create HAZENOW_KV        # paste the id into wrangler.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN          # from @BotFather
npx wrangler secret put WEBHOOK_SECRET              # any long random string
npx wrangler deploy
curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -d url=https://hazenow-telegram-bot.<you>.workers.dev/webhook -d secret_token=$WEBHOOK_SECRET
# optional: BotFather /setcommands → now, regions, profile, alert, quiet, stop, help
```

### Bot avatar
<img src="assets/avatar-512.png" width="96" alt="HazeNow app icon: an ivory dot above three fading haze lines">

`assets/avatar-512.png` is a copy of `brand/png/app-icon-512.png`. Set it in @BotFather with `/setuserpic`, choose the bot, then send the PNG **as a photo**.
Also set `/setdescription` to "Singapore haze right now, from NEA's 1-hr PM2.5. Plain-words advice, alerts when the band changes. Data: NEA via data.gov.sg. Free & open source."

## Check
```sh
npm run typecheck      # ✅ tsc --noEmit
npm test               # ✅ hysteresis, caps, all-clear, quiet hours + morning catch-up
LIVE=1 npm test        # drives the worker end-to-end against data.gov.sg with fake Telegram + KV
npm run dry-run        # ✅ wrangler bundles it (≈36 KiB)
```
`src/haze.ts` is an identical copy of `../raycast/src/haze.ts`.
