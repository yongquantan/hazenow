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

---

# v1.5 amendments — hero number & brand type

1. **No "~" on the hero number.** The big number is always a clean integer (`108`). Uncertainty lives in the small line under it: "Estimate for Tampines · range 83–117" (or "Measured at East station" when it's a direct station reading). Compact surfaces (`● 108 ▲`) never show "~" either. This supersedes principle 5's "prefixed ~".
2. **Brand typeface: Apfel Grotezk** (SIL OFL, `brand/fonts`). Headlines Mittel 500 (−0.04em at display sizes), big numbers Fett 700 (−0.045em), body Regular 400. Menu bar/notch/Glance widgets keep the system font. Apfel has no ▲▼ glyphs: draw trend arrows as SVG/vector icons, not text.

---

# v1.6 — share system (see docs/SHARING.md for evidence, docs/share-cards/ for designs)

**One tap, no choosing.** A prominent primary **Share** button (main screen, near the verdict; also in widgets' deep link and the notification action) opens a preview of the auto-picked card with a swipeable row of the other eligible cards beneath. Sending needs no choice.

**Auto-pick (first match wins):**
1. All-clear: band is Normal now and was ≥ Elevated within the last 12 h → **All clear** (with worst hour + hours above Normal for this episode).
2. Profile has a sensitive/activity persona and band ≥ Elevated → **For our group**, persona variant by priority kids > elderly > heart_lung > pregnant > exercising > outdoor_worker:
   - kids "For the kids · Recess check" · elderly "For Mum and Dad" · heart_lung "For heart and lung health" · pregnant "For mums-to-be" · exercising "Run check" · outdoor_worker "Site check". Verdict/actions from COPY.md for the strictest profile.
3. Band ≥ Elevated → **Now card**.
4. |1-hr PM2.5 − 24-hr avg PM2.5| ≥ 40 in either direction, or opened from "Why two numbers?" → **Two clocks**.
5. Otherwise → **Now card**.
Eligible alternates in the row: Now, Two clocks, For our group (current persona), All clear (only if rule 1 applies).

**Every share payload = image + text + link.** Text per COPY.md §15 (update it to match each card's headline), ending with `hazenow.pages.dev`. Link carries `?area=` so the link preview (card 6, server/OG) matches.
**Every card image must print:** exact date and time, area, "Data: NEA via data.gov.sg", "Free and open source · Made by Yong Quan Tan", `hazenow.pages.dev`. No Instant PSI, no "~", no "real number"/anti-NEA framing.
**Quality:** render at exactly 1080×1350 (and 1200×630) pixels, independent of screen DPR; embed Apfel Grotezk; PNG; check text never clips at the largest numbers (e.g. 3-digit PM2.5, long area names like "Choa Chu Kang" — shrink-to-fit the headline).
**Credit link:** in-app "Made by Yong Quan Tan" opens an About section (who, why, free/open source) linking LinkedIn first, then Kairos Labs, then GitHub. Cards show the name as text only.
Haze receipt (card 5) is **not** in this build.

---

# v1.7 — parity fixes
1. **Uncertainty range** (found on Android): the range must always contain the estimate. Range = min/max over valid stations within 1.5× the nearest station's distance (at least the two nearest), then widened to include the estimate. Test: Clementi estimate 120 must not show "range 137–140".
2. About copy and stale-share behaviour: COPY.md §18–19.

---

# v2.0 — Southeast Asia

Scope: HazeNow expands from Singapore to ASEAN + Timor-Leste. **Nothing above changes for Singapore**: the SG v1
`Snapshot`, copy and behaviour stay exactly as specified (the SG adapter wraps the v1 code; tests prove the SPEC §7 fields
are identical). Research: `docs/sea/*.md`. City-by-city status and the unblock list: `docs/sea/COVERAGE.md`.
Reference implementation: `packages/core/src/countries/` (exported as `sea` from `hazenow`) and `services/proxy/`.

## 1. The model

```
adapter (per source) → Observation[] → ObservationSet (per country) → buildCountrySnapshot(set, place) → CountrySnapshot
```
- **Observation**: one station or sensor, normalised: `stationId`, `name`, `country`, `lat/lon`, `grade`
  (`reference`|`lowcost`), `pm25_1h`, `pm25_now` (crowd), `pm25_24h`, `official` (the authority's own index,
  verbatim), `periodEnd` (end of the averaging window, ISO with the station's offset), `history`, `k`, `qc`, `attributionId`.
- **CountrySnapshot** = every SPEC §7 field with the same name and meaning, plus: `country`, `status`, `level` (0–3),
  `localBand {scaleId, key, labelEn, labelLocal, lang, color, shape, level, agency}`, `bandBasis`
  (`pm25_1h`|`official_index`|`none`), `official {scaleId, name, value, category, averaging, param, agency}`,
  `pm25Kind` (`official_1h`|`crowd_estimate`|null), `pm25_24h`, `nearest`, `stations`, `range`, `whoMultiple`,
  `hotspots`, `attribution[]`, `notes[]`. `pm25` and `band` become **nullable** outside SG. `instantPsi` exists only for SG.
- Coverage today: SG and TH are direct (clients call the authority). MY, ID, VN (Hanoi), PH, LA and KH (Siem Reap,
  community sensors only) go through the proxy, and so do TH's community sensors (`/v1/th/observations?grade=lowcost`, used
  only where no PCD station is within 25 km, e.g. Pai). MM, BN and TL are not covered.
- Quality screens (`quality.ts`, before everything else): a station silent for > 24 h is offline and left out; a PM2.5 value
  outside 0–1000 µg/m³ or a rise of > 400 in an hour is left out with "A station reading looked wrong and was left out."
  Crowd QC adds the cluster outlier rule (> 3× the median of ≥ 4 sensors within 10 km, and ≥ 10 µg/m³ above it).

## 2. Transport and privacy

- One client constant: `HAZENOW_EDGE` (the Railway proxy URL). Direct countries never depend on it.
- Clients call **`GET {edge}/v1/{cc}/observations`** (no location) and build the snapshot **on the device** with the
  shared builder. The location never leaves the device, as before.
- `GET {edge}/v1/{cc|auto}/snapshot?lat&lon[&profile=]` exists only for clients that can't run the builder (SwiftBar,
  Telegram, Home Assistant). The proxy rounds coordinates to 2 dp and never logs query strings. Apps and the web must not use it.
- If the proxy is down: SG and TH keep working, and proxied countries show their last snapshot with its real age (stale rules
  below). Never substitute another country's data.
- Every proxy response has `attribution[]`, CORS `*`, and is served within a fixed upstream budget (`/health`).

## 3. Jurisdiction (the reading decides, not the person)

1. `locateCountry(lat, lon)` (point-in-polygon, Natural Earth, coastal snap 0.1°) picks the country. The **scale, words,
   agency, advice, language default and time zone all follow that country**.
2. **Never interpolate official values across a border.** The builder drops observations whose `country` differs from the
   set's (`notes: "other_country_dropped"`). A Johor Bahru user gets DOE Malaysia even if an NEA station is closer. The proxy
   answers 409 if asked for `sg` at a Johor point.
3. On the first switch into another country, show once: "You're in Johor. Bands and advice now follow Malaysia's DOE."
   Saved places keep their own country. Notifications use each place's own scale. Crossing a border never fires an alert.
4. Times: relative age first ("12 min ago"). Clock times are in the **station's local time with its zone when it differs
   from the device's** ("4pm ICT"). Offsets: TH/VN/LA/KH/WIB +7, SG/MY/PH/BN/WITA +8, WIT/TL +9, MM +6:30.

## 4. The big number (always µg/m³ PM2.5, always an integer, never "~")

Order (builder rule 2):
1. Official 1-hr PM2.5 when the nearest fresh official station is **≤ 25 km** away.
2. Else a **community-sensor estimate** from usable sensors **≤ 10 km** away (`pm25Kind: "crowd_estimate"`).
3. Else official 1-hr up to **60 km** away (`notes: "nearest_far"`, always with a range).
4. Else **no number** (`pm25: null`). Show the official index row and its band, not an empty or zero number.

IDW (power 2, haversine) uses the nearest station plus any within 1.5× its distance (max 5), all at the same hour.
Within 0.5 km it snaps. The range follows v1.7 and is always present for crowd estimates. Labels:
- official: "Measured at {station} · {km} km · {time} {zone}" (or "Estimate for {place} · range a–b").
- crowd: "Estimate from {n} community sensors · not a government reading", with `range`. Never present a crowd
  estimate as the authority's number.

## 5. The chip: local words for the number they describe (REGIONAL option E)

| country | scale id | chip classifies | words (local / English) | level map (by the authority's advice) |
|---|---|---|---|---|
| SG | `sg_nea_1h` | 1-hr number | Normal · Elevated · High · Very High | 0 · 1 · 2 · 3 |
| TH | `th_aqi` | **published 24-hr Thai AQI** (never the 1-hr number) | ดีมาก · ดี · ปานกลาง · เริ่มมีผลกระทบต่อสุขภาพ · มีผลกระทบต่อสุขภาพ (Excellent · Satisfactory · Moderate · Starting to affect health · Affects health) | 0 · 0 · 1 · 2 · 3 |
| MY | `my_api` | published DOE API (24-hr based) | Baik · Sederhana · Tidak Sihat · Sangat Tidak Sihat · Merbahaya · Kecemasan | 0 · 0 · 1 · 2 · 3 · 3 |
| ID | `id_ispu` | 1-hr number with ISPU breakpoints (BMKG's own practice); falls back to the published ISPU | Baik · Sedang · Tidak Sehat · Sangat Tidak Sehat · Berbahaya | 0 · 0 · 1 · 2 · 3 |
| VN | `vn_aqi` | published hourly VN_AQI (NowCast) | Tốt · Trung bình · Kém · Xấu · Rất xấu · Nguy hại | 0 · 0 · 1 · 2 · 3 · 3 |
| PH | `ph_dao_2020_14` | 1-hr number (DAO categories) | Good · Fair · Unhealthy for sensitive groups · Very Unhealthy · Acutely unhealthy · Emergency | 0 · 0 · 1 · 2 · 2 · 3 |
| LA, KH, MM, TL | none | nothing | no chip: show the number + "{x}× the WHO daily guideline." | none |

Rules:
- Use the scale registry (`BAND_SCALES`, also served at `/v1/scales`) verbatim. Show `labelLocal` in the local
  language UI and `labelEn` in English, and always say whose words they are ("PCD", "DOE", "BMKG").
- `band` (`normal`…`very_high`) is **derived from `level`** and only drives COPY.md's verdict matrix, actions,
  notifications and hysteresis. **It is never shown as a word outside SG.** The chip shows `localBand`.
- Colours: `localBand.color` is the authority's hue. Clients may mute it (v1.2 §11), but must keep the hue family
  (ID "Sedang" is blue, not amber). Keep the shape cue (`circle`/`half`/`triangle`/`octagon`).
- **Never compute an index number** (no "Instant API/ISPU/AQI"). Classify only concentrations the scale defines, or index
  values the authority published.
- Cross-country surfaces (map, compare list, cross-border share) use one neutral µg/m³ ramp with WHO 2021 marks
  (15 / 37.5 / 75) and no band words.

## 6. Official row (always visible when present, smaller)

`officialLine()`: "{agency} {name} ({24-hr|hourly}): {value} · {labelLocal} ({labelEn})", e.g. "PCD Thai AQI (24-hr): 19 ·
ดีมาก (Excellent)", "DOE Malaysia API (24-hr): 96 · Sederhana (Moderate)", "KLH ISPU (24-hr): 168 · Tidak Sehat". The
neutral explainer: "The 24-hr index averages the last 24 hours. The number above is the latest hour." Never write "lagging".
If `official` is null (PH, LA, Makassar, Batam), hide the row. The chart plots hourly bars + `history[].pm25Avg24h`
where the authority publishes a 24-h concentration (TH, MY inverted from a PM2.5-driven API, ID ISPU). Otherwise it plots bars only.

## 7. Verdicts and actions

- `countryVerdict(snapshot, profile)` returns `{headline, short, secondLine, forWhom, headlineLocal, shortLocal,
  secondLineLocal}`.
- **SG:** COPY.md, unchanged.
- **TH:** its own table (`THAI_VERDICTS`, English + Thai, derived from PCD's advice per Thai AQI category, split into
  general / at-risk as PCD does), because the verdict follows the 24-hr Thai AQI while the big number is the last hour.
  The now-signal is the second line, in order: stale → rising ≥ 20 → **"The last hour is higher than the 24-hour
  average. Check again in an hour."** (1-hr ≥ 1.5× and ≥ +15 over the 24-h mean) → easing ≤ −20. Thai strings are drafts
  and need native review.
- **MY, ID, VN, PH:** COPY.md matrix via the level-mapped `band`, until `COPY.<cc>.md` exists. When the chip is an index
  and the hour is well above the 24-h mean, the second line says so ("Nearby sensors read higher than the 24-hour average…"
  for crowd). Stale uses the station-local time.
- **The headline always answers "is it OK to be out?"** (principle 1, amended 30 Sep 2026, COPY.md §10 and §20.1):
  a community estimate in a country with a scale gets that authority's category for the estimate and its verdict,
  prefixed "Estimate: " (chip tagged "estimate", `bandFromEstimate: true`). LA/KH/MM/TL get a WHO-2021-guidance verdict
  (four bands: < 25, 25–50, 50–100, ≥ 100 µg/m³) and a "WHO guide: …" chip, plus the WHO line. "There's no official
  air-quality scale here." and "No official reading near here." are only the small line under the number. When the
  official source is down, that line is "{Country}'s official data isn't responding right now · community sensors estimate".
- Actions: `actions(band, profile)` from v1.2 (masks never first; never N95 for kids). No actions when `band` is null.
- Words stay calm: "for now", no banned words. "Berbahaya"/"Merbahaya" appear only as the authority's band name, never
  in a headline.

## 8. Freshness and polling

- `stale` = `observedAt` older than 2 h 15 min (same as SG). Stations older than that are dropped while fresher ones exist.
  Crowd sensors older than 15 min are dropped.
- **TH direct** (clients): `getAQI_JSON` once per hour at ~hh:30, and `getHistoryData` for the 6 nearest stations from
  hh:02 ICT every 2 min until the newest row is non-null (stop at hh:30), else idle. A `null` in the newest row means "not
  yet", not "offline". Never more than 1 req/min.
- **Proxied countries:** poll `/v1/{cc}/observations` every 5 min in the foreground, and once at hh:10 and hh:20 local in the
  background. The proxy's per-source TTLs follow each publication cycle (DOE settles by ~hh:08–13, BMKG ~hh:17, ISPU ~hh:01,
  Hanoi 5-min data, AirGradient 5 min). Honour 429 `Retry-After`, and on 503 keep the last snapshot with its real age.

## 9. Attribution and sharing

- Render every entry of `snapshot.attribution` (text + link) on the main screen footer and in share images. Crowd data is
  CC BY-SA 4.0 ("AirGradient contributors").
- Share text names the scale and the authority: "PM2.5 142 µg/m³ in Palangka Raya · Sangat Tidak Sehat (ISPU category, BMKG
  hourly) · via HazeNow". Never mix scales in one line.

## 10. Platform notes

- **Android:** `air4thai.pcd.go.th` serves an incomplete certificate chain. OkHttp fails without the Let's Encrypt `YR1`
  intermediate and `Root YR` (X1 cross-sign). Bundle both for that host only (PEMs + SHA-256 in `services/proxy/src/certs.ts`)
  or fetch TH through the proxy. Chrome and Apple platforms complete the chain themselves (verified in Chrome).
- **Web:** TH is direct (CORS `*` on `/forweb/`). Everything else needs `HAZENOW_EDGE`.
- **Swift/Kotlin ports:** port `countries/` 1:1 (scales, borders, builder, verdicts). The fixtures in
  `packages/core/fixtures/sea/` and the vectors below must give identical results.

## 11. Test vectors (v2.0)

- Scales: `id_ispu(55.4)` → Sedang (0), `id_ispu(55.5)` → Tidak Sehat (1). `th_aqi` pm25 15.0 → ดีมาก, 15.1 → ดี, 37.6 →
  เริ่มมีผลกระทบต่อสุขภาพ (2). Index: `th_aqi(101)` → level 2, `my_api(100)` → Sederhana (0), `my_api(101)` → Tidak Sihat (1),
  `vn_aqi(151)` → Xấu (2). `ph_dao(35.1)` → USG (1).
- MY inversion: `myApiToPm25(95)` = 46.5, `(96)` = 47.3, `(71)` = 27.7, `(84)` = 37.9.
- Crowd: EPA(140, 58) = 110.8, EPA(25, 80) = 11.95, EPA(300, ·) ≈ 289.5. k: anchor [100,110,90] vs sensor [80,88,72] → 1.25.
- Borders: (1.436, 103.786) → SG, (1.4655, 103.7578) → MY, (1.13, 104.05) → ID, (17.88, 102.74) → TH, (17.97, 102.63) → LA,
  (20.45, 99.88) → MM, (5, 90) → none.
- Live fixture (2026-09-28 17:00 ICT): Bangkok (13.7563, 100.5018) → pm25 14, `official_1h`, Thai AQI 19 ดีมาก, 24 hourly
  points, 24-h line 11.5. Palangka Raya (−2.2161, 113.9135) → 166, Sangat Tidak Sehat, band `high`, official ISPU 168 Tidak
  Sehat. Kuching → pm25 null, DOE API 96. Vientiane → no chip, WHO line.

## 12. What the client UIs must change

1. Country resolution (§3) and per-place country for saved places. The area picker gains other countries' cities.
2. Nullable `pm25` / `band` and every empty state that follows (number hidden, official row + band only; no-scale state).
3. The chip renders `localBand` (local word + English + agency), not the SG band names, outside SG.
4. Provenance lines for `official_1h` vs `crowd_estimate`, with the range.
5. The official row generalised (§6), plus the 24-h line in the chart only where published.
6. Thai (and later other) verdict strings, `headlineLocal` in local-language UIs, Thai numerals/Buddhist-era dates optional.
7. The attribution footer from `snapshot.attribution`, and share text naming the scale.
8. The `HAZENOW_EDGE` setting, fallback when it is down, 429/503 handling.
9. Android: the Air4Thai certificate fix (§10).

---

# v2.1 — country guess (a relevant first screen, no prompt, nothing sent)

A first-time visitor sees **their** country and a relevant place immediately: no permission prompt, no blocking modal,
no location sent anywhere. Precise location stays opt-in (v1.4). Reference: `packages/core/src/countries/guess.ts`
(`guessCountry`) and `places.ts` (`startPlace`); tests in `packages/core/test/guess.test.ts`.

## 1. Order (a guess never overrides anything, and is never saved)

1. Deep links (`?country&area`, SG `?area` / `?region`, `?lat&lon`) → 2. the saved choice → 3. the country guess → 4. Singapore.
Only the user's own pick is persisted. Until they pick, every launch re-guesses (it's free and offline).

## 2. `guessCountry({timeZone, languages, serverCountry?}) → {country, confidence, reason, place, placeFromZone}`

- **Time zone decides** (`high`): Asia/Singapore→SG · Asia/Kuala_Lumpur→MY (Kuala Lumpur) · Asia/Kuching→MY (**Kuching**) ·
  Asia/Jakarta, Asia/Jayapura→ID (Jakarta) · Asia/Pontianak→ID (**Pontianak**) · Asia/Makassar, Asia/Ujung_Pandang→ID
  (**Denpasar**, a suggestion only: the zone also covers Sulawesi and Lombok) · Asia/Ho_Chi_Minh, Asia/Saigon→VN (Hanoi) ·
  Asia/Manila→PH (Metro Manila) · Asia/Vientiane→LA · Asia/Phnom_Penh→KH · Asia/Yangon, Asia/Rangoon→MM · Asia/Brunei→BN ·
  Asia/Dili→TL. Otherwise the place is the country's `defaultPlace` (capital or most-populous covered city).
- **Asia/Bangkok is shared** by TH, VN, LA and KH. The language (`vi`/`lo`/`km`, or a region subtag such as `en-VN`) picks
  VN/LA/KH (`medium`), `th` confirms TH (`high`), anything else is TH `low`.
- **Languages only break ties.** Map: th→TH, vi→VN, id/in→ID, ms→MY, fil/tl→PH, lo→LA, km→KH, my (Burmese)→MM, tet→TL. A SEA
  region subtag wins over the language (`zh-SG`→SG, `ms-BN`→BN). The first matching tag in preference order counts. If it names a
  different SEA country than the zone, the zone still wins at `medium`.
- **A non-SEA zone** (Europe/London, Asia/Tokyo…) → `country: null`, `medium`, languages ignored. **No usable zone** (missing,
  UTC, Etc/*) → the languages at `low`, else null `low`.
- `serverCountry` (web only, see §4) settles the ties: the shared Bangkok zone, a zone/language clash, or a missing or non-SEA zone.
  XX and T1 are ignored.

## 3. `startPlace(guess) → {place, notCoveredFrom, outside, fromZone}`

The suggested place if covered (`live_direct`/`needs_proxy`), else the country default, else the **nearest covered major city**
(MM→Chiang Mai, BN→Kota Kinabalu, TL→Makassar; KH now starts in Siem Reap, its default) with `notCoveredFrom` set. `country: null` → Singapore, `outside: true`.

## 4. UX (all clients)

- **Sure guess (`high`, not SG):** render that place at once, with one calm line above the reading: "Showing Bangkok · Change"
  and a quiet "Use my precise location" (the v1.4 explainer still comes before any OS prompt).
- **Not covered:** "Myanmar isn't available yet. Showing Chiang Mai, the nearest place we cover. Change".
- **Unsure guess** (`country: null`, or confidence below `high`): still render the default reading (Singapore, or the guessed
  place), and under it a non-blocking card, "Where are you checking?", with a chip per country that opens that country's places.
- **Singapore (`high`) is unchanged**: the v1.4 first-run card, pixel for pixel.
- **"Change" opens a two-step sheet.** Step 1 lists the countries, each with its name, a status chip (Live / Preview / Not yet) and
  the current band dot when a reading is loaded. Step 2 is that country's places: Popular first (`placeGroups`), then all cities
  (SG: its 55 areas), then "Use my precise location". One search box at the top searches every country and alias ("Bali",
  "Penang", "KL", "Saigon", "Tampines"). Back returns to countries. Accessible (dialog, focus moves to the step heading, Escape
  closes); full height on phones.

## 5. Web-only server hint

`GET /api/where` (Cloudflare Pages Function in `apps/web/functions` and `apps/site/functions`) returns only
`{"country":"TH"}` from `request.cf.country`, with `Cache-Control: no-store`: no logging, no IP/city echoed, no cookies. Clients
call it only when `wantsServerHint(guess)` (confidence below `high`), never before the first render, and only move a view the
visitor hasn't touched. Privacy text wherever it may be used: "We use your country, from your connection, to pick a starting
place. Nothing is stored." Only `/api/*` invokes the Function (`_routes.json`), so the Workers free tier (100k requests/day)
covers it. Over quota it just fails and the device guess stands.

## 6. Native (Apple, Android): mirror without any network

- **Apple:** `TimeZone.current.identifier` and `Locale.preferredLanguages` → `guessCountry` (Swift port of `guess.ts`, the same
  tables) → `startPlace`. Don't call `/api/where`, and don't use `Locale.current.region` as a strong signal (it's the user's
  format setting, not where they are), though it may break ties like a language region subtag.
- **Android:** `TimeZone.getDefault().id` (or `ZoneId.systemDefault()`) and `LocaleList.getDefault()` (tags in order) → the same.
  `TelephonyManager.networkCountryIso` needs no permission and may stand in for `serverCountry` on phones with a SIM. It's
  optional, and it's on-device.
- Unsure guesses show the "Where are you checking?" card. No blocking onboarding screen, and no location prompt until the user taps.
- Port the test table in `guess.test.ts` (every zone, Bangkok ties, clashes, unknown zones, languages only) as fixtures.

