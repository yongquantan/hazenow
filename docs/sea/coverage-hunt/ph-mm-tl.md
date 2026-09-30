# Coverage hunt: Philippines, Myanmar, Timor-Leste

Live re-verification run on **2026-09-30, ~08:00-08:10 UTC (16:00-16:10 PHT/SGT, 14:30-14:40 MMT, 09:00-09:10 TLT)**,
one polite client (`HazeNow-coverage-hunt/0.1`), sequential requests, no CAPTCHA/login/rate-limit bypass attempted.
Builds on `docs/sea/philippines.md` and `docs/sea/cambodia-laos-myanmar.md` (2026-09-28 captures) and
`docs/sea/COVERAGE.md`'s "Popular destinations" table. Targets: every PH/MM/TL place marked "Not available yet",
"Needs permission" or "Not feasible" in `packages/core/src/countries/places.ts` -- Cebu, Davao, Boracay, El Nido,
Puerto Princesa, Siargao, Coron, Panglao, Yangon, Mandalay, Dili (12 places; Metro Manila is already "needs_proxy"
and out of scope except as context).

**Nothing here changes the coverage verdict for any place except Yangon**, whose sole sensor went from "reads 0.0,
suspect" (28 Sep) to a plausible, high-uptime reading today. Full evidence and a proposed-mapping row per place is in
`ph-mm-tl.json`. Web-search budget for this session ran out mid-hunt (shared across the swarm); every claim below
either came from a direct `curl`/fetch made today, or is explicitly marked **unverified**.

---

## 1. What's still blocked (verified again today)

| source | result today (2026-09-30) | notes |
|---|---|---|
| `emb.gov.ph` | 403, Cloudflare "Just a moment..." managed challenge, even on `/robots.txt` | Unchanged from 28 Sep. Guessed regional paths `/region-7/`, `/region-11/` and subdomains `r7.emb.gov.ph`, `r11.emb.gov.ph` (Cebu = Region VII, Davao = Region XI) also 403; `embro7.emb.gov.ph` doesn't resolve. **Stopping here per instructions** -- did not attempt to solve the challenge. |
| `air.emb.gov.ph` | 403, Azure WAF ("Azure WAF" title) | Unchanged. No documented API found anywhere public. |
| Breathe Metro Manila / Clarity | `clarity-data-api.clarity.io/v1/open/all-recent-measurement/pm25/individual` -> **401** without a key (unchanged) | The public map at `map.clarity.io/breathe-metro-manila/...` ("Clarity OpenMap") is a JS single-page app; its data calls happen client-side and weren't reverse-engineered (would mean picking apart minified JS bundles, more invasive than "one polite client" scraping). Still needs a key/MoU. |
| US Embassy AirNow (Manila) | **Gone.** `files.airnowtech.org/airnow/today/monitoring_site_locations.dat` (20,406 rows) has **zero** non-US rows today -- no `608PH1010001` (Manila), no Yangon entry, and no rows with a non-`|US|` country field at all. Hourly `.dat` files for 5 UTC hours today: 0 rows for the old Manila site ID. | This is a **change** worth flagging, not just a repeat of "not reporting" -- on 28 Sep the site still existed in the list (just empty of readings); today the whole international layer seems to have been dropped from this particular file, or moved. **Unverified** whether this is a schema change, a discontinued embassy programme, or a wrong file path. |
| PurpleAir | `api.purpleair.com/v1/sensors` -> `ApiKeyMissingError` (unchanged). `map.purpleair.com` loads (200) but sensor markers load via its own JS/tile calls, not inspected. | Can't get even a bare count without a key or deeper scraping than intended. |
| IQAir | Cebu City page: **AQI 52 / PM2.5 9.6 ug/m3, explicitly labelled "Data provided by a satellite-derived model"** -- i.e. not a real station. Davao page 404s under the slugs tried. Philippines country page: "126 stations from 91 contributors" (generic boilerplate, likely reused across every country page) but none of Cebu/Davao/Boracay/Palawan/Siargao/Bohol show up in its ranked list. | Confirms Cebu has no real ground sensor of any kind today (official or community) -- IQAir is falling back to a model. |
| USC (University of San Carlos, Cebu) | Homepage has no mention of an air-quality network, sensor, or research feed | One check only; a deeper site crawl wasn't done. |
| Manila Observatory | Own site (`observatory.ph`) has no separate public feed beyond its AirGradient node and Breathe Metro Manila membership (both already known) | Confirms Manila Observatory's public presence *is* its AirGradient sensor, not an extra source. |
| Myanmar DMH (`moezala.gov.mm`) | 200, still no air-quality content (re-checked, not re-read in full) | Unchanged from 28 Sep. |
| Myanmar ECD (`ecd.gov.mm`) | Connection failed (unchanged) | — |
| Timor-Leste government sites | Four guessed domains (MetMG, gov.tl, SAAME, SEPFOPE) all failed to resolve | **Unverified** -- I did not find Timor-Leste's actual environment-ministry domain; this is a gap in the hunt, not proof no feed exists. |

---

## 2. Per-place verdict

### Philippines

| place | verdict | evidence today | what would unlock it |
|---|---|---|---|
| **Cebu** | **No coverage.** Authoritative permission (EMB Region VII) is the realistic long path; no community shortcut exists yet. | 0 AirGradient within 25 km (nearest 110 km, Bacolod), 0 Sensor.Community within 30 km, IQAir uses a satellite model, USC has nothing public. | EMB feed/permission, or 2 community sensors seeded in Cebu City (nothing today to build on). |
| **Davao** | **Community sensor exists but out of range** -- not coverable today. Closest of the "not_feasible" PH cities to a fix. | 1 AirGradient sensor ("Illumina", ag:16313337) 19.4 km from the city point: high trust by uptime/plausibility (see §3), but past both the 10 km community-pair rule and the 25 km official-station rule. | One more outdoor sensor within 10 km of Illumina (or of central Davao) turns this into "community sensors only". EMB permission is the alternative path. |
| **Boracay, El Nido, Puerto Princesa, Siargao, Coron, Panglao** | **No coverage**, all six. | 0 AirGradient and 0 Sensor.Community within 25-30 km of every one (nearest ranges 124-319 km; see `ph-mm-tl.json` for exact distances). No provincial EMB feed found for Aklan, Palawan (El Nido/Puerto Princesa/Coron all share one, still nothing), Surigao del Norte or Bohol. | 2 community sensors per destination (cheapest, per `COVERAGE.md`'s existing ranked list). No authoritative path identified for any of them. |

### Myanmar

| place | verdict | evidence today | what would unlock it |
|---|---|---|---|
| **Yangon** | **Community sensor only, and not enough of them** -- 1 valid sensor, need 2. Upgraded from "not feasible / suspect" to "one sensor away from coverable". | The one AirGradient sensor (ag:11907081, 4.1 km from the picker point) now reads a plausible 11.4 ug/m3 with a normal diurnal pattern over 14 days (see §3) -- the earlier "stuck at 0.0" fault from 28 Sep appears resolved. DMH/ECD still have no public feed. | One more outdoor community sensor within 10 km of central Yangon. No authoritative path (DMH is Facebook-only per press reports, unverified; ECD unreachable). |
| **Mandalay** | **No coverage.** Authoritative permission is the only realistic path, and none is on offer. | 0 sensors of any network within Myanmar; nearest anything is a Thai school sensor ~372 km away (cross-border, irrelevant). No "Purple Mandalay" network could be confirmed -- **unverified**, not ruled out, because web search ran out and a keyed PurpleAir check wasn't possible. | 2 seeded sensors, or an ECD/DMH data agreement (politically sensitive, per `cambodia-laos-myanmar.md`'s note on post-2021 state-body attribution). |

### Timor-Leste

| place | verdict | evidence today | what would unlock it |
|---|---|---|---|
| **Dili** | **No coverage, least-instrumented place in the hunt.** | AirGradient map API for a Timor-Leste-wide bbox returned **0 rows nationwide**, not just near Dili. Sensor.Community: 0. No government feed located (**unverified** -- the correct ministry domain wasn't found, not confirmed absent). | 2 seeded sensors -- there is currently nothing to build on at all, official or community, anywhere in the country. |

---

## 3. Trust assessment: the two live community-sensor candidates

Both are AirGradient "Open Air" outdoor units (Plantower PMS5003T-class optical counter + RH), the same hardware
family already used for SG/TH/ID in this app.

| criterion | **Illumina (Davao)**, ag:16313337 | **Yangon**, ag:11907081 / world:171532 |
|---|---|---|
| Hardware | Outdoor "Small Sensor" per map API (not flagged `(Indoor)`); model unresolved in the world dump today (that dump is a partial subset, a known issue -- see `philippines.md` §truncation note) | O-1PST, firmware 3.7.0, confirmed via world API |
| Outdoor/indoor | Outdoor (unflagged) | Outdoor (unflagged) |
| Uptime, last 14 days | 344/336 expected hourly buckets (>=100%, effectively no downtime) | 176/168 expected hourly buckets over 7 days (>=100%) |
| Freshness | Live, last reading 2026-09-30T07:59Z (~10 min old at capture) | Live, last reading 2026-09-30T08:01Z (~9 min old at capture) |
| Faults | 1 zero-value hour out of 336 (0.3%) -- normal noise floor, not a stuck sensor | **2 zero-value hours out of 176 (1%) -- much improved vs 28 Sep, when it was reading a flat, unmoving 0.0 continuously.** Today's series has a believable night-time rise (23.5 -> 41.5 ug/m3 between 22:00-00:00 UTC, 29-30 Sep) that a stuck sensor wouldn't produce. |
| Owner type | Unattributed on the public map (generic AirGradient contributor, no operator name surfaced) | Same -- unattributed |
| Location precision | Named "Illumina" (likely a building/subdivision), coordinates land in urban Davao (Talomo-area) -- precision looks reasonable for a street-level siting, not independently field-verified | Named "Yangon" only, coordinates land centrally in the city -- same caveat |
| Agreement w/ official/embassy monitor | **Can't be checked.** No EMB station reachable for Davao; no AirNow Manila/Yangon row exists today (see §1) | Same -- no reference to compare against |
| **Trust rating** | **Medium-high** on hardware/uptime/plausibility grounds alone, but **unusable alone**: 19.4 km from the Davao city point, past both the 10 km (community-pair) and 25 km (official) thresholds, and there is no second sensor to pair it with | **Medium**: same hardware/uptime story, plus a documented recovery from an earlier fault, but it is still a **single** sensor, and HazeNow's own rule requires 2 within 10 km before treating community data as a cross-checked estimate. No independent monitor exists to validate accuracy, only plausibility (diurnal shape, non-zero variance) |

Neither candidate is proposed for shipping today. Both are recorded because they are the closest either country
comes to a fix, and because Yangon's fault-recovery is new information worth flagging to the founder.

---

## 4. Second task: Singapore's 14 AirGradient outdoor sensors, trust for future hyperlocal use

Re-pulled live today (2026-09-30, ~08:04-08:05 UTC / 16:04-16:05 SGT) via the same map API used for SG today in
production. **15 rows in the SG bbox**, one of which ("Eco Botanic", ag:119362966) is in Johor, Malaysia, across the
border -- excluded below per the cross-border rule, leaving **14 SG sensors**, matching `DATA_SOURCES.md`'s count.
Hardware is uniformly AirGradient's "Open Air" family (O-1P / O-1PS / O-1PST / O-1PST-CE), all outdoor.

NEA's five regions at capture time (hour ending 16:00 SGT, published 16:01:26): north 30, east 39, central 54,
west 52, south 30 ug/m3 -- a fast-clearing day (air had been 45-75 ug/m3 in most zones an hour earlier, per each
sensor's own hourly history, then dropped sharply in the 07:00-08:00 UTC bucket). That drop matters for reading the
table below: the "now" values look anomalously low next to NEA's 1-hour trailing average because NEA's number still
includes the higher first half of that hour, while the sensors' "current" field is a near-instantaneous read taken
after most of the drop. Comparing each sensor's **own 04:00-06:00 UTC hourly buckets** (before the clearing) to NEA's
region is a fairer like-for-like check, and is what's used in the "agreement" column.

| sensor | model | 14-day uptime | zero/stuck hours | 04:00-06:00 UTC trend (ug/m3) | nearest NEA region (same window, qualitative) | trust |
|---|---|---|---|---|---|---|
| Midwood | O-1PS | 344/336 (~100%+) | 0 | 45.5 -> 45.4 -> 55.1 | central (elevated, plausible) | **High** |
| Potong Pasir | O-1PST | 344/336 | 0 | (not sampled this pass, same network profile as Midwood/Shelford) | central | **High** (by uptime/history) |
| Shelford | O-1PST | 344/336 | 0 | — | south/central boundary | **High** |
| CGB | O-1P | 344/336 | 0 | 30.7 -> 29.4 -> 28.0 | south (in range) | **High** |
| Alexandra Canal | O-1PST | 344/336 | 0 | 52.5 -> 58.0 -> 52.4 | south (plausible, slightly hot pocket) | **High** |
| Marine Terrace | O-1PST | 344/336 | 0 | steady, but **one 464.7 ug/m3 spike on 18 Sep 14:00 UTC** in the 14-day window | east | **High with a flag** -- isolated single-hour spike, not sustained; worth a bounds check (e.g. reject >400 as an outlier) before using this sensor unattended |
| Sembawang | O-1PST-CE | 335/336 (~99.7%) | 0 | 43.3 -> 42.1 -> 46.0 | north (a bit higher than NEA's 30, but same order of magnitude) | **High** |
| Joo Chiat Place | O-1PST | 340/336 | 0 | 56.3 -> 52.4 -> 30.8 | east (in range, converging toward NEA's 39 as the hour ends) | **High** |
| Jalan Tembusu | O-1PST | 138/336 (~41%) | 0 | 75.4 -> 63.3 -> 32.3 | east (runs noticeably hot vs NEA's 39, though still same order) | **Medium** -- history has real gaps (only 41% of expected hours present over 14 days), so it drops offline periodically |
| Marina Bay | O-1PST | 284/336 (~85%) | 0 | 59.9 -> 60.8 -> 31.1 | south (runs hot vs NEA's 30, but again converges by end of hour) | **Medium-high** |
| "Singapore" (Bugis-area) | O-1PST | 265/336 (~79%) | 0 | — | central | **Medium-high** |
| NUS Science A | (model not resolved this pass) | **13/336 (~4%)** over 14 days; only 6 of the last 48 h present | 0 in the sparse sample, but effectively **mostly offline** | 0.7 -> 0 -> 1.4 -> 2.3 (very low, near-zero) | south | **Low** -- too little history to trust; largely offline |
| NUS Science B | (model not resolved this pass) | **4/336 (~1.2%)** | n=4 only | 17.3 -> 16.6 -> 16.6 (flat) | south | **Low** -- almost no history; and the two "NUS Science" units, sited within ~10 m of each other, disagree by **10x** in their latest readings (1.4-1.8 vs 16.6-17.3 ug/m3) when both happen to report -- a real co-location disagreement, not explained by distance. Don't trust either alone; needs the AirGradient/NUS team to check calibration or siting (one may be more sheltered/rooftop). |
| Nathan Rd | O-1PST | **25/336 (~7.4%)** | 0 | 42.9 -> 33.4 -> 43.4 | central/south | **Low** -- newly added or intermittent; too little history yet despite plausible-looking values |

**Summary for the founder:** 8 of the 14 SG sensors (Midwood, Potong Pasir, Shelford, CGB, Alexandra Canal, Marine
Terrace, Sembawang, Joo Chiat Place) have near-total 14-day uptime and values that track NEA's regional bands to
within the same order of magnitude on a normal day -- **trustworthy for hyperlocal use today**, Marine Terrace with
a one-off spike worth outlier-guarding. Marina Bay and "Singapore" are usable with ~80-85% uptime. Jalan Tembusu is
usable but gappy (41% uptime). **NUS Science A/B and Nathan Rd are not yet trustworthy** -- too little history (1-7%
uptime over 14 days) to judge, and the two NUS units actively disagree with each other by 10x when both report,
which is a siting/calibration problem to raise with AirGradient or the NUS team before using them for anything
hyperlocal. None of the 14 can be checked against a *nearby* (sub-km) FEM reference -- NEA's 5 stations are
region-wide, so "agreement" here is necessarily coarse (same order of magnitude, not point validation).

---

## Summary

Re-verified PH/MM/TL live on 2026-09-30. Nothing new is coverable. EMB (Cebu, Davao) stays fully blocked by
Cloudflare/Azure WAF, including guessed regional-office subdomains -- stop, as instructed. Clarity/Breathe Metro
Manila still needs a key (401). IQAir's Cebu page quietly falls back to a satellite model, confirming zero real
sensors there. AirNow's Philippines/Myanmar embassy rows have disappeared from today's file entirely (worth a
follow-up, flagged unverified). All six Palawan/Visayas/Mindanao resort destinations (Boracay, El Nido, Puerto
Princesa, Siargao, Coron, Panglao) remain at zero sensors within 25-150+ km. Davao's one AirGradient sensor
(Illumina) is high-trust by uptime and plausibility but 19.4 km out, past both HazeNow's 10 km and 25 km rules.
The one real change: **Yangon's sole sensor, previously stuck at a suspect 0.0, now shows 14 days of plausible,
high-uptime, diurnally-varying readings** -- still only one sensor (needs two), but no longer disqualified as
faulty. Mandalay and Dili remain uninstrumented; Dili has zero AirGradient coverage nationwide, not just locally.
Second task: of Singapore's 14 outdoor AirGradient sensors, 8 are high-trust (near-100% uptime, plausible vs NEA),
2 are usable-with-gaps, and 3 (NUS Science A, NUS Science B, Nathan Rd) have too little history to trust yet, with
the two co-located NUS units disagreeing by 10x when both report -- a siting/calibration issue worth raising before
any hyperlocal feature leans on them.
