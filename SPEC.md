# HazeNow — shared spec (all clients MUST follow this)

> "Your PSI right now — not the last 24 hours."
> Free, open source (MIT), no account, no API key, no backend required.

## The problem
NEA's headline number is the **24-hr PSI**: a rolling 24-hour average. During a haze
spike it lags reality by many hours. Live example captured 2026-09-28 16:00 SGT:

| region  | 24-hr PSI (official headline) | 1-hr PM2.5 (µg/m³) | Instant PSI (ours) |
|---------|------|-----|-----|
| west    | 81   | 117 | ~165 |
| south   | 84   | 105 | ~153 |
| central | 81   | 105 | ~153 |

The headline says "Moderate". The air you're breathing right now is "Unhealthy".

## Data source (primary, all clients call it directly)
Public, no key, CORS `*`:

- `GET https://api-open.data.gov.sg/v2/real-time/api/pm25` → latest 1-hr PM2.5 per region
- `GET https://api-open.data.gov.sg/v2/real-time/api/pm25?date=YYYY-MM-DD` → all hourly readings that SGT day (newest first). Fetch today + yesterday for ≥12 h of history.
- `GET https://api-open.data.gov.sg/v2/real-time/api/psi` → official 24-hr PSI (`readings.psi_twenty_four_hourly`) + sub-indices.

Response shape (pm25):
```json
{"code":0,"data":{"regionMetadata":[{"name":"north","labelLocation":{"latitude":1.41803,"longitude":103.82}}, ...],
 "items":[{"date":"2026-09-28","updatedTimestamp":"2026-09-28T16:30:40+08:00","timestamp":"2026-09-28T16:00:00+08:00",
 "readings":{"pm25_one_hourly":{"north":49,"south":105,"west":117,"east":83,"central":105}}}]},"errorMsg":""}
```
Regions: north (1.41803,103.82), south (1.29587,103.82), east (1.35735,103.94), west (1.35735,103.70), central (1.35735,103.82).
Always read coordinates from `regionMetadata`, hard-coded values are fallback only.

Data quirks:
- A value of **-1** (or missing / null / negative) = station offline. Exclude it; never display -1.
- Readings are hourly. `timestamp` is the hour, `updatedTimestamp` is when it was published (~30 min later).
- Values can be back-filled later (a -1 may become a real number next poll).
- Poll cadence: every 5 min between :20 and :50 past the hour (publication window), otherwise every 15 min. Honour `updatedTimestamp`; don't re-render if unchanged. Widgets: request refresh ~every 15 min (OS decides).

## Computation (canonical — identical in every language)

### 1. Location → reading "at your spot"
- If user location known: inverse-distance weighting (power 2, haversine km) over valid regions.
  If the nearest valid region is < 0.5 km away, just use it. Round to integer.
  Also report `nearestRegion` (by distance, valid only).
- No location: use user-selected region, default `central`; if invalid → mean of valid regions.
- If all regions invalid for latest hour → walk back to the most recent hour with any valid data and mark `stale`.

### 2. Band (NEA 1-hr PM2.5 bands, µg/m³)
| band | range | label | color |
|------|-------|-------|-------|
| I   | 0–55    | Normal    | `#2E9E5B` |
| II  | 56–150  | Elevated  | `#E8A317` |
| III | 151–250 | High      | `#E4572E` |
| IV  | ≥251    | Very High | `#7B2D8E` |

### 3. Instant PSI (estimate, clearly labelled "Instant PSI · est.")
Apply NEA's PM2.5 sub-index breakpoints to the 1-hr concentration C (linear interpolation):

| C (µg/m³) | index |
|-----------|-------|
| 0–12      | 0–50 |
| 12–55     | 50–100 |
| 55–150    | 100–200 |
| 150–250   | 200–300 |
| 250–350   | 300–400 |
| 350–500   | 400–500 |

`index = Ilo + (C - Clo) * (Ihi - Ilo) / (Chi - Clo)`, round to integer, cap at 500.
(105 → 153, 117 → 165, 49 → 93.)
PSI descriptor: 0–50 Good, 51–100 Moderate, 101–200 Unhealthy, 201–300 Very Unhealthy, >300 Hazardous.

Always explain in UI (info sheet): this is *not* an official NEA figure; it's what the 24-hr PSI
would be if the last hour's air persisted for 24 hours. NEA itself recommends using the 1-hr PM2.5
for immediate activity decisions.

### 4. Trend
`delta = latest - previousHour` (same location method). Arrow: ▲ if delta ≥ +5, ▼ if ≤ -5, else ▶ (steady).
Also expose last 12–24 hourly values for sparklines.

### 5. Advice (short, 1-hr PM2.5 band based — NEA's 1-hr guidance)
- Normal: "Normal activities."
- Elevated: "Consider reducing prolonged or strenuous outdoor exertion. Elderly, kids, heart/lung conditions: minimise outdoor exertion."
- High: "Reduce outdoor exertion. Sensitive groups: avoid it. Close windows."
- Very High: "Avoid outdoor activity. Stay indoors, windows shut, use an air purifier."

### 6. Primary display hierarchy (every surface)
1. **Big number: 1-hr PM2.5 µg/m³** + band color/label — this is the true "now".
2. Instant PSI (est.) + descriptor.
3. Official 24-hr PSI (smaller, labelled "Official 24-hr PSI — lagging").
4. Trend arrow + "as of 4pm · updated 4:30pm" + region/"your location".

Compact surfaces (menu bar, lock-screen, complication): `● 105 ▲` (dot in band color, PM2.5 value, arrow).

### 7. Output model (JSON-shaped, same field names in TS/Swift/Kotlin)
```
Snapshot {
  pm25: number            // µg/m³ at your spot
  band: "normal"|"elevated"|"high"|"very_high"
  instantPsi: number
  instantPsiLabel: "Good"|"Moderate"|"Unhealthy"|"Very Unhealthy"|"Hazardous"
  officialPsi24h: number|null
  trend: { delta: number, direction: "up"|"down"|"steady" }
  history: [{ time: ISO8601, pm25: number }]   // oldest→newest, at your spot
  regions: { [name]: { pm25: number|null, psi24h: number|null, lat, lon } }
  nearestRegion: string
  locationMode: "gps"|"region"|"island"
  observedAt: ISO8601    // item.timestamp
  publishedAt: ISO8601   // item.updatedTimestamp
  stale: boolean         // observedAt older than 2h15m
  source: "NEA via data.gov.sg"
}
```

## Test vectors
Latest readings north 49, south 105, west 117, east 83, central 105.
- region=south → pm25 105, band elevated, instantPsi 153.
- region=west → 117 / elevated / 165. region=north → 49 / normal / 93.
- If south = -1: region=south falls back to island mean of valid (49+117+83+105)/4 = 88.5 → 89 (round half up), flagged.
- GPS at (1.29587,103.82) → exactly south (distance 0).
- Breakpoints: 0→0, 12→50, 55→100, 150→200, 250→300, 500→500, 600→500.

## Repo layout
```
SPEC.md
packages/core      TypeScript reference implementation (npm: hazenow) + CLI
apps/web           PWA (primary shareable surface)
apps/apple         HazeKit (Swift package) + macOS menu-bar/notch app + iOS app + widgets
apps/android       Kotlin app + Glance widgets
integrations/      SwiftBar/xbar plugin, Raycast, Home Assistant, Telegram bot, etc.
docs/              research, data sources, DIY sensor
```

## Brand
Name **HazeNow**. Tone: calm, factual, no fear-mongering, no government-bashing; just "the 24-hr number lags; here's the now number".
Always attribute "Data: NEA via data.gov.sg". MIT license.

---

# Experience & trust (v1.1 — overrides display hierarchy in §6 where they conflict)

The user is a worried person holding a phone, asking **"Is it safe for me / my kid to be outside right now?"**
Not "what is the PM2.5". Design for that question, for trust, and for calm.

## Principles (applied psychology)
1. **Answer the decision first, the number second.** Headline is a verdict in plain words
   ("Fine to be out." / "OK for a walk — move your run indoors." / "Keep outdoor time short." / "Stay indoors today.").
   Big number sits right under it. People act on verdicts; numbers alone create anxiety without direction.
2. **Threat + efficacy, never threat alone** (Protection Motivation Theory / Extended Parallel Process Model).
   Fear without a doable action → denial or panic. Every elevated state ships with 1–3 concrete actions
   (close windows, run purifier, N95 if going out when High+, reschedule the run to <best window>).
3. **Calm by default.** No flashing, no alarm red for Elevated, no "DANGER". Band colors are muted; motion only on change.
   Same band names/colors as NEA so users don't face conflicting systems (reduces dissonance, borrows authority).
4. **Radical transparency = trust.** Show provenance on the main screen, not buried:
   "Measured by NEA's West station · 3.2 km from you · 47 min ago". Show the official 24-hr PSI too,
   explain the difference in one neutral sentence ("24-hr PSI averages the last 24 hours; this is the last hour."),
   never mock or contradict the government. We complement NEA, we use NEA's own data and NEA's own 1-hr guidance.
5. **Honest uncertainty, no false precision.** Estimates are prefixed "~". When the nearest valid station is >5 km away
   or stations disagree strongly, show the range of the two nearest stations ("~105 (range 83–117)").
   Stale or offline data is stated in words ("West station offline — using nearby stations"), never shown as -1.
6. **Anchor to normal.** Relative framing is intuitive and calm: "about 5× a typical clear day in Singapore"
   (typical = median of available 1-hr history ≥7 days if fetched, else constant 20 µg/m³). Avoid cigarette-equivalents (alarmist, loose science).
7. **Trajectory beats level for decisions.** Show direction in words ("Rising fast — up 34 in 2 h", "Easing").
   The **24h chart of hourly bars with the 24-hr PSI line overlaid** is the core trust visual: it *shows* the lag instead of asserting it. It is also the shareable image.
8. **Personalize the verdict, not the data.** One-time optional profile: "Who are you checking for?" —
   General · Kids · Elderly · Pregnant · Heart/lung condition · Exercising outdoors (multi-select). Sensitive profiles get the stricter NEA guidance.
   Stored on-device only.
9. **Indoors is a lever.** Remind that the reading is outdoor air; closed windows + purifier make indoors much cleaner. Gives control → lowers anxiety.
10. **Notifications earn trust by being rare.** Only on band crossings (with hysteresis: must stay across the boundary 2 consecutive hours or cross by ≥10 µg/m³),
    always paired with an action, and send the **all-clear** too ("Air's back to normal in the West. Windows open."). Relief messages build the habit. Quiet hours default 22:00–07:00.
11. **Glanceable & accessible.** Never color-only: every band has label + icon/shape. Dynamic type, VoiceOver/TalkBack labels ("PM2.5 105, Elevated, rising").
12. **Credibility signals, quietly:** "Data: NEA via data.gov.sg · Open source · No ads, no tracking, no account · Your location never leaves your device." Link to a plain-English "How we calculate this" page.

## Verdict matrix (1-hr PM2.5 band × group) — the headline copy
| band | general | sensitive (kids, elderly, pregnant, heart/lung) |
|------|---------|------------------------------------------------|
| Normal    | "Fine to be out." | "Fine to be out." |
| Elevated  | "OK to be out. Go easy on long, hard exercise." | "Keep outdoor time light. Skip strenuous activity." |
| High      | "Keep outdoor time short. Exercise indoors." | "Stay indoors if you can." |
| Very High | "Stay indoors today." | "Stay indoors today." |
If "Exercising outdoors" is selected and band ≥ Elevated → append "Move your run indoors or to <best time window if known>."
If rising ≥ +20 in the last hour → append "Getting worse — check again in an hour."
Verdict for a mixed profile = the strictest applicable row.

## Actions per band (show 1–3)
- Elevated: "Close windows if it smells hazy." · "Sensitive? Keep a mask handy."
- High: "Close windows, run a purifier." · "Going out? Wear an N95 (surgical masks don't filter haze)." · "Reschedule outdoor exercise."
- Very High: all High actions + "Check on elderly neighbours and family."

## Screen order (phone app / web)
1. Verdict headline (colored subtly by band) + who it's for ("for you + kids")
2. Big number `105` µg/m³ PM2.5 · band chip with icon · trend words
3. Provenance line (station, distance, age)
4. Actions
5. "Hourly vs 24-hr PSI" chart (the lag, visualised) with Instant PSI est. and Official 24-hr PSI labelled
6. Regions
7. Footer: how we calculate · open source · privacy · data attribution
Compact surfaces keep `● 105 ▲`; medium widgets add the verdict headline (short form, ≤28 chars: "Fine to be out", "Go easy outdoors", "Keep it short", "Stay indoors").

---

# v1.2 amendments (from docs/UX_PSYCHOLOGY.md research — these WIN over anything above)

**Canonical copy lives in `docs/COPY.md`.** Use its strings verbatim for verdicts, actions, trend, provenance, states, notifications, share text.

1. **Instant PSI is removed from all user-facing surfaces** (UI, widgets, share text, badge, embed, share image, notifications).
   Reason: NEA explicitly declined (2015) to convert 1-hr PM2.5 into a PSI; showing "Unhealthy" next to NEA's "Elevated" and "Moderate" recreates the 2013 confusion and makes us look like we contradict NEA.
   The code may keep `instantPsi` in the data model for API/JSON users only. The answer to "what's my PSI right now" is: **1-hr PM2.5 + NEA band**, which is NEA's own "now" indicator since 2016.
2. **Chart is in µg/m³**: hourly 1-hr PM2.5 bars + a line of NEA's `pm25_twenty_four_hourly` (from the `/psi` endpoint, fetch `?date=` for history) — both same unit, the lag is visible without inventing an index.
   The official 24-hr PSI number stays visible (above the fold, smaller), with no word "lagging" — use the neutral explainer from COPY.md.
3. **Advice wording follows NEA's 1-hr PM2.5 advisory (Jun 2026)**: scoped to "for the next hour / for now", never "today"; healthy vs vulnerable split as NEA words it.
4. **Masks follow MOH**: never the lead action; N95 not for short trips; not certified for children; caution for pregnancy and heart/lung. **Filter actions by profile** (no N95 action for Kids).
5. **Replace "N× typical day"** with a position-in-band anchor ("High starts at 151") per COPY.md.
6. **Add profile "I work outdoors".** Profiles = General, Kids, Elderly, Pregnant, Heart/lung condition, Exercising outdoors, Works outdoors.
7. **Notifications**: Elevated alerts OFF by default for General-only profile; daily cap (max 3 rise alerts/day); all-clear always sent; quiet hours 22:00–07:00 with a morning catch-up.
8. **Indoors honesty**: closed windows alone help only modestly; purifier helps a lot; pair "close windows" with "keep cool".
9. **Uncertainty as numeric range** ("105 · range 83–117") rather than only "~".
10. **Planning ahead**: link to NEA's 24-hr PSI forecast/haze advisory for tomorrow — we only cover "now".
11. **Colors**: never mix band colors in oklch (hue drift made amber render green); keep contrast ≥ 3:1 for icons, 4.5:1 for text. Don't put `aria-live` on the whole app — only on the headline, and only announce on band change.

---

# v1.3 amendments — data freshness (from docs/DATA_SOURCES.md, verified live 2026-09-28)

1. **NEA publishes ~1 minute after the hour, not ~30.** v2 later re-stamps `updatedTimestamp` at ~:30/:45 with the same values (it's "last revised", not "published").
2. **Two sources, merged per hour:**
   - v1 `https://api.data.gov.sg/v1/environment/pm25[?date=YYYY-MM-DD]` — snake_case (`region_metadata`, `label_location`, `update_timestamp`), CORS `*`, stable first-publish stamp, no observed rate limit. **Primary for freshness.**
   - v2 (as in §Data source) — back-fills gaps (e.g. v1 missing `south` at 15:00 while v2 later had 106). Rate-limited: HTTP 429 with `{"code":24,"data":null}` after ~4 rapid calls.
   - Merge rule per hour and region: v2 value if valid, else v1 value if valid, else invalid. `publishedAt` = v1 `update_timestamp` when available.
   - PSI (`pm25_twenty_four_hourly`, `psi_twenty_four_hourly`): v1 `https://api.data.gov.sg/v1/environment/psi` with v2 fallback.
3. **Polling (replaces the old cadence):** from hh:00:30, poll v1 every 60 s until the new hour appears (stop at hh:10); then one v2 call at ~hh:35 and ~hh:50 to catch back-fills; idle otherwise. Never more than 1 req/min per endpoint. On 429 or network error: exponential backoff 30 s → 10 min, honour `Retry-After`, keep showing the last snapshot with its real age.
   Widgets/timelines: request the next refresh at hh:02 (OS may delay). Background workers: a single fetch at hh:02 via the scheduler's best effort, 15 min minimum on Android.
4. **Advice alignment:** use docs/COPY.md (already aligned to NEA's Jun 2026 1-hr PM2.5 advisory). Vulnerable groups include pregnant women.
5. Crowd sensors (AirGradient) are **v2 roadmap, native apps first** — see docs/ARCHITECTURE_V2.md. Not in this build.

---

# v1.4 amendments — location (ask well, need little)

We only use location to pick the right area. We never need precise GPS and never send it anywhere.

1. **First run offers two equal choices** (no OS prompt before the user taps):
   - "Use my location" → one-line explainer *before* the OS prompt: "We only use this to find your nearest NEA station. It stays on your phone." Request **approximate** location only (iOS: reduced accuracy is fine, don't ask for precise; Android: `ACCESS_COARSE_LOCATION` only; web: `enableHighAccuracy:false`, `maximumAge` 10 min). "While using the app" only — never background/always.
   - "Pick my area" → searchable list of Singapore towns/planning areas (e.g. "Tampines", "Jurong East", "Punggol", "Bukit Timah") **bundled offline** with centroids → same distance-weighted estimate. No network lookup, so typing an area leaks nothing.
2. **Saved places:** "Home", "Work/School" (+ optional one more), each set via location or the area list. Quick switcher on the main screen; widgets can pin a place. Kids' school is a primary parent use case.
3. **Denied / not now:** never re-prompt automatically. Fall back to the area list, then to the island view. Show a quiet "Use my location" chip the user can tap later (deep-link to Settings if OS-denied).
4. **Provenance reflects the mode:** "Near you · West station 3.2 km" vs "Tampines · East station 1.1 km" vs "Singapore (island average)".
5. **Precision hygiene:** round any stored coordinate to 2 decimals (~1 km) before persisting; never log it; no analytics.
6. Data file (shared by all clients): `packages/core/data/sg-areas.json` — `[{ "name": "Tampines", "aliases": ["Tampines East","Tampines West"], "lat": 1.354, "lon": 103.944 }]`, the 55 URA planning areas (centroids from the URA Master Plan 2019 planning-area boundary dataset on data.gov.sg) plus common estate names as aliases. Must be valid for every name listed.
