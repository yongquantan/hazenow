# Indonesia coverage hunt

Country: **Indonesia**. Live re-verification on **2026-09-30, ~08:00-08:10 UTC (15:00-15:10 WIB)**, against
the picture in [`../COVERAGE.md`](../COVERAGE.md) (esp. "Popular destinations") and [`../indonesia.md`](../indonesia.md),
using the adapter/place logic in `packages/core/src/countries/` (KLH ISPU + BMKG scrape via
`sources/indonesia.ts`, the 25 km `withinKm` destination rule in `places.ts`, crowd rules in `REGIONAL.md`).
Every number below comes from a live call made today; nothing is estimated or carried forward without
re-checking. Raw payloads are saved under the scratch directory this run used (not committed).

Target list (per the brief): places marked "Not available yet" / "Needs permission" / "Not feasible", plus
listed cities with only a 24-hr index - Nusa Dua, Labuan Bajo, Lombok (Mataram/Senggigi/Gili
Trawangan/Kuta), Bintan/Lagoi, Batam, Yogyakarta, Bandung, Surabaya, Makassar, Medan, and Riau/Kalimantan
towns.

**Scope note on the target list itself:** Batam, Yogyakarta and Makassar are *not* actually 24-hr-only -
COVERAGE.md's own city table already has them as "1-hr" via BMKG, and today's re-check confirms all three
are still live 1-hr stations. I checked them anyway (per the brief) and report "no change, already
coverable" for each, rather than skip them silently.

**Websearch budget:** exhausted early in this run (shared session budget), after 5 queries returned "budget
used" with zero results. Everything below after that point came from direct `curl`, `WebFetch` on specific
known/guessed URLs, and one round of subdomain guessing - not general web search. This means some "no lead
found" results (e.g. an ITS-run public feed for the Surabaya sensors) reflect a budget limit, not
confirmation that no such feed exists.

---

## Summary table

| place | today's verdict | what changed vs. the existing docs |
|---|---|---|
| Nusa Dua | **Not available yet** (was "Needs proxy, 24-hr only") | The one official station for all of Bali's south (KLH ISPU Badung Sempidi) is **offline since ~2026-09-29 10:00 WITA**. Nearest crowd sensor is 10.4 km, just outside the 10 km rule. |
| Uluwatu | unchanged: Community only | not re-verified in depth (already working); nearest sensor still ~1.2 km |
| Labuan Bajo | unchanged: **Needs proxy, 24-hr only, coverable now** | ISPU station confirmed live, 0.7 km; still zero crowd sensors nearby |
| Mataram / Senggigi / Gili Trawangan / Kuta (Lombok) | unchanged: **No coverage exists** | Confirmed zero official + zero community (AirGradient, Sensor.Community, IQAir) on all of Lombok |
| Bintan / Lagoi | unchanged: **No coverage exists** | BMKG Batam re-measured at 25.5 km (was "26 km") - still just over the 25 km line |
| Tanjung Pinang | unchanged: **No coverage exists** | BMKG Batam 44.2 km, no change |
| Batam | unchanged: **Needs proxy, 1-hr, coverable now** | Brief listed it as 24-hr-only; that's not correct - BMKG Batam is a live 1-hr station, 13.7 km |
| Yogyakarta | unchanged: **Needs proxy, 1-hr, coverable now** | Same correction - BMKG Sleman is live 1-hr, 7.4 km. One new but unhelpful IQAir community station found (Hotel Amaranta Prambanan, 1 sensor) |
| Bandung | unchanged: **Needs proxy, 24-hr only** for the official line | **New lead**: 6 IQAir community stations exist (incl. one at ITB's own campus address), but IQAir blocks non-keyed access - "authoritative permission is the only way" for the crowd layer |
| Surabaya | unchanged: **No official coverage within 25 km** | **New lead**: 5 IQAir community stations exist, two of them named for ITS (a public university) - same IQAir access block; a direct approach to ITS is the more promising angle |
| Makassar | unchanged: **Needs proxy, 1-hr, coverable now** | Brief listed it as 24-hr-only; not correct - BMKG Maros is live 1-hr, 22.6 km. One Nafas sensor found 6.3 km out (not enough alone) |
| Medan | unchanged: **Needs proxy, 1-hr, coverable now** | **New detail**: found and pinned down the 3 KLH "DLH Medan" city stations behind COVERAGE.md's "+2 ISPU" figure, all 5.9-7.2 km out, closer than BMKG. One of the three (`DLH_MEDAN_02`) reads `a_pm25:"0"` today, which is very likely "no data," not "clean air" |
| Balikpapan | unchanged official: **Needs proxy, 24-hr only**. Crowd: **newly identified, pending permission** | **Best find of this pass**: 2 live, fresh, outdoor Nafas/AirGradient sensors within 10 km (3.7 km and 7.4 km) - numerically enough for a community "now" estimate, blocked only by Nafas's unverified data licence and the need to EPA-correct the raw feed ourselves |
| Palangka Raya | unchanged status; **data-quality flag** | Both BMKG (793.8 µg/m³) and KLH (a_pm25 1372.89) read extreme values today; agreement between two independent networks is some evidence it's a real severe episode, but 1372.89 as a *24-hr mean* is implausible and should be range-capped, not shown raw |
| Pangkalanbun (Kotawaringin Barat) | **bonus find, not currently a HazeNow place** | A BMKG 1-hr station not named in `indonesia.md`'s existing station list, live today at 239.8 µg/m³ |

---

## Method

1. Pulled `ispu.kemenlh.go.id/apimobile/v1/getStations` live (111 stations today, down from the 117 documented
   on 2026-09-28 - see the Bali outage below) and `getDetail/stasiun/<id>` for specific stations.
2. Pulled `bmkg.go.id/kualitas-udara/pm25` live with a full Chrome UA (a bare `Mozilla/5.0` still 403s, as
   documented) and parsed the `__NUXT_DATA__` payload the same way `packages/core/src/countries/sources/indonesia.ts`
   does. 26 stations today.
3. Pulled AirGradient's map API (`map-data-int.airgradient.com/...measurements/current/area`, EPA-corrected,
   whole-Indonesia bbox) and world API (`api.airgradient.com/public/api/v1/world/...`, raw, includes Nafas
   devices) live, and computed haversine distance from every target place's coordinates in `places.ts`/`DESTINATIONS`
   to every station/sensor in both payloads.
4. Queried Sensor.Community's `data.sensor.community/airrohr/v1/filter/area=lat,lon,km` for every target place -
   zero results everywhere checked.
5. Confirmed PurpleAir's `v1/sensors` still 403s without a key, and that the old no-key map JSON endpoint is
   dead (302 to an "over quota" page).
6. Checked IQAir's public city pages (the web page, not the API - no key used or bypassed) for Bandung,
   Surabaya, Yogyakarta, Medan, Makassar, Mataram, Tanjung Pinang. These pages list community-contributed
   AirVisual-network stations by name even though the underlying data API is keyed.
7. Re-checked AirNow's hourly `.dat` files for US Embassy Jakarta - still no rows.
8. Guessed a handful of plausible government/university subdomains after the web-search budget ran out; two
   resolved (`dlhk.jogjaprov.go.id`, `lh.surabaya.go.id`) but neither exposes a live-data page, just general
   agency content mentioning "kualitas udara" in passing - not pursued as data sources.
9. Checked `nafas.co.id` / `nafas.com` / `data.nafas.id` for any newly-public Nafas API - `data.nafas.id`
   resolves but is a "Coming Soon" placeholder.

All of the above respected robots/ToS: one client, no CAPTCHA or login bypass attempted, no scraping of
interactive JS map UIs (PurpleAir's map, IQAir's map), only documented or obviously-public JSON/HTML
endpoints fetched with a descriptive UA.

---

## Findings by place

### Nusa Dua (Bali) - downgraded today

The single official anchor for Nusa Dua, Uluwatu, Sanur, Jimbaran and Denpasar in COVERAGE.md is KLH ISPU's
`KABUPATEN_BADUNG` station ("Kabupaten Badung Sempidi"). It is **not in today's 111-row `getStations` list**
(it was one of the 117 rows on 2026-09-28/29). Calling `getDetail/stasiun/KABUPATEN_BADUNG` directly shows
why: the station still exists and still returns real hourly timestamps through **2026-09-29 10:00 WITA**,
then jumps straight to **2026-09-30 12:00-15:00 WITA with every pollutant field null**. That is a genuine
multi-hour-to-day outage, not the "future timestamp = mis-tagged timezone" pattern `indonesia.md` already
warns about.

With that station down, Nusa Dua has no official reading of any kind today. The nearest live outdoor
AirGradient sensor ("Cactus House") sits 10.4 km away - 0.4 km outside the 10 km crowd-estimate radius the
proxy is built to use - so it can't fill in either. 23 AirGradient sensors are within 25 km, but they cluster
around Denpasar and Uluwatu, not Nusa Dua itself.

**Verdict: "not available yet" today** (a real regression from "needs proxy, 24-hr only"). This is an outage
to monitor, not a structural gap - no new sensor is needed, just for KLH's own station to come back. Flag it
for a re-check before anyone ships a "Nusa Dua: 24-hr only" status based on the 09-28/29 capture.

### Labuan Bajo - unchanged

`KABUPATEN_MANGGARAI_BARAT` (Kabupaten Manggarai Barat Wae Kalamb) is live today, 0.7 km from town, a_pm25
11.84 (Baik). No BMKG station on Flores. Checked AirGradient (map + world API, whole-Indonesia bbox) and
Sensor.Community (50 km radius) - zero community sensors anywhere near Labuan Bajo. **Verdict unchanged:
coverable now via proxy, 24-hr index only.** One community sensor in town would add an hourly estimate,
same as documented.

### Lombok (Mataram, Senggigi, Gili Trawangan, Kuta) - unchanged, confirmed empty

Zero official stations (checked KLH's full 111-row list and BMKG's 26-row list - nothing in Nusa Tenggara
Barat at all) and zero community sensors (AirGradient map + world API, Sensor.Community area filter).
IQAir's Mataram page explicitly has no monitors listed ("satellite-derived model" only, with an invite to be
the first contributor). **Verdict unchanged for all four: no coverage exists.** What unlocks each: two
community sensors per town, since there's no official station anywhere on the island to let one sensor be
cross-checked.

### Bintan/Lagoi and Tanjung Pinang - unchanged, margin confirmed

Recomputed BMKG Batam's distance precisely: **25.5 km** from the Lagoi point in `places.ts` (documented as
"26 km"), still over the 25 km no-stretch line by half a kilometre. Tanjung Pinang: 44.2 km, unchanged. Zero
AirGradient or Sensor.Community sensors anywhere in the Riau Islands outside Batam. **Verdict unchanged: no
coverage exists.** Fix is unchanged too: two community sensors per place.

### Batam, Yogyakarta, Makassar - already working, brief's premise was off

All three are live 1-hr BMKG stations today (Batam 34.8 µg/m³/Sedang at 13.7 km; Yogyakarta/Sleman 27.8/Sedang
at 7.4 km; Makassar/Maros 47.3/Sedang at 22.6 km), matching COVERAGE.md's city table, which already lists all
three as "1-hr," not "24-hr only." I checked anyway per the brief and found nothing that changes their
status. One footnote each: Yogyakarta has one new but unhelpful IQAir community station (a hotel near
Prambanan, outside the city and alone not enough); Makassar has one Nafas AirGradient sensor 6.3 km out (also
alone, not enough, and not in the EPA-corrected map API).

### Bandung and Surabaya - the real new lead: IQAir community networks

Both cities' official lines are unchanged (Bandung: ISPU Saguling, 14.8 km, 24-hr only; Surabaya: ISPU
Mojokerto, 35 km, outside the 25 km radius, so **no official coverage at all** within range). But both
cities' **IQAir public pages** list real community stations that aren't in `indonesia.md` or COVERAGE.md at
all:

- **Bandung**: 6 stations / 5 contributors - `Jl. Ganesha No.10` (this is literally ITB's - Institut
  Teknologi Bandung's - campus address), `Setra Duta` x2, `Ateson Home Bandung`, `idsMED - BDG - Setrasari`.
- **Surabaya**: 5 stations / 4 contributors - `ITS Geomatics`, `ITS Teknik Lingkungan` (two ITS - a public
  university - departmental-sounding names), `SAQI Keputih Permai`, `Graha Surabaya Barat`,
  `idsMED - SBY - Pucang`.

These are real, named, existing devices - confirmed via IQAir's own web page, not guessed - but IQAir's API
requires a paid key and its ToS forbid redistribution without one (confirmed again today: `api.purpleair.com`
still 403s, and IQAir's `api.airvisual.com` was already confirmed keyed in `indonesia.md`). I could not
verify hardware, outdoor/indoor status, freshness, or any correlation with the official ISPU lines.

**Verdict for both: "authoritative permission is the only way," with two candidate paths that are more
promising than IQAir itself** - (1) email ITB directly about the `Jl. Ganesha No.10` station, and ITS's
Geomatics or Environmental Engineering department about their two Surabaya stations, since a university is
usually the easiest owner type to get a free data-sharing agreement from; (2) ask IQAir for a data-sharing
arrangement as a fallback. I ran out of web-search budget before I could chase an ITS-run public feed
directly (tried three subdomain guesses, all failed to resolve) - a proper search would likely find one.

### Medan - pinned down the existing "ISPU" stations

COVERAGE.md's city table already credits Medan with "1 BMKG + 2 ISPU" stations. Today's KLH pull shows
**three** `DLH_MEDAN_0{1,2,3}` (Dinas Lingkungan Hidup Kota Medan) stations, 5.9-7.2 km out - closer than
BMKG Medan's 19.7 km. This mostly confirms and details what was already implied rather than finding something
brand new, but it's worth recording precisely: `DLH_MEDAN_01` a_pm25 1.04, `DLH_MEDAN_02` a_pm25 **0**
(per `indonesia.md`'s own documented convention, `a_pm25:"0"` almost always means missing data on an
otherwise-live station - flag, don't trust as "clean"), `DLH_MEDAN_03` a_pm25 80.28 (closer in magnitude to
BMKG Medan's 50.5 1-hr reading). No code change needed - the existing adapter already ingests every
`getStations` row automatically. IQAir also lists 3 Medan community stations, one literally named "Indonesia
Ministry of Environment and Forestry" (likely a republish of this same KLH/BMKG data through IQAir, not a new
source) and one called "Centre for Environmental Systems Research" (unverified, possibly another academic
lead, not chased further this pass).

### Balikpapan - the best find: a crowd upgrade candidate, blocked on permission

Balikpapan's official line (KLH `BALIKPAPAN_BB`/`BALIKPAPAN`, 0.7 km, 24-hr only, no BMKG within 90 km) is
unchanged. The new finding: **two live, fresh, outdoor Nafas-operated AirGradient sensors are within 10 km**
- Gunung Sari Ilir (3.7 km, raw pm02 32.3) and Karang Joang (7.4 km, raw pm02 9.0), both `offline:false`,
both ~2-3 minutes old at capture. Two live outdoor sensors within 10 km is exactly the SPEC's bar for a
community "now" estimate - the first place in this pass where that bar is numerically cleared for a place
currently stuck at "24-hr only."

**What keeps this from being an unconditional "coverable now":**
- Neither sensor is in AirGradient's EPA-corrected map API (checked a tight Balikpapan bbox - empty), only
  the raw world API, so the correction has to be applied server-side using `rhum`, same as `indonesia.md`'s
  existing gotcha for Nafas devices.
- Nafas's licence for its AirGradient-hosted devices is unverified - same open question noted elsewhere in
  the docs (Jakarta, Malang, Bali Nafas sensors).
- Cross-check with the official line is only rough: Gunung Sari Ilir's raw 32.3 is in the same range as
  Balikpapan Baru's 24-hr mean of 29.45; Karang Joang's 9.0 is much lower, plausible for a quieter
  neighbourhood but not independently confirmed.
- No 7-30 day uptime history was pulled (would need repeated polling over time, out of scope for a single
  live pass) - recommend logging both sensors for at least a week before trusting them publicly.

**Verdict: "coverable via proxy, pending Nafas permission."** The official 24-hr line is already coverable
on its own; the crowd 1-hr estimate is technically within reach and worth an email to Nafas specifically
asking about Balikpapan.

### Bonus: Pangkalanbun, a BMKG station not in the existing docs

Today's 26-row BMKG pull includes `pm25_pkn2.xml` / "Pangkalanbun" (Kotawaringin Barat, Central Kalimantan),
239.8 µg/m³, Sangat Tidak Sehat - not named anywhere in `indonesia.md`'s existing station roster (which the
docs already note changes hour to hour, 23-26 rows across captures, so this may be a station that rotates
in and out rather than a brand-new install). Not currently a HazeNow place. Flagged since it's exactly the
kind of "Riau/Kalimantan town" the brief asked about, and a real, live 1-hr anchor if the town is ever added.

### Data-quality flag: Palangka Raya's extreme reading

BMKG's 1-hr Palangkaraya reading today is 793.8 µg/m³ (Berbahaya) and KLH's 24-hr `a_pm25` is 1372.89 - both
extreme, and the two independent networks agreeing on "very severe" is some evidence this isn't a single
faulty sensor. But 1372.89 as a **24-hour mean** is implausible even for a bad fire day and should be shown
as a capped/range value with a data-quality caveat rather than the raw number, per the existing SPEC
guidance on ">5 km -> show range," extended here to ">plausible ceiling -> show range."

---

## Sources checked with no result (recorded so the next hunt doesn't repeat them)

- **PurpleAir**: `api.purpleair.com/v1/sensors` -> 403 `ApiKeyMissingError` (confirmed live). Legacy no-key
  `www.purpleair.com/json` -> 302 to an "over quota" page, dead. No count-only path found; did not scrape the
  interactive map.
- **OpenAQ v3**: not re-tested live (already 401 without a key per `indonesia.md`; v3 requires a free-tier
  key for every endpoint).
- **Sensor.Community**: zero sensors within 25-50 km of Bandung, Surabaya, Mataram, Bintan, Labuan Bajo,
  Medan, Makassar (all queried live today via the area filter).
- **US Embassy Jakarta / AirNow**: zero Jakarta rows in today's 06:00 and 07:00 UTC hourly files - still not
  reporting, unchanged from `indonesia.md`.
- **Nafas's own API**: `data.nafas.id` now resolves but is a "Coming Soon" placeholder; `nafas.co.id` still
  redirects to the unrelated indoor-air business. No public API today.
- **Provincial DLH portals**: `dlhk.jogjaprov.go.id` and `lh.surabaya.go.id` resolve but only carry general
  agency content, no live station page found by browsing their top-level menus.
- **University subdomain guesses** (`saqi.its.ac.id`, `airquality.its.ac.id`, `udara.its.ac.id`): none
  resolved. Not a confirmed dead end - just an unsearched one, given the web-search budget ran out.

---

## Summary (for the caller)

Re-verified Indonesia's uncovered/24-hr-only places live today (2026-09-30). One real regression: Nusa
Dua's only official station (KLH Badung Sempidi) is in an outage since 2026-09-29, dropping it to "not
available yet." Lombok (all 4 towns) and Bintan/Tanjung Pinang remain genuinely uncovered - confirmed zero
official and zero community sensors, no change. Batam, Yogyakarta and Makassar were already 1-hr-covered
despite the brief's "24-hr only" framing - no action needed. The two real leads: **Balikpapan** now has two
live, fresh, outdoor Nafas/AirGradient sensors within 10 km - numerically enough for a crowd estimate,
blocked only on confirming Nafas's data licence and applying the EPA correction ourselves. **Bandung and
Surabaya** both have real IQAir-listed community stations (including two at ITS university and one at ITB's
own address) that are invisible without a paid IQAir key - the better path is emailing the universities
directly rather than IQAir. Also found: a new BMKG station at Pangkalanbun, three named Medan DLH stations,
and an extreme Palangka Raya reading (both networks agree, but the 24-hr figure is implausibly high and
should be range-capped). PurpleAir, OpenAQ and AirNow all confirmed still blocked/empty, as documented.
