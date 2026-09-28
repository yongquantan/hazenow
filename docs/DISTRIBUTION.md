# HazeNow: distribution plan (haze episode, Sep 2026)

**Goal:** get the right number into worried people's hands this week, and keep their trust so they come back each haze season.
**Growth engine: trust, not hype.** HazeNow spreads when a parent, a physio or a run leader forwards it and says "this one's calm and accurate".
Everything below is built to earn that forward.

## 1. Positioning (one line, used everywhere)

> **"Is it OK to be outside right now? HazeNow answers in plain words, using NEA's own 1-hr PM2.5."**

- **Complement NEA, never correct it.** Both numbers are NEA's. NEA itself says to use 1-hr PM2.5 for "what do I do now" and the 24-hr PSI (and its forecast) for planning tomorrow. We say exactly that and link NEA's forecast.
- **Never use** "the real number", "what NEA won't tell you", "the PSI is useless", fear words, or exclamation marks. Those framings raise outrage (Sandman) and cost us the trusted messengers (see `UX_PSYCHOLOGY.md` §2.2). If a thread turns into NEA-bashing, reply once, calmly: "Both are NEA numbers, for different jobs."
- **No Instant PSI** in any marketing (SPEC v1.2). We talk only in PM2.5 and NEA's bands.

## 2. The shareable asset: the "two lines" chart

**Hourly PM2.5 bars vs NEA's 24-hr PM2.5 average line, both in µg/m³**, with dashed guides at "Elevated 56" and "High 151".
It *shows* the lag instead of asserting it, and it doesn't invent an index.
Real example from 28 Sep 2026, Central: the hourly bars climbed from about 30 overnight to 137 µg/m³ by 5pm while the 24-hr average line sat near 43.

- Auto-generate it as a 1080×1350 share image in the web app (`apps/web`), with the headline verdict and the footer
  "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking". The caption is COPY.md §8 verbatim.
- Share text is COPY.md §15 verbatim, with **no verdict**, because advice depends on the reader:
  "Air near me right now: Elevated (PM2.5 137), rising fast. NEA 24-hr PSI: 86. Data: NEA via data.gov.sg. hazenow.app"
- One image per post, no arrows or red circles, and no side-by-side "NEA says 86, we say 137". The chart does the explaining.

## 3. Credibility signals (quiet, but on every surface)
Data: NEA via data.gov.sg · open source (MIT, GitHub link) · no ads, no tracking, no account · location stays on device ·
"How we calculate this" page (COPY.md §12) · "Not medical advice, not an official NEA app".
Ask one respiratory doctor or pharmacist to read the copy, then say so ("Advice wording reviewed by …") **only with written permission**.

## 4. Seed audiences first: health-worried groups, via trusted messengers

| audience | why first | trusted messenger | tactic |
|---|---|---|---|
| **Parents** (preschool, primary) | decide recess, playground and sports "now"; Kids profile gives "Calm play only" | parent-support-group volunteers, class-chat admins, a paediatrician | 1 screenshot of the Kids verdict + the chart; the Telegram bot's `/profile kids`; "for school tomorrow, use NEA's forecast" line |
| **Asthma / COPD / heart** | highest stakes, most anxious | respiratory nurses, pharmacists, patient support-group moderators | ask to review wording first; pinned post with "keep your inhaler with you" action; no masks-first messaging |
| **Runners / cyclists / outdoor workers** | check before every session; very shareable | run-club leaders, coaches, Strava club admins | "Light workout or go indoors" verdict, SwiftBar/Raycast/Scriptable widgets, and a club pre-run check-in habit |
| **Eldercare** | vulnerable, reached through caregivers | Active Ageing Centre staff, family caregivers' chats | large-type web view, Telegram `/alert` for the caregiver, and "Check on older family" action at Very High |

Messenger rules: ask them to post in their own words. Never pay, never astroturf, and disclose "I built this" every time.

## 5. Channels (in order for this episode)

1. **Telegram.** The bot is the product in the channel. Share the `/now` card into neighbourhood, estate and parent groups *via members*, not by spamming admins. The alert all-clear messages bring people back ("Air's back to Normal…").
2. **Reddit r/singapore.** Post in the haze megathread / daily thread as the developer: the chart plus "open source, NEA data, no tracking; feedback welcome". Answer every comment for 3 hours. No second post the same week.
3. **Facebook parent groups + HardwareZone.** HWZ Software & Apps / EDMW threads with the SwiftBar and Scriptable "install in 2 minutes" angle. For Facebook parent groups, use the Kids verdict screenshot.
4. **X / Threads.** Post the chart each morning of the episode at 7–8am (school and commute decisions), with the NEA attribution in the image.
5. **Local tech press.** Pitch Mothership, CNA (lifestyle/tech), Straits Times Tech, Vulcan Post, and Tech in Asia with a 150-word note: "a free open-source civic tool that puts NEA's own 1-hr PM2.5 advice in plain words".
   Lead with the chart, the NEA-aligned framing, the privacy stance, and a quote from a clinician if permitted. Offer the data and the code, not a founder story.
6. **Product Hunt / Hacker News "Show HN".** Post *after* the local wave, for developer credibility and contributors (translators, Android). It's not a user channel for Singapore.

## 6. Name and domain (checked 28 Sep 2026)

| candidate | result | note |
|---|---|---|
| `hazenow.sg` | **not registered** (SGNIC whois: "Not found") | best for local trust; needs a Singapore entity or SG admin contact |
| `hazenow.app` | **not registered** (Google Registry RDAP 404, no NS) | HTTPS-only TLD, good for the PWA; register today |
| `psinow.sg` | **not registered** (SGNIC: "Not found") | avoid as the primary name: it centres the PSI, which we don't compute; redirect only |
| `hazenow.org` | not registered (PIR RDAP 404) | cheap defensive registration |
| `hazenow.com` | **registered** (GoDaddy, 2023-07-31) | not available |
| `haze.sg`, `psi.sg` | registered (2014, 2023) | not available |

Recommendation: keep the name **HazeNow**. Register `hazenow.app` (primary) + `hazenow.sg` (redirect) + `hazenow.org`. Handles: `@hazenow_sg` (Telegram bot `@HazeNowSGBot`).
Don't use NEA's logo, colours or ".gov" style anywhere.

## 7. App store review risks (and how we pass)

- **Apple 1.4.1 (Physical Harm / medical data accuracy).** Apps giving health-related readings must disclose their data and methodology, and must not claim diagnosis.
  → Category **Weather**, not Medical. The review notes link the "How we calculate this" page and NEA's data licence. The data is NEA's own. No Instant PSI or any invented index.
  Verdicts cite NEA's advisory. "Not medical advice. In an emergency, call 995."
- **Apple 5.2 / 4.1 (IP, impersonation) + Google Play Misrepresentation / government-affiliation policy.** Say "not an official NEA app" in the description and in the app. Attribute "Data: NEA via data.gov.sg" (Singapore Open Data Licence). No government branding.
- **Privacy (Apple 5.1.1, Play Data safety).** Location is used on-device only, so the privacy label is "Data Not Collected". There's no analytics SDK. Telegram alerts store the chosen area or spot in KV only until `/stop`, which the bot's privacy note says.
- **Play health declaration.** Declare it as a non-medical health information app. Avoid words like "safe" or "diagnose" in the store listing.
- **Scarcity and commerce.** We never link shops or recommend brands (masks sold out in 2013 and 2019). That also keeps us out of "promotional health claims" review trouble.

## 8. Release pipeline (free, reproducible)

- **GitHub Releases (source of truth).** A tag `v*` triggers CI to build:
  - the macOS menu-bar app: universal, Developer ID signed, notarized, DMG + zip;
  - the Android APK (signed) + AAB;
  - `hazenow.2m.py` (SwiftBar), `HazeNow.js` (Scriptable), and `hazenow-status.sh`, attached as assets with SHA-256 checksums.
- **Homebrew.** Start with our own tap today: `brew install --cask hazenow/tap/hazenow`. A `livecheck` watches GitHub Releases.
  Submit to `homebrew/cask` once we meet its notability bar (roughly 75+ stars/forks/watchers, and the app must be signed + notarized).
- **F-Droid.** The Android app must build with no Google Play Services, Firebase or proprietary map SDKs. Add `fastlane/metadata/android/` and a reproducible-build recipe, then open a merge request to `fdroiddata`. Allow 1–3 weeks.
  Meanwhile, point power users to **Obtainium**, which pulls APKs straight from GitHub Releases.
- **Zero-wait channels during review:** Scriptable widget (iOS), SwiftBar plugin (Mac), the Raycast Store PR, the Telegram bot, the HACS custom repo (`hazenow/hazenow-ha`, split from `integrations/home-assistant`), and the PWA.

## 9. Measuring without tracking
GitHub stars and release downloads, Homebrew/F-Droid install counts, the Telegram bot's aggregate subscriber count (a KV key count), and HA/HACS
install counts. There are no per-user analytics. Collect qualitative feedback through a pinned GitHub Discussion and `/feedback` in the bot.

## 10. The top 3 moves (this week)
1. **Ship the chart share card and the Telegram bot today**, then seed the bot into 5–10 parent and running groups *through members who already use it*.
2. **Get one clinician and one run-club leader to review the copy and share it in their own words.** That borrowed trust carries the "complements NEA" framing.
3. **One calm r/singapore megathread post plus a Mothership/CNA pitch**, both leading with the "two lines" chart. Register `hazenow.app` and `hazenow.sg` before posting.
