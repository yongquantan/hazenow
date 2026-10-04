# Privacy: what HazeNow counts

> No ads, no accounts, and we never track you. We only count things in total, like visits, downloads and shares — never who did them.

This page lists **every counter that exists**. If something isn't on this list, HazeNow doesn't count it. The code is open: the server's allow-list is [`services/worker/src/metrics.ts`](../services/worker/src/metrics.ts), and the apps send their counts from [`apps/web/src/count.ts`](../apps/web/src/count.ts) and [`apps/site/src/count-site.ts`](../apps/site/src/count-site.ts).

## The rule: count, never identify

- Every signal adds **+1 to a total**, kept per (UTC day, event, a small fixed label such as country, card or platform).
- **Nothing that could identify a person or a device exists anywhere.** That means no user or device IDs, IP addresses, user agents, coordinates, place names, fingerprints or cookies. The server rejects any request that carries something off its fixed list.
- **"Once a day" is decided on your device.** A flag saved on your phone (for example "already counted today") decides whether to send the +1. The server can't tell two counts apart, by design.
- **Your location never leaves your device** for counting. "Country" is the two-letter country Cloudflare sees for the connection, as a total. The native apps send the country of the *place you picked* instead.
- No counting happens on `localhost`, in test (`?mock`) pages or embeds.
- These totals are private to the maintainer. They're used to see whether HazeNow is useful and worth keeping running.

## The counters

### Web app (hazenow-app.pages.dev) and site (hazenow.pages.dev)

| Counter | When it's +1 | Labels kept with it |
|---|---|---|
| `app_open` | The web app opens, **at most once per device per UTC day** (local flag) | country; `app` (opened from the Home Screen) or `browser`; `new` or `returning` (a local first-seen flag) |
| `app_open_week` | The web app opens, **at most once per device per ISO week** (local flag) | country; `app` or `browser` |
| `eureka` | The **first verdict ever** shown on a device (local flag) | country; how the place was found: `location`, `typed`, `list`, `saved`, `link` or `guess` |
| `place_set` | You pick a place | how only: `location`, `typed`, `list` or `saved`. **No country, and never the place** |
| `share_sent` | A share card is sent, downloaded or copied | country; card (`now`, `clocks`, `group`, `clear`); `share`, `download`, `copy_text` or `copy_link` |
| `share_landing` | A page opens from a share link (`?s=card`), once per tab | country; card |
| `install_prompt_shown` | An install hint is shown (iPhone coach mark, or the "open in Safari/Chrome" strip) | country; `coach` or `inapp` |
| `installed` | The installed web app opens from the Home Screen for the **first time** (local flag) | country; `ios`, `android` or `other` |
| `alerts_on` / `alerts_off` | Haze alerts are turned on or off | country |
| `download_click` | A download or install button on the site is clicked | country; platform (`android`, `mac`, `cli`, `scriptable`, `scriptable_js`, `home_assistant`, `swiftbar`, `shell`, `iphone_web`, `android_web`) |
| `qr_shown` | The desktop "scan to open on your phone" code is shown, once per tab | country |
| `scriptable_file` | `/widget/HazeNow.scriptable` is downloaded (counted by the site's server function) | nothing |
| Page visits | Cloudflare Web Analytics, cookieless and without fingerprinting | Cloudflare's own totals per page and day |

### Native apps (Android, iPhone, Mac)

| Counter | When it's +1 | Labels kept with it |
|---|---|---|
| `app_open` | The app opens, **at most once per install per UTC day** (local flag). Off in debug builds | `android`, `ios` or `mac`; `new` or `returning` (a local first-seen flag); the country of the place you picked (not your location) |

Nothing else is sent: no app version, device model, ID or location.

### Data server (the Cloudflare Worker)

| Counter | When it's +1 | Labels kept with it |
|---|---|---|
| Requests | Any `/v1/*` data request (the apps fetching readings) | country; a fixed endpoint name such as `sg/observations` (never a coordinate or ID from the URL) |

The server uses your IP address only in memory, for about a minute, to slow down floods of requests. It is never stored or logged.

### Elsewhere (public numbers HazeNow reads)

- **Downloads:** GitHub's own per-file download totals on each release.
- **GitHub repository:** stars, forks, page views and clones (GitHub's own daily totals and top referring sites), copied daily because GitHub keeps them for only 14 days.

## What isn't counted

Your location, the places you check, readings you look at, profiles, how long you stay, what you tap, and anything that could link one count to another. Native-app users who only fetch NEA's data directly are invisible apart from the daily `app_open` above.

## Changes

This list changes only with a commit to this file, next to the code that adds the counter.
