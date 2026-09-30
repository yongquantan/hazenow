# Malaysia + Brunei coverage hunt: 24-hr-index cities, "Not available yet" and "Needs permission" places

Countries: **Malaysia and Brunei**. Scope: every MY/BN place in `packages/core/src/countries/places.ts` that is
`not_feasible` ("Not available yet") or is only a 24-hr-index city today (every Malaysian city except Kuala Lumpur) -
Penang/Batu Ferringhi, Langkawi, Malacca, Ipoh, Cameron Highlands, Genting Highlands, Kota Kinabalu, Kuching, Desaru,
Johor Bahru, Tioman, Port Dickson, and Bandar Seri Begawan - plus a sanity re-check of Kuala Lumpur, which already
ships a crowd "now" estimate. All live calls below were run **2026-09-30, 08:00-08:10 UTC (16:00-16:10 MYT/BNT)**,
one polite client (`HazeNow-coverage-hunt/0.1 (+https://github.com/yongquantan/hazenow; free, open-source haze app)`),
one request per endpoint, `robots.txt` checked on every new host (none found disallowing on `met.gov.my`, `env.gov.bn`,
`eqms.doe.gov.my` or `nreb.gov.my`). No CAPTCHA, login or rate limit was bypassed anywhere - PurpleAir, IQAir's API and
AirNow all stayed behind their key walls, as expected. Output written only to this file and `my-bn.json`; **no code
was touched**.

## TL;DR

- **Two genuinely new official sources found, both currently locked behind a publish-lag and a permission gap, not
  behind "no data exists":** Jabatan Meteorologi Malaysia (MET Malaysia) runs **4 TEOM PM2.5 stations** - Cameron
  Highlands, Kuching, Petaling Jaya and Lembah Danum (Sabah) - completely independent of DOE's APIMS system. This is
  a **real hourly (not 24-hr) PM2.5 measurement**, right in Cameron Highlands (currently "not feasible" in the app)
  and right in Kuching (Sarawak's worst-haze city, currently 24-hr-index-only). The catch: MET only publishes it as
  a **weekly-lagged PDF chart** (one file per weekday name, refreshed once a week, ~6-7 days stale at any moment),
  and **Kuching's own station has been down with a technical fault all week**. Neither is usable today, but both
  move from "nothing exists" to "we know exactly who to ask and for what." See §MET Malaysia.
- **Johor Bahru gained a second community sensor within the "now number" radius** - a Sensor.Community node
  ("Iolite", Sensirion SPS30 + SHT30, 9.9 km from JB) that agrees with DOE's implied 24-hr PM2.5 within 6-11% and has
  a clean (if short) uptime record. It's visible in AirGradient's aggregator map today, but **HazeNow's own
  `agMapObservations()` adapter currently drops every non-`"AirGradient"` `dataSource` row**, so this sensor isn't
  actually reaching the app yet. This is an engineering fix, not a new permission to chase. See §Johor Bahru.
- **Confirmed, again, that DOE APIMS exposes no concentration anywhere** - re-pulled the ArcGIS layer with
  `outFields=*` for a single station and the `datatrendchart` hourly-history endpoint, and both only ever carry the
  API index (Good/Moderate/.../Hazardous), never a µg/m³ value. No hidden field, no separate chart endpoint. This
  matches malaysia.md exactly.
- **Everywhere else - Penang, Batu Ferringhi, Ipoh, Malacca, Kota Kinabalu, Langkawi, Genting Highlands, Desaru,
  Tioman, Port Dickson - nothing changed.** Re-checked every one of these against AirGradient and Sensor.Community
  live today: **zero** community sensors within 25 km of any of them. No Sarawak state portal, no Penang state
  portal, and no UTM/UKM/UNIMAS public feed was found (see §Dead ends).
- **Brunei is unchanged and still not feasible as a numeric product.** JASTRe published 4 new PSI images today
  (last one at 14:39 BNT: Brunei-Muara 38, Belait 22, Temburong 19, Tutong 33, all "Good") - still image-only, no
  API. The one Brunei AirGradient sensor (Belait) is 85 km from Bandar Seri Begawan, in a different district.

## Method

1. **DOE APIMS**, re-pulled twice (08:02 and 08:07 UTC) to get past the mid-hour rewrite window malaysia.md
   documented: `CAQM_MCAQM_Current_Reading/MapServer/0/query` with `outFields=*` on one station (Kuching, `CA65Q`) to
   re-confirm no concentration field exists anywhere in the schema, plus the full 68-station pull for today's numbers
   at every target place's nearest station. Also re-pulled `publicportalapims/datatrendchart` for Sarawak
   (`stateid=13`) to re-confirm the 24-hr history endpoint carries only `API`, never a concentration.
2. **AirGradient**: the SEA-wide bbox first (matches REGIONAL.md's method), then **12 separate tight bounding boxes**
   (roughly 20-40 km across), one per target place - Penang, Ipoh, Malacca, Kuching, Kota Kinabalu, Cameron
   Highlands, Genting, Desaru, Port Dickson, Langkawi, Tioman, Bandar Seri Begawan - at `zoom=13`, to make sure
   nothing was missed by clustering at the wider SEA zoom level. Also pulled the world API
   (`api.airgradient.com/public/api/v1/world/locations/measures/current`, 2,868 rows worldwide) and filtered to the
   MY/BN region for raw `pm02`/`model` (indoor-filter) cross-checks, and the per-sensor hourly history endpoint for
   the new JB-area sensor.
3. **Sensor.Community**: `data.sensor.community/airrohr/v1/filter/country=MY` and `country=BN`.
4. **PurpleAir** (`api.purpleair.com/v1/sensors`, no key), **IQAir** (`api.airvisual.com/v2/nearest_city`, no key),
   and **AirNow** (`airnowapi.org`, no key) - confirmed all three still return `403`/`400`/`401` without a paid key,
   as malaysia.md found. Read IQAir's public web page (not the API) for Malaysia and Kuching, which shows real-time
   AQI numbers without a key - assessed and rejected (see §IQAir web page).
5. **MET Malaysia** (`met.gov.my`): read the full site nav for anything PM-related, found and fetched all 7
   "Zarah Terampai (TEOM PM-10/PM-2.5)" PDFs (one per weekday), read them with a PDF reader, and checked
   `Last-Modified` headers to establish the publish cadence.
6. **Sarawak, Penang state portals, universities**: tried direct hostname guesses (`nreb.sarawak.gov.my`,
   `airquality.sarawak.gov.my`, `greenpenang.gov.my`, `ipenang.my`, `nrensarawak.gov.my`, ...), DNS-resolved
   `nreb.gov.my` (the real NREB Sarawak domain, no `sarawak.` prefix) and read its homepage and an internal search
   page for an air-quality section. No UTM/UKM/UNIMAS domain search was completed (this session's web-search budget
   was exhausted by other agents in the swarm before I could search for university feeds by name; I relied on
   malaysia.md's own prior finding here - see §Dead ends).

---

## Per-place verdicts

### Kuala Lumpur / Klang Valley - coverable now (unchanged)

Already ships a crowd "1-hr est." from 7 AirGradient sensors. Re-verified live today: KLCC 63.4, Taman Tun Dr.
Ismail 57.4, Mont Kiara 59.6, Setapak 45.2, Setia Eco Park 62.2, Enviro Exceltech 52.7, Sejati Residences Cyberjaya
58.4 µg/m³ (EPA-corrected, ~1 min old). DOE Batu Muda (`CA15W`) read API 160 "Unhealthy" -> an implied 24-hr PM2.5
of ~73 µg/m³, in the same range as the crowd cluster. No change from malaysia.md's original cross-check.

### Johor Bahru - community candidate found, needs an adapter change (trust: medium)

**Iolite**, a Sensor.Community node (Sensirion SPS30 optical + SHT30 temp/RH, `exact_location: 1`, outdoor), sits
9.9 km from JB centre - the first sensor to land inside the app's own 10 km "now number" radius for this city (Eco
Botanic, the only previously known sensor, is 14.9 km out). Verified two ways: AirGradient's map API (`locationId
121978516`, `dataSource: "SensorCommunity"`) and Sensor.Community's own `filter/country=MY` endpoint (`id 94332`,
same coordinates, same sensor types) - they agree.

**Trust assessment:**
- **Hardware**: SPS30 (Sensirion's laser optical particle counter) - a step up from the SDS011 units REGIONAL.md
  flags as needing correction; SHT30 gives onboard RH for correction.
- **Outdoor, precise location**: `exact_location: 1`.
- **Uptime**: 42/42 hourly buckets present in its full known history (2026-09-28T14:00Z to 2026-09-30T07:00Z) - 100%,
  but that history is only ~42 hours long, so this isn't a 7-30 day read. **Recommend logging it for at least a week
  before trusting it in production**, same recommendation the Thailand hunt made for Pai's cluster.
- **Freshness**: current at capture time (last bucket ended 07:00 UTC, one hour before the 08:07 UTC poll).
- **Owner type**: unknown (Sensor.Community location names don't carry an owner field the way AirGradient's do).
- **Agreement with the nearest DOE station**: last-24h mean **85.6 µg/m³**, vs Larkin's (`CA33J`, API 162) implied
  24-hr DOE PM2.5 of **~76.8 µg/m³** and Pasir Gudang's (`CA34J`, API 164) **~80.7 µg/m³** - within **6-11%**, a real
  pass using the same `myApiToPm25` inversion malaysia.md validated.
- **A joint sanity check, not a fault**: both Iolite and Eco Botanic showed a steep, simultaneous drop in the hour
  before capture (Iolite 89 -> 20.6 µg/m³ across 01:00-07:00 UTC; Eco Botanic's raw `pm02` fell to 5.7 µg/m³ by
  08:08 UTC). Two independent sensors, different networks, moving together, most likely a real local rain/clearing
  event rather than either one glitching.
- **Faults**: none found in this sensor specifically. Its short history is the main caveat.

**The blocker isn't permission - it's code.** `packages/core/src/countries/sources/airgradient.ts`'s
`agMapObservations()` has `if (r?.dataSource !== "AirGradient") continue;`, which silently drops every
Sensor.Community row the AirGradient map API returns (Iolite included). Sensor.Community is ODbL-licensed,
CORS `*`, no key - nothing stops HazeNow from reading it, today's adapter just doesn't.

**Verdict: coverable via proxy, once the adapter reads Sensor.Community rows (or a second `crowd.sensorcommunity`
adapter is added) - no external permission needed for this specific sensor.** Today's live product is unchanged
(DOE's 24-hr index only, no "now" number), since the code that would use Iolite doesn't run yet.

### Penang (George Town) + Batu Ferringhi - no change

Re-checked live today: **0** AirGradient or Sensor.Community sensors in a tight bbox around Penang (100.1-100.5E,
5.2-5.6N). Nearest is still SM Sains Tuanku Syed Putra in Kangar, Perlis, 113 km away. No Penang state environmental
portal with a live feed was found (`penang.gov.my` resolves but no AQ section found in this pass; `greenpenang.gov.my`
and `ipenang.my` don't resolve at all - DNS failure, not "checked and empty"). MET Malaysia's 4 TEOM stations don't
include Penang. DOE Minden (`CA08P`): API 77 "Moderate" at 16:00 MYT.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors in George Town or Batu
Ferringhi.**

### Ipoh - no change

**0** community sensors within a tight bbox (100.9-101.25E, 4.4-4.8N) today. No MET TEOM station nearby (the 4 are
Cameron Highlands, Kuching, Petaling Jaya, Lembah Danum - none in Perak). DOE Tasek Ipoh (`CA11A`): API 63
"Moderate" at 16:00 MYT.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors in Ipoh.**

### Malacca - no change

**0** community sensors within a tight bbox (102.1-102.4E, 2.0-2.4N) today. DOE Bandaraya Melaka (`CA28M`): API 125
"Unhealthy" at 16:00 MYT - one of the worse readings nationally right now.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors in Malacca city.**

### Kuching - authoritative permission is the only way to a 1-hr number (MET Malaysia)

DOE Kuching (`CA65Q`) is unchanged: API 58 "Moderate" at 16:00 MYT (a much calmer day than 28 Sep, when IPD Serian
hit 158 - all 13 Sarawak stations read Good/Moderate today). **0** AirGradient/Sensor.Community sensors within 25 km,
re-confirmed.

The real find is **MET Malaysia's own TEOM PM2.5 station in Kuching** - see §MET Malaysia below for the full
mechanism, shared with Cameron Highlands. Today's status specific to Kuching: the station itself is **down**.
Every sampled day-file this week (Rabu/Wed, Khamis/Thu) carries the note *"Tiada data untuk Stesen Kuching
disebabkan oleh masalah teknikal sehingga diberitahu kelak"* ("No data for Kuching Station due to a technical fault,
until further notice"). Even once MET grants access, Kuching's own sensor needs to come back online first.

**Verdict: authoritative permission is the only way (Jabatan Meteorologi Malaysia) - ask for (1) real-time/API
access instead of the weekly PDF, and (2) the status of the technical fault. Until then, coverage is unchanged:
DOE's 24-hr index only.**

### Kota Kinabalu - no change

**0** community sensors within a tight KK bbox (115.9-116.3E, 5.8-6.1N) today. The nearest AirGradient sensor
anywhere in Sabah, "Tambulaung", is 50.0 km away - unchanged from COVERAGE.md. One update worth noting: Tambulaung
no longer reads 0.0 µg/m³ (flagged "suspect" in malaysia.md's 28 Sep capture) - it read **3.8-5.7 µg/m³** today
across both AirGradient endpoints, which looks like a real, working sensor now, but it's still 50 km out, too far to
help KK. MET's 4th TEOM station, Lembah Danum, is a rainforest research station roughly 180 km inland - not a KK
monitor either. DOE Kota Kinabalu (`CA50S`): API 53 "Moderate" at 16:00 MYT.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors in KK city.**

### Langkawi - no change

**0** community sensors within a tight Langkawi bbox today. Nearest AirGradient sensor is still SM Sains Tuanku Syed
Putra in Kangar, Perlis - on the mainland, across water, 46.8 km away (matches COVERAGE.md's 47 km). DOE Langkawi
(`CA02K`): API 87 "Moderate" at 16:00 MYT.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors on Langkawi island.**

### Cameron Highlands - authoritative permission is the only way (MET Malaysia)

**This is the most consequential finding of the pass.** Cameron Highlands is currently `not_feasible` in
`places.ts`, with the reason "the nearest DOE station is 34 km away and 1,400 m lower, so it can't stand for the
highlands." That's still true of DOE - but **MET Malaysia runs an actual TEOM PM2.5 instrument in Cameron Highlands
itself**, one of the country's only 4 (see §MET Malaysia). Today's "Khamis" (Thursday) file shows a Cameron Highland
chart dated **24 September 2026**, hourly bars of roughly **0.4-6.9 µg/m³** with a 3-hour rolling-average overlay -
plausibly clean air for a highland tea-growing town, but **6 days stale**, and the chart carries **no per-bar
numeric labels** for Cameron Highlands specifically (unlike the same PDF's Petaling Jaya panel, which prints
`Max: NN.NN` per hour - so MET clearly holds the underlying numbers, their chart generator just doesn't always
render the label on every panel). **0** AirGradient/Sensor.Community sensors within a tight Tanah Rata/Brinchang
bbox today - unchanged.

**Verdict: authoritative permission is the only way - email Jabatan Meteorologi Malaysia for (1) real-time/API
access to the Cameron Highlands TEOM feed instead of the weekly PDF, and (2) numeric (not just chart) values.**
Once granted, this would be Malaysia's **first official-1h source outside the DOE system**. Until then, Cameron
Highlands' honest status changes from "nothing exists here" to "the data exists, and we know exactly who to ask" -
the app's own language should probably move it from `not_feasible` to `needs_permission`, even while the live
product stays unchanged.

### Genting Highlands - no coverage, no change

DOE Batu Muda, 26.5 km away, stays just outside the 25 km rule (matches the app's own 27 km figure). Nearest
AirGradient sensor (KLCC) is 31.1 km away and, being a lowland KL reading, couldn't stand for a hilltop resort
~1,000 m higher even if it were closer. MET's 4 TEOM stations don't include Genting. Nothing closer found in any
network checked.

**Verdict: no coverage. What would fix it: 2 community sensors at Genting itself - a lowland station can't
substitute for it regardless of distance.**

### Desaru - no change

**0** community sensors within a tight Desaru bbox (104.05-104.35E, 1.4-1.7N) today. Even the new JB-area "Iolite"
sensor is 58.2 km away. DOE Kota Tinggi (`CA36J`): API 155 "Unhealthy" at 16:00 MYT - Johor is one of the
worst-affected states right now.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors in Desaru itself.**

### Tioman - no coverage, no change

DOE Rompin, 83 km away on the mainland, unchanged. No community sensor anywhere near the island. Being an island,
no mainland station (even one inside 25 km) should stand in for it regardless.

**Verdict: no coverage. What would fix it: 2 community sensors at Tekek or Air Batang (ABC), or a DOE station on
Tioman.**

### Port Dickson - no change

**0** community sensors within a tight bbox (101.65-101.95E, 2.35-2.65N) today. DOE Port Dickson (`CA25N`): API 95
"Moderate" at 16:00 MYT.

**Verdict: no change, 24-hr DOE index only. What would fix it: 1-2 community sensors in Port Dickson.**

### Bandar Seri Begawan - not feasible, no change

JASTRe (`env.gov.bn`) published 4 new PSI images today alone (07:26, 09:31, 11:19, 14:39 BNT). The latest, read
live: **Brunei-Muara 38, Belait 22, Temburong 19, Tutong 33**, all "Good" - still image-only, confirmed via the
site's own WordPress REST media API, still no JSON/CSV anywhere on `env.gov.bn`, `mod.gov.bn` or `data.gov.bn`
(re-checked: 0 AQ datasets on `data.gov.bn`). Sensor.Community `country=BN` still returns `[]`. PurpleAir and IQAir
both need keys (403/400, unchanged). The one AirGradient sensor in Brunei ("Belait") read a plausible
**4.9-6.7 µg/m³** today, broadly consistent with Belait district's own "Good" PSI of 22 - a *better* agreement than
brunei.md's 28 Sep capture (PSI 50 vs sensor <3 µg/m³ that day) - but Belait is **85.2 km** from BSB, in a different
district, so it cannot stand for the capital under the no-stretch rule.

**Verdict: authoritative permission is the only way for a numeric product - email JASTRe (Jabatan Alam Sekitar,
Taman dan Rekreasi, Ministry of Development) for the PSI methodology and a machine-readable feed. In parallel, seed
2 community sensors in BSB itself (a UBD/UTB partnership, per brunei.md) - Belait's distance rules it out today.**

---

## MET Malaysia: a second official PM2.5 network, found live today

`met.gov.my`'s navigation includes, under "Pencerapan > Sains Atmosfera", a page called **"Zarah Terampai (TEOM
PM-10/PM-2.5)"** (`/pencerapan/zarah-terampai-teom-pm-10`). Its body text, translated: *"PM2.5 is measured using
Tapered Element Oscillating Microbalance (TEOM) equipment. This observation is conducted at four atmospheric
composition monitoring stations under the Malaysian Meteorological Department: Cameron Highlands, Kuching, Petaling
Jaya and Lembah Danum (Sabah)."*

The page links to 7 PDFs, one per Malay weekday name:

```
https://www.met.gov.my/data/bsapa/PM2.5-Isnin.pdf    (Monday)
https://www.met.gov.my/data/bsapa/PM2.5-Selasa.pdf   (Tuesday)
https://www.met.gov.my/data/bsapa/PM2.5-Rabu.pdf     (Wednesday)
https://www.met.gov.my/data/bsapa/PM2.5-Khamis.pdf   (Thursday)
https://www.met.gov.my/data/bsapa/PM2.5-Jumaat.pdf   (Friday)
https://www.met.gov.my/data/bsapa/PM2.5-Sabtu.pdf    (Saturday)
https://www.met.gov.my/data/bsapa/PM2.5-Ahad.pdf     (Sunday)
```

Each PDF is titled "Kepekatan Purata Setiap Jam Zarah Terampai Bagi Bandar-Bandar Utama di Malaysia" (Hourly Average
Suspended Particulate Concentration for Malaysia's Major Cities) and holds one hourly bar chart per station, for
that weekday. **All 7 files share one `Last-Modified` timestamp (2026-09-29T16:32 UTC)** - a single weekly batch
job, not a rolling daily update. Fetched "Rabu" and "Khamis" live today (Wednesday 30 Sep): they're dated
**23 and 24 September** respectively - **last week's** Wednesday and Thursday, confirming a **~6-7 day publish
lag**. The Petaling Jaya panel prints a numeric `Max: NN.NN` label on every hourly bar (values 50-125 µg/m³ across
the sampled days); the Cameron Highlands panel does not carry per-bar labels, only the axis and a 3-hour
rolling-average dashed line. Both sampled files note Kuching's station is down for a "technical fault, until
further notice."

**This means MET Malaysia already operates real, hourly-resolution PM2.5 instruments at Cameron Highlands and
Kuching - exactly the two places this hunt was most short on official data for - but publishes them a week late, as
a chart image, with no API found (checked: `api.met.gov.my/v2.1/*` needs a `METToken`, same 401 malaysia.md hit).**
The fix is a permission/access request, not a technical impossibility: ask MET Malaysia whether the same TEOM data
feeds any internal or partner-facing real-time system, and whether HazeNow could get read access to it (or even the
raw hourly numbers behind the weekly PDF, which the Petaling Jaya panel proves exist).

## Dead ends (checked, found nothing)

- **Sarawak NREB / a Sarawak-specific air-quality portal**: no working domain under `sarawak.gov.my` found
  (`nreb.sarawak.gov.my`, `airquality.sarawak.gov.my`, `environment.sarawak.gov.my` all fail DNS). The actual NREB
  domain is **`nreb.gov.my`** (no `sarawak.` prefix) - its homepage lists "Air Quality" only as a historic
  conference-listing keyword (a 2018 "Better Air Quality Conference" entry), with no live dashboard or feed found on
  the pages checked in this pass. Not conclusively ruled out - NREB may still be worth an email, since it's the
  agency most likely to have Sarawak-specific instrumentation given how much worse Sarawak's haze runs.
- **Penang state portal**: `penang.gov.my` resolves and loads, but no air-quality section was found on the pages
  checked. `greenpenang.gov.my` and `ipenang.my` (guessed names for a Penang green-council/civic-data portal) don't
  resolve at all.
- **UTM / UKM / UNIMAS university sensor networks**: not independently re-searched this pass - this session's shared
  web-search budget was exhausted (200/200) by other agents in the swarm before I reached this check. Relying on
  malaysia.md's own prior finding: "no public live feed/API found" for AiRBOXSense (UKM) or AQUAMS (UMS). Treat
  university networks as still unverified, worth a follow-up search or a direct partnership email rather than a
  ruled-out dead end.
- **IQAir's public web page** (`iqair.com/malaysia`, `iqair.com/world-air-quality/malaysia/sarawak/kuching`): the
  Malaysia page shows real-time-looking AQI numbers for Kuala Lumpur, Klang, Petaling Jaya, Ipoh, Kota Samarahan and
  Kuching, credited to "102 stations from 35 contributors including DOE Malaysia and various community monitors."
  **Not usable**: IQAir computes its own NowCast-style AQI even from DOE's 24-hr-only data (the "Instant PSI" trap
  REGIONAL.md explicitly rejects), its terms forbid redistribution without an agreement (malaysia.md), and it isn't
  clear from the page alone which of its Kuching/Ipoh numbers are DOE-derived vs a genuine new community station -
  not worth chasing without a paid/licensed relationship.
- **AirNow / US Embassy monitors**: `airnowapi.org` needs a key for everything, and the page (`airnow.gov/international/`)
  didn't resolve in this pass. No evidence found, in prior docs or this session, that AirNow's international network
  includes a Malaysia or Brunei post at all (unlike China, India or Vietnam, which do have State Department
  monitors) - treat as **unverified, likely doesn't exist**, not "exists but gated."

---

## Honesty notes

- Every distance above is haversine from the exact point in `places.ts` to the exact station/sensor coordinate
  returned live today, computed the same way `packages/core/test/destinations.test.ts` does.
- The **25 km rule** (`DESTINATION_RADIUS_KM`, no stretching to a farther "nearest_far" station) is applied
  throughout - Genting's 26.5 km DOE station and Koh-Chang-style near-misses are reported as "no coverage," not
  rounded in.
- **No border was crossed**: Johor Bahru and Desaru both use Malaysian DOE stations only; Bandar Seri Begawan's
  candidate (Belait) is in-country but a different district, and is flagged as too far rather than substituted in.
- **Everything market "unverified" above is explicitly labelled that way** in the text and in `my-bn.json`'s `trust`
  field - most importantly, MET Malaysia's Cameron Highlands and Kuching TEOM data (real station, but stale and,
  for Kuching, currently offline) and the NREB Sarawak / UTM-UKM-UNIMAS dead ends (checked, found nothing, but not
  exhaustively).
- The Iolite (JB) cross-check used the same `myApiToPm25` piecewise-linear inversion malaysia.md validated, applied
  to today's live DOE API values for Larkin and Pasir Gudang.

## Summary (for the swarm)

**Newly coverable, pending small changes:** Johor Bahru gets a second, agreeing community sensor ("Iolite",
Sensirion SPS30, 9.9 km, within 6-11% of DOE's implied 24-hr average) - blocked only by an adapter filter that
currently drops non-AirGradient rows from the map API, not by any external permission.

**Trust highlights:** Iolite is medium-trust - good hardware, a real cross-check pass, and a corroborated (not
faulty) sudden drop shared with Eco Botanic - but only ~42 hours of history, so log it a week before shipping.
Tambulaung (Sabah) no longer reads a suspect 0.0 µg/m³, but stays 50 km from Kota Kinabalu, too far to help.

**Places that need permission only:** Cameron Highlands and Kuching both have a real, government-operated hourly
PM2.5 instrument (MET Malaysia's TEOM network) that no other document has surfaced - but it's published a week
late as a PDF chart, and Kuching's own station is currently down for a technical fault. Both need an email to
Jabatan Meteorologi Malaysia, not new sensors. Bandar Seri Begawan is unchanged: JASTRe needs a machine-readable
feed, image-only today. Penang, Ipoh, Malacca, Kota Kinabalu, Langkawi, Genting, Desaru, Tioman and Port Dickson are
all unchanged from the 28-29 Sep capture - zero new community sensors anywhere, confirmed with tight per-place
bounding-box queries today.
