# Thailand coverage hunt: the "Not available yet" places

Country: **Thailand**. Scope: every Thai place in `packages/core/src/countries/places.ts` marked `not_feasible`
("Not available yet") — Koh Phi Phi, Koh Lanta, Koh Samui, Koh Phangan, Koh Tao, Koh Chang, and Pai — plus a
sanity check on Hua Hin (already `live_direct`, confirmed still fine). All live calls below were run
**2026-09-30, 08:00–08:06 UTC (15:00–15:06 ICT)**, with a polite single-client UA
(`HazeNow-coverage-hunt/0.1 (+https://github.com/yongquantan/hazenow; research)`),
one request per endpoint, respecting robots.txt. Output written only to this file and `th.json`; no code touched.

## TL;DR

- **Pai is coverable today, and it's a build decision, not a permissions problem.** AirGradient has **21 live
  outdoor sensors within 10 km of Pai (22 within 25 km)**, all reporting ~1 minute old at capture time, CC BY-SA
  4.0, no key. HazeNow's Thai adapter (`th.air4thai`) is official-stations-only today; MY/ID/VN/PH/LA already
  have the AirGradient crowd layer wired in (`crowd.ts`). Extending the same mechanism to TH unlocks Pai. No new
  external agreement is needed for this source. **Trust: medium** — good hardware and diverse civic ownership, but
  no nearby official anchor to calibrate against, one likely-outlier sensor, and no multi-day uptime data yet
  (see §Pai below).
- **None of the six islands (Phi Phi, Lanta, Samui, Phangan, Tao, Koh Chang) have official or community coverage
  today**, in any network I could check live (Air4Thai, AirGradient, Sensor.Community; DustBoy's public feed and
  PurpleAir/IQAir are gated, see below). Koh Chang is the closest near-miss: an official station 29.4 km away and
  a community sensor 30.1 km away, both just outside the 25 km rule.
- **DustBoy's legitimate access route, found without a scraped token:** register a free account at
  `open-api.cmuccdc.org`, which issues a `Bearer` API key. The **general-public tier is capped at 10 stations
  and outdoor-only**, confirmed today from their own English terms page. To get more, **email `dustboy.3e@gmail.com`
  or call `064-069-1698`** and ask for expanded access "on a case-by-case basis" — CCDC's own published access
  matrix has broader tiers for affiliated organisations, students/researchers, NGOs, private orgs, government
  agencies and MOU partners. Mandatory attribution is spelled out verbatim (see §DustBoy). I did **not** use the
  scraped `getDustBoyGeo` token+cookie route, and did not fetch the no-auth `/api/ccdc/stations` registry, which
  thailand.md already flagged as leaking caretakers' names and phone numbers — that data should never be cached
  by HazeNow either way.

## Method

1. Re-pulled the **live Air4Thai station list** (`forweb/getAQI_JSON.php`, 173 stations, same count as
   thailand.md/COVERAGE.md — no new stations added since 2026-09-28) and computed haversine distance from every
   target place to all 173 stations, to make sure no island/mobile/provincial station was missed.
2. Queried **AirGradient's public map API** for a Thailand bounding box (`map-data-int.airgradient.com/map/api/v1/measurements/current/area`,
   411 rows: 257 AirGradient, 141 OpenAQ/Air4Thai-mirrored, 13 Sensor.Community) and the **world locations API**
   (`api.airgradient.com/public/api/v1/world/locations/measures/current`, 2,868 rows worldwide) for per-sensor
   `model` (the `O-`/`I-` outdoor/indoor prefix).
3. Queried **Sensor.Community's** country filter (`data.sensor.community/airrohr/v1/filter/country=TH`, 12 unique
   locations nationally today).
4. Read **CCDC's Open API documentation site** (`open-api.cmuccdc.org`, English version) in full for its terms,
   access tiers and contact channel — this is the "legitimate route" requested, found via the site's own docs,
   not a scrape.
5. Checked **PurpleAir**'s public API (`api.purpleair.com`) and `robots.txt`, and **IQAir**'s Thailand page and
   `robots.txt`, to record what's blocked and why.
6. Did **not** re-fetch the DustBoy `getDustBoyGeo` website feed (needs a scraped token + session cookie — out of
   scope per the brief) and did **not** fetch `www.cmuccdc.org/api/ccdc/stations` (no token needed, but
   thailand.md flags it as leaking personal data — not something to build on).

## Distances (haversine, live today)

| place | nearest official (Air4Thai) | km | nearest AirGradient | km | nearest Sensor.Community | km |
|---|---|---:|---|---:|---|---:|
| Koh Phi Phi | 119t Thara Public Park, Krabi | 37.7 | Supalai Lake Ville, Phuket | 50.8 | — | >50 |
| Koh Lanta | 119t Thara Public Park, Krabi | 50.5 | Supalai Lake Ville, Phuket | 86.1 | — | >80 |
| Koh Samui | 42t Environment Agency Sect. 14, Surat Thani | 92.3 | Supalai Bella, Thalang | 251.2 | — | >130 |
| Koh Phangan | 42t Environment Agency Sect. 14, Surat Thani | 101.6 | Supalai Bella, Thalang | 263.4 | — | >150 |
| Koh Tao | 118t Sports Stadium, Chumphon | 83.9 | "Hana" | 249.4 | — | >180 |
| Koh Chang | 87t Trat Provincial Central Stadium | **29.4** | "Trat" | **30.1** | — | >250 |
| Pai | 58t Natural Resources & Env. Office, Mae Hong Son | 49.5 | **Pai Immigration** | **0.35** | — | >80 |
| Hua Hin (sanity check) | 103t Hua Hin Weather Station | 1.1 | — | — | id 62589 (Hua Hin) | ~0 |

Both Air4Thai and AirGradient counts match COVERAGE.md's 2026-09-28/29 captures almost exactly (173 stations;
AirGradient's Thailand bbox today: 257 live AirGradient rows vs 141 on 2026-09-29 in a different, smaller SEA-wide
bbox — the totals aren't directly comparable, but nothing changed structurally). **No island or Pai-area station
was added to Air4Thai since the last capture.** Confirms COVERAGE.md's numbers rather than finding anything new
on the official side.

---

## Per-place verdicts

### Koh Phi Phi, Koh Lanta, Koh Samui, Koh Phangan, Koh Tao — no coverage

All five are 38–102 km from the nearest Air4Thai station (outside the 25 km rule) and 50–263 km from the nearest
live AirGradient sensor (outside even a generous 25 km community radius). Sensor.Community has nothing within
50 km of any of them (its entire Thai footprint today is 12 locations, mostly around Bangkok/Khon Kaen/Hua Hin
and one at Patong, Phuket). I found no PurpleAir or IQAir data I could read (see §Gated sources) and no evidence
in any queried network of a DustBoy unit on these islands — DustBoy's documented footprint is concentrated in the
north (Chiang Mai, per thailand.md's "101 in Chiang Mai province"), and there is no public, no-token way to check
southern coverage without either the scraped token or the PII-leaking registry, both out of scope here.

**Verdict: no coverage. Unlocked only by (a) a PCD/Air4Thai station on the island itself (authoritative — PCD is
the only one who can add one), or (b) at least two community sensors within 10 km, from any network, plus
HazeNow's Thai feed reading community sensors at all (see §Pai — the same build gap).** Today, condition (b)'s
sensor count is zero for all five islands, so this is a "nothing to ingest yet" gap, not a permission gap.

### Koh Chang — no coverage, but the closest near-miss

87t Trat Provincial Central Stadium is **29.4 km** away (official rule cutoff is 25 km) and one AirGradient sensor
named "Trat" is **30.1 km** away (also outside a 25 km community radius, and alone — the community-sensors-only
rule elsewhere in the app requires **two** sensors within 10 km, so even inside 25 km this wouldn't qualify).
I'm not proposing any rule change — COVERAGE.md's "no stretching" principle is there on purpose (Phuket's own
example shows why). Flagging this only so the team knows Koh Chang is the nearest thing to already-covered among
the six islands: one more community sensor near Klong Prao/White Sand Beach, or a PCD station on the island,
would do it.

**Verdict: no coverage. What would unlock it: a PCD station on Koh Chang, or two community sensors within 10 km
of the island (there's currently one, 30 km off the island, plus HazeNow's Thai feed reading community sensors).**

### Pai — community only (trust: medium)

**This is the one place where coverage exists today and isn't being read.** AirGradient's world API shows a dense,
live cluster right in town:

- **21 outdoor sensors within 10 km, 22 within 25 km**, all `offline: false`, all timestamped ~1 minute before the
  capture (08:04–08:05 UTC = 15:04–15:05 ICT).
- **Hardware:** all but one report a model string, and every one of them is an **AirGradient outdoor unit**
  (`O-1PP` or `O-1PST` — both use Plantower PMS5003-family sensors per AirGradient's own spec, consistent with
  thailand.md's "PMS5003(T) ×2" note for the country as a whole). One sensor ("Vieng Nua, Pai", 1.87 km, 12.0 µg/m³)
  reports `model: null` in this pull — likely an older firmware that doesn't publish the model string, not
  necessarily indoor; its reading sits inside the cluster's normal range, so I'm not excluding it, just flagging
  it as unconfirmed hardware.
- **Owner type — genuinely diverse, which is a trust positive:** government/civic (Pai Immigration, NT/TOT
  telecom office, Mae Khong Border Patrol post), health (Dr. Neung Clinic, Mae Ping Health Center), education (Mae
  Na Toeng School, Pa Yang School), religious (Wat Phra Phutthabat, Wat Mo Paeng), a public market (Wednesday
  Market), and several tourism businesses (guesthouses, cottages, a goat farm, Tha Pai Hot Springs, an art
  gallery). This isn't one household's cluster — it's spread across the kind of civic infrastructure AirGradient's
  Thailand deployment favours nationally (schools, hospitals, temples — matches COVERAGE.md's Bali pattern too).
- **Agreement with a nearby official anchor: not computable.** The nearest Air4Thai station (58t, Mae Hong Son
  city) is **49.5 km away, over a mountain range, in a different valley** — Pai and Mae Hong Son town are separate
  basins with their own inversion behaviour, so even inside the codebase's existing `biasFactor()` machinery
  (`crowd.ts`), this pair would fail the "anchor within a sane radius" precondition long before it reached the
  ≥6-hour-pairs correlation check. **`k` would stay `null`, "uncalibrated"** — the same status PH/LA/KH crowd
  sensors already ship with, per `crowd.ts`'s own design. This is a real trust ceiling, not a data-quality flaw:
  Pai's number would be shown as a community estimate, same UX pattern as Bali or Luang Prabang, not a calibrated
  1-hr figure.
- **Cross-sensor agreement, spot-checked today:** readings ranged **3.3–23.8 µg/m³**, median ≈ 6.8, consistent
  with the region's clean rainy-season baseline (thailand.md: national median 7.2 on 2026-09-28). One reading
  stands out: **"Pai: NT/TOT office near Pai Hospital" at 23.8 µg/m³, 0.46 km out — about 3.5× the 21-sensor
  median.** Run through the codebase's own outlier rule (`crowdQc` in `crowd.ts`: flag when the neighbour median
  > 5 and the value > 3× that median), this sensor **would be flagged `outlier` today** and excluded from the
  snapshot. I'd exclude it pending a recheck (dust from the adjacent PTT gas station forecourt is a plausible
  local source, but that's a guess, not a finding) — the other 20 sensors are tightly clustered and look healthy.
- **Uptime over 7–30 days: unverified.** I only have one live snapshot (all 21 online at capture time, which is
  a good sign but not a multi-day track record). Before launch, the proxy should log this cluster hourly for at
  least a week and drop any sensor with material gaps, same as the QC bar the app already applies elsewhere.
- **Freshness:** excellent at capture — median age ~1 minute, matches AirGradient's documented ~1 min cadence.

**Verdict: community only, trust medium.** The data is open (CC BY-SA 4.0, no key, no permission needed — the
same source already powers MY/ID/VN/PH/LA in this codebase), fresh, and diversely sourced, but uncalibrated
(no usable official anchor nearby) and unvetted for uptime beyond a single snapshot. **What unlocks it: extending
HazeNow's Thai adapter to read AirGradient sensors, the way `crowd.ts` already does for five other countries** —
this is an engineering/product decision, not a data-access blocker. I'm not proposing that code change here (out
of scope for this doc), only confirming the data exists and characterising its trust.

---

## DustBoy (CMU CCDC): the legitimate access route

Read in full today at `open-api.cmuccdc.org` (English toggle: `?lang=english`) — this is CCDC's own developer
documentation site, not a scrape.

**How the sanctioned API works:**
1. Register a user account at `open-api.cmuccdc.org` and wait for verification ("according to your user type").
   The system then issues an **API key**.
2. Every request sends it as `Authorization: Bearer {your_api_key}`.
3. **Terms of use, quoted from their own English page (verified live today):**
   > "General public users may call the API to retrieve data from up to **10 installation points** per account.
   > If additional API access is required, please **contact the CCDC to request special permission on a
   > case-by-case basis**."
   > "This API provides data only from **outdoor** installation points. If a user requires data from indoor
   > installation points … a request must be submitted to the CCDC on a case-by-case basis for approval."
   > "Users who display data obtained from the API on other platforms **must cite the source** … using wording
   > such as *'This data is supported by the Climate Change Data Center, Chiang Mai University (CCDC CMU)'* or
   > *'Data from the DustBoy air quality monitoring device'* … or display the DustBoy or CCDC CMU logo … **If the
   > CCDC finds the source is not cited as required, the Center reserves the right to suspend API access without
   > prior notice.**"
   > "Applicants … consent to the CCDC using their registration data to develop/improve/expand the DustBoy
   > project, without disclosing any personal data, and permit the logging of computer traffic data in
   > accordance with the Computer Crime Act."
4. **Contact for expanded access (the legitimate route past the 10-station cap):**
   **Email `dustboy.3e@gmail.com`**, or **phone `064-069-1698`**.
5. The docs publish an **access-tier matrix** ("Data Access by User Type"): general public vs. affiliated
   organisation vs. students/researchers vs. NGO vs. private organisation vs. government agency vs. MOU
   organisation each get different allowed/not-allowed combinations across the DustBoy endpoints (per-station,
   per-province, per-health-area, per-region, all-points, 30-day/1-year/5-year/all-time history). A civic,
   MIT-licensed app like HazeNow plausibly fits "NGO" or "private organisation," but which tier (and whether it
   waives the 10-station cap) is CCDC's call, made case-by-case — that's a conversation for HazeNow's maintainers
   to have with CCDC directly, not something resolvable from outside.

**What I did not do, per the brief:** I did not use the `getDustBoyGeo` website feed's scraped token+`ci_session`
cookie route (thailand.md already documented it as "not sanctioned for third-party use" and gated behind a
page-embedded token). I also did not fetch `www.cmuccdc.org/api/ccdc/stations` — it needs no token and is
CORS `*`, but thailand.md flags it as containing caretakers' real names and phone numbers, and that's not a
dataset HazeNow should touch regardless of auth. Both of those mean I could not verify, live, whether DustBoy has
any presence on the six islands or an additional cluster near Pai beyond the AirGradient one documented above —
that answer requires either the sanctioned API (with a key) or a partnership conversation, not a workaround.

**Hardware:** thailand.md marks DustBoy's sensor model "Plantower-class, unverified." I could not confirm the
exact part number from the public documentation site either (its DustBoy section lists station metadata fields —
ID, location, URL, **Model** — behind the keyed API, not in the public docs). Model registrations like
`"dustboy_version":"mini"` (from the earlier PII-flagged registry dump in thailand.md) suggest DustBoy ships
hardware variants ("mini" and presumably others), but the exact particulate sensor part number stays unverified
without a key.

## Gated sources: PurpleAir, IQAir, Sensor.Community

- **PurpleAir:** `api.purpleair.com/v1/sensors` returned `403 ApiKeyMissingError` today (no key, as expected —
  it's a paid-points API, confirmed unchanged from thailand.md). `purpleair.com/robots.txt` disallows `/api/`
  wholesale except a short allow-list of store/blog/community paths — scraping the public map's sensor layer to
  get even a bare count would mean hitting disallowed paths, so I didn't. **No sensor count available without a
  paid key; respecting robots means not trying to work around that.**
- **IQAir:** `iqair.com`'s Thailand page returned a **Vercel bot-protection checkpoint** page today (not the
  429 thailand.md saw on 2026-09-28, but the same practical outcome: blocked). Terms are unchanged from
  thailand.md's finding ("no redistribution, same as SG") and I did not attempt to bypass the checkpoint.
- **Sensor.Community:** legitimately open (`data.sensor.community/airrohr/v1/filter/country=TH`, no key, ODbL),
  but Thailand's entire footprint today is **12 unique locations**, none within 50 km of any of the six islands
  or Pai. Not useful for this hunt, but confirmed live and working.

## The 25 km rule and borders

Every distance above is haversine from the exact point in `places.ts`, matching `DESTINATION_RADIUS_KM = 25` and
the "official ≤25 km / community ≥2 sensors ≤10 km" rules from COVERAGE.md. No station or sensor from Myanmar,
Laos, Cambodia or Malaysia was considered for any of these places — Pai (19.36°N, 98.44°E) is close to the
Myanmar border but its nearest sensors are all Thai-side AirGradient units in Pai town itself, and the nearest
Air4Thai station I used (58t) is in Mae Hong Son, Thailand. No cross-border data was proposed anywhere in this
doc.

## Unverified / flagged

- The `model: null` AirGradient sensor near Pai ("Vieng Nua, Pai", 1.87 km) — hardware/indoor status unconfirmed.
- Whether DustBoy has stations on any of the six islands or additional Pai-area coverage — not checked, requires
  a keyed API call or a scrape I was told not to do.
- DustBoy's exact PM sensor part number — not published outside the keyed API.
- Whether HazeNow would qualify for an above-10-station DustBoy tier, and which tier — CCDC's call, not
  verifiable from outside.
- GISTDA's modelled/satellite PM2.5 layer (`pm25.gistda.or.th`) covers all seven places by interpolation, but
  it's a model, not a measurement station, so it doesn't fit any of the three `kind` values in `th.json` and
  isn't proposed as a source here — noted only as the existing map-layer option from thailand.md.
