# Southeast Asia: regional data, index harmonisation, multi-country architecture

Scope: cross-cutting. Country detail (authoritative feeds, exact breakpoints, advice wording, language)
lives in the per-country docs in `docs/sea/` (see [TEMPLATE.md](TEMPLATE.md)). This doc covers the
pan-SEA crowd networks, regional context feeds (ASMC, FIRMS, Himawari), how to show one consistent
"right now" across countries, and the Railway proxy.

Everything marked *verified* was run live on **2026-09-28 between 17:11 and 17:25 SGT**, during
the haze episode described in [../DATA_SOURCES.md](../DATA_SOURCES.md). Scratch scripts: a
point-in-polygon country classifier over Natural Earth 1:10m admin-0 polygons (coastal points snap
to the nearest country within 0.08°). Output is trimmed below.

Related: [../../SPEC.md](../../SPEC.md) (v1.2/v1.3 amendments) · [../ARCHITECTURE_V2.md](../ARCHITECTURE_V2.md)

---

## TL;DR

1. **The crowd layer is uneven.** Live outdoor PM2.5 sensors (AirGradient + Sensor.Community):
   **Thailand ~180, Laos ~115, Indonesia ~55–95, Philippines ~13–23, Singapore 14, Malaysia 8–10,
   Vietnam ~5, Cambodia ~4, Brunei 1, Myanmar 1, Timor-Leste 0.** Only TH, LA, ID, and a few cities
   elsewhere, can get a crowd nowcast. For MY, VN, PH, KH, BN, MM, TL, **HazeNow is only as good as
   the government feed.** PurpleAir and OpenAQ can't be counted without a key.
2. **AirGradient's map API is the best regional aggregator.** It needs no key and merges AirGradient +
   Sensor.Community + OpenAQ (which includes **138 Thai PCD/Air4Thai reference stations, fresh
   today**). It also serves FIRMS fires, a GFS wind grid, and a machine-readable table of **local AQI
   scales in µg/m³** (TH, ID, VN, LA, SG PSI, US, WHO). It has no CORS, so web clients need the proxy.
3. **Regional context is free.** NASA FIRMS publishes **keyless** SEA 24-h CSVs (NOAA-20/21, S-NPP
   VIIRS, MODIS), about 1.5 h behind the satellite pass. ASMC publishes plain-text hotspot counts per
   sub-region, a daily KML, and an HTML alert-level table (**Level 3, Southern ASEAN, since 26 Aug
   2026**). ASMC's terms forbid republishing without written permission, so we deep-link until MSS
   says yes. Himawari AOD can't be redistributed (JAXA P-Tree terms). Use NASA GIBS tiles instead.
4. **Harmonisation recommendation: one unit, local words.** The big number is always **µg/m³ PM2.5**,
   the freshest the authority publishes. The chip uses the **local authority's own category for that
   number**, taken from the jurisdiction where the reading was measured. We never compute a local
   index *number* (the SG "Instant PSI" lesson). Verdicts and actions come from an internal 0–3
   `level`, mapped per country by the *advice* each category carries. Maps and cross-border
   comparisons use raw µg/m³ with one neutral colour ramp, plus WHO 2021 as the only shared reference.
5. **Architecture:** per-country adapters produce `Observation[]`. A shared `scales/*.json` registry
   turns µg/m³ into local bands. A privacy-preserving `Snapshot` is assembled **on the device**. The
   Railway `hazenow-edge` service polls upstream on a fixed budget, independent of the number of
   users, and serves per-country and per-tile JSON with CORS and attribution. It never receives GPS.

---

## 1. Pan-SEA crowd and aggregator networks

### 1.1 Live outdoor PM2.5 sensor counts per ASEAN country (verified 17:12–17:16 SGT)

| country | AirGradient world API (live < 60 min, outdoor) | AirGradient map API, AG source (≤ 2 h) | AG map `countries/top-polluted` (urban-matched) | Sensor.Community (PM2.5, last 5 min) | OpenAQ reference, via AG map | PurpleAir | notes on where the sensors are |
|---|---|---|---|---|---|---|---|
| **SG** | 13 | 14 | 14 | 0 | 0 | ? (key) | island-wide, see DATA_SOURCES §3.1 |
| **MY** | 8 (+2 indoor) | 10 | 11 | 0 | 0 | ? | Klang Valley 7, Penang 1, Sabah 1, Johor (Eco Botanic) 1 |
| **BN** | 1 | 1 | 0 | 0 | 0 | ? | Belait |
| **ID** | 94 | 51 | 56 | 3 | 0 | ? | Malang/E. Java ~46, Bali ~36, Jakarta area ~9. Many named "… - Nafas" |
| **TH** | 137 (+5 indoor) | 169 | 249 (117 ref + 132 small) | 12 | **138** (Air4Thai) | ? | Chiang Mai/North heavy, Bangkok |
| **VN** | 2 | 3 | 5 | 3 (1 indoor) | 0 | ? | Hanoi, HCMC |
| **PH** | 12 (+1 indoor) | 22 | 23 | 1 | 0 | ? | Metro Manila, Iloilo, Bacolod, Daet |
| **KH** | 2 | 3 | 6 (1 ref) | 1 | 0 | ? | Phnom Penh, Siem Reap |
| **LA** | 103 | 117 | 17 | 0 | 1* | ? | **nationwide secondary-school network** (Phongsaly, Houaphan, Bokeo, …), mostly rural, hence low urban-matched count |
| **MM** | 1 | 1 | 2 (1 ref) | 0 | 0 | ? | |
| **TL** | 0 | 0 | 0 | 0 | 0 | ? | |

\* The one "LA" Air4Thai station (Chalermprakiet Hospital) is almost certainly in Nan, Thailand,
snapped across the border by the coastal-buffer rule. Count it as TH.

Why the AirGradient columns differ: the world API is AirGradient's own device list (raw `pm02`).
The map API is a separate service with its own `locationId`s. It re-ingests, de-duplicates and
EPA-corrects. ID (94 vs 51) and PH (12 vs 22) differ the most. **Use the map API count for planning.
Use the world API for raw values and as a fallback.** Either way, the ranking is stable.

Evidence:

```bash
# AirGradient world (raw, ~2,843 devices worldwide, 1.5 MB; JSON contains stray control chars + a trailing '"}]' → parse leniently)
curl -s --compressed https://api.airgradient.com/public/api/v1/world/locations/measures/current -o ag.json
# → world rows 2843 ; TH 143 all / 137 live-outdoor ; LA 109/103 ; ID 97/94 ; SG 13/13 ; PH 13/12 ; MY 10/8 ; VN 2/2 ; KH 2/2 ; BN 1/1 ; MM 1/1

# AirGradient map, every current measurement worldwide, paged (16 pages × 1000)
curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current?measure=pm25&pagesize=1000&page=1"
# → total 15,895 rows; ('TH','OpenAQ','Reference') 140 all / 138 fresh; ('TH','AirGradient','Small Sensor') 171/169 ; ('LA','AirGradient',…) 117/117 …

# Per-country summary endpoint
curl -s "https://map-data-int.airgradient.com/map/api/v1/countries/top-polluted?measure=pm25&period=24h&limit=5&minLocations=1&countryCode=TH"
# {"items":[{"countryCode":"TH","locationCount":249,"sensorTypes":{"reference":{"locationCount":117,...},"smallSensor":{"locationCount":132,...}},"cityCount":46,...}]}

# Sensor.Community, all PM sensors, last 5 min (4.4 MB, CORS *, Last-Modified 09:15:23 GMT)
curl -s --compressed https://data.sensor.community/static/v2/data.dust.min.json
# → world 9,686 entries; ASEAN: TH 12, ID 3, VN 3 (1 indoor), KH 1, PH 1; SG/MY/BN/LA/MM/TL 0
```

### 1.2 Network-by-network verdict

| network | key | CORS | licence | SEA value | verdict |
|---|---|---|---|---|---|
| **AirGradient map API** `map-data-int.airgradient.com/map/api/v1` | no | **none** | data CC BY-SA 4.0 (AG). Aggregated sources carry their own licences (`/catalog/licenses`). Service code GPL-3.0 | Best single regional crowd feed. `measurements/current/area?bbox`, hourly `measures/history`, `fires-data`, `wind-data`, `aqi-standards`, `catalog/datasources` | **Primary crowd source**, through the proxy for web. It is undocumented for third parties (`-int` host), so keep it behind one adapter. Ask AirGradient for a stable endpoint and a courtesy rate before launch |
| AirGradient world API `api.airgradient.com/public/api/v1/world/…` | no | none | CC BY-SA 4.0 | raw `pm02` + `rhum` + `model` (for `I-` indoor filter) for all AG devices in one 1.5 MB call | **Fallback / raw source.** Apply EPA-extended ourselves (DATA_SOURCES §2.2) |
| Sensor.Community | no | `*` | ODbL 1.0 (share-alike on the database) | 20 sensors in all of ASEAN, mostly SDS011 with no RH correction | Include (it's free and CORS-open), but it barely moves the needle. AG's map already mirrors it every 5 min |
| **OpenAQ v3** | **yes**, free `X-API-Key` (401 today without one. v2 returns **410 Gone**) | yes | per provider. Air4Thai rows show `licenses: []` (no explicit licence) | Aggregates **Thai PCD (Air4Thai) ~117–140 reference stations**, hourly, ~75 min behind (the 15:00 ICT hour was the latest at 16:15 ICT). The AG map shows **no OpenAQ reference stations for SG, MY, ID, VN, PH** and 1 each in KH/MM (likely AirNow/US-embassy style). A web search lists VN CEM and MY DOE APIMS as known networks, but they are not visible live in the mirror | **Useful for Thailand only**, and only if the TH doc finds Air4Thai direct worse (no CORS, flaky). Otherwise redundant. The key lives in the proxy. **Per-country OpenAQ counts are unverified: get a key and run `GET /v3/locations?iso=XX&parameters_id=2`** |
| PurpleAir | **yes** (403 `ApiKeyMissingError` for the SEA bbox today) | `*` | PurpleAir ToS + data licence, points-billed | unknown. The public map uses an obfuscated token, and scraping it would breach the ToS | Proxy-only, later (ARCHITECTURE_V2 §5, v2.3). Count once with a key before paying for anything |
| IQAir / AirVisual | yes (Community: 5/min, 500/day, 10k/month, city-level, US & China AQI only) | – | per DATA_SOURCES §3.5: must link to AirVisual, no redistribution. The public pages fetched today don't restate the terms, so re-read the ToS if it's ever considered | US AQI only, city-level, re-publishes govt data | **Don't use.** It can't be cached/proxied, US AQI conflicts with every local index, and it isn't fresher |
| WAQI / aqicn | yes | `*` | no redistribution | same issues | **Don't use** (DATA_SOURCES §3.4) |

AirGradient's `catalog/datasources` also lists **AirBKK** (Bangkok BMA, hourly at :25) and
**DustBoy** (CMU, Chiang Mai, hourly at :10) with `allowApiAccess:false`. They show on the AG
map but aren't served through its API. The TH doc should decide whether to go to BMA/CMU directly.

### 1.3 Crowd-layer consequence per country

The v2 nowcast (ARCHITECTURE_V2 §3) needs a government anchor for the per-sensor `k`, plus ≥ 1
good sensor within 5 km. With today's density:

- **Feasible:** Bangkok and Chiang Mai (dense, and Air4Thai anchors), Jakarta, Malang and Bali (if ISPU
  stations anchor them), Vientiane (the anchor question is for the TH/Mekong doc), Singapore.
- **Point estimates only:** Klang Valley, Metro Manila, Iloilo, Penang, Hanoi, HCMC, Phnom Penh.
- **Govt-only:** everywhere else, including the peat-fire-exposed areas that matter most (Riau, Jambi,
  South Sumatra, West/Central Kalimantan, Sarawak), which have ~0 crowd sensors.

---

## 2. Regional authoritative context

These feeds never change the band or the big number. They answer "why" and "is it coming".

### 2.1 ASEAN Specialised Meteorological Centre (ASMC, hosted by MSS/NEA)

| item | URL | format | cadence (verified) | CORS |
|---|---|---|---|---|
| Hotspot count per sub-region, per satellite pass | `https://asmc.asean.org/files/msscommunity/hotspots/DailyJP1NOAA20.<region>.txt` (+ `DailyJP1_LATENOAA20.<region>.txt` for the late pass). Regions: `sumatra, kalimantan, p_malaysia, sabahsarawak, singapore, brunei, thailand, vietnam, cambodia, lao_pdr, myanmar, philippines` | fixed-width text: header + `Total Hotspot Count: N (Daytime High Confidence)` + `S/No Longitude Latitude` rows | NOAA-20 pass 06:17 UTC. File "Created On 16:29:50" SGT, `Last-Modified 08:43 GMT` → **~2.5 h after the pass** | `https://asmc.asean.org` only |
| Daily hotspot KML | `https://asmc.asean.org/files/warnadv/haze/hotspots/Haze_Hotspots_YYYYMMDD_HHMMSS.kml` (filename is discovered from the hotspot page HTML) | KML Placemarks: `satellite`, `time`, `region`, point | daily (latest today was `20260927_164200`, 247 hotspots) | – |
| Alert levels 0–3 | `https://asmc.asean.org/asmc-alerts/` | **HTML table only** (the WP REST API returns 401) | on change. The RSS `https://asmc.asean.org/feed/` carries outlooks and reviews, **not alerts** | – |
| Satellite images | `https://asmc.asean.org/files/asmc/polarorbit/noaa20/falseColor_N20_<Region>_YYYYMMDD_HHMMSS.jpg` | JPG | per pass | – |

Today (verified): **Sumatra 74, Kalimantan 163, Peninsular Malaysia 1, Singapore 0** (NOAA-20, daytime,
high confidence). The alert table's newest row is **"26 Aug 2026 · Level 3 · Activation of Alert
Level 3 for the Southern ASEAN Region"** (287/190 hotspots in Kalimantan on 24/25 Aug). Level
definitions: 0 = no transboundary haze / stand down · 1 = dry season · 2 = increasing risk · 3 = high
risk of severe transboundary haze. Levels apply per sub-region ("Southern ASEAN" / "Mekong").

```bash
curl -s https://asmc.asean.org/files/msscommunity/hotspots/DailyJP1NOAA20.kalimantan.txt | head -6
#   ***** Hotspot Count Report *****
#   Created On: 2026, September 28, 16:29:50
# Satellite: NOAA20
# Date & Time: 2026/09/28 06:17:00
# Total Hotspot Count: 163 (Daytime High Confidence)
```

**Licence problem:** ASMC terms of use §4.1: contents "shall not be reproduced, republished … or
otherwise distributed in any way, without the prior written permission of MSS". §4.3 allows use
"solely for personal, internal, non-commercial or informational purposes". HazeNow is free and
informational, but the proxy would be *republishing*. **Action: email `ASMC_Enquiries@nea.gov.sg`**
(they ask for contents, intent, manner, time frame, identity) for permission to show the alert level
and hotspot counts with attribution. Until they answer: show a static **"ASMC regional haze alert →"
link** and use FIRMS for our own counts.

### 2.2 NASA FIRMS (active fires)

- **Keyless regional files (verified, no key):**
  `https://firms.modaps.eosdis.nasa.gov/data/active_fire/{noaa-20-viirs-c2|noaa-21-viirs-c2|suomi-npp-viirs-c2|modis-c6.1}/csv/{J1_VIIRS_C2|J2_VIIRS_C2|SUOMI_VIIRS_C2|MODIS_C6_1}_SouthEast_Asia_24h.csv`
  (also `_48h`, `_7d`). **No CORS header.** Columns: `latitude, longitude, bright_ti4, scan, track,
  acq_date, acq_time, satellite, confidence (l/n/h), version, bright_ti5, frp, daynight`. At 17:18 SGT
  the NOAA-21 file (`Last-Modified 08:47 GMT`) ran to a 07:12 UTC pass, so **~1.5 h latency**.
  File sizes: 11.5k / 12.0k / 13.7k / 2.1k rows (J1/J2/SNPP/MODIS).
- **Keyed Area API:** `/api/area/csv/{MAP_KEY}/{VIIRS_NOAA20_NRT|VIIRS_NOAA21_NRT|VIIRS_SNPP_NRT|MODIS_NRT|LANDSAT_NRT}/{w,s,e,n}/{1..5}[/{date}]`.
  A free MAP_KEY allows **5,000 transactions / 10 min**. An invalid key returns `HTTP 400 "Invalid MAP_KEY."`.
  Its only advantage over the keyless file is bbox filtering and the URT/RT data for the US/Canada. **Use
  the keyless SEA file** (one fetch covers the region) and keep a key for backfill.
- Licence: NASA open data. Attribute "NASA FIRMS (LANCE)". No redistribution limits.
- NOAA-20 VIIRS, 24 h to 06:27 UTC today, per country (all / high-confidence):
  **ID 8,008 / 259 · VN 197 / 2 · TL 46 · MM 35 · PH 29 · MY 14 · LA 10 · KH 3 · TH 1 · SG 0 · BN 0.**
  Nominal-confidence VIIRS pixels are noisy (hot surfaces, flares), so use **`h` confidence, or `n` with
  FRP > 5 MW** for any user-facing count. ASMC's own count uses high confidence.
- The AirGradient map also proxies FIRMS: `fires-data/current?xmin&xmax&ymin&ymax&hours=24&minConfidence=0..100`
  returns GeoJSON (MODIS/Terra shown). It is convenient, but it's a second-hand copy.

**"Fires upwind" context (proposal):** take the Open-Meteo `wind_direction_10m` (+ 850 hPa) at the user's
coarse location (keyless, CORS `*`; the AG map `wind-data/current` returns a 1° GFS u/v grid as an
alternative). Count high-confidence FIRMS points in a ±30° sector upwind within 500 km over the last
24 h, then show:
*"Winds from the south-east. 163 fire hotspots upwind in Kalimantan in the last 24 h (NASA FIRMS)."*
Show it only when the band is ≥ Elevated or the count is > 50. It is labelled context, never a prediction.
It must not imply attribution ("the haze is caused by …"). That is ASMC/NEA's call.

### 2.3 Himawari aerosol

- JAXA P-Tree (Himawari-8/9 AOT/ARP, 10-min L2, hourly L3): the terms fetched today say **"You cannot
  redistribute the data to the third parties"** and limit use to non-profit research/education. (Note:
  DATA_SOURCES.md mentions a commercial-use change for data ≥ 2026-02-01. The terms page doesn't
  reflect that, so treat it as **not redistributable**.) It is column AOD, not surface PM2.5, and blind
  under cloud (ARCHITECTURE_V2 §6).
- **Alternative:** NASA **GIBS** WMTS (keyless, **CORS `*` verified**, public domain):
  `MODIS_Terra_CorrectedReflectance_TrueColor`, `MODIS_{Terra,Aqua}_Aerosol_Optical_Depth_3km`,
  `MODIS_Combined_Value_Added_AOD`, `MODIS_Combined_Thermal_Anomalies_All`, VIIRS equivalents. That's
  2 passes/day, not 10-min, but it's legal to tile directly from clients.
- **Verdict:** an optional "smoke from space" map layer from GIBS in v2.x. There's no Himawari number
  anywhere, and nothing that goes through our proxy.

---

## 3. Index harmonisation: the core design problem

### 3.1 What exists (PM2.5 part of each index)

The PM2.5 breakpoints below are copied from AirGradient's live machine-readable registry
(`GET /map/api/v1/aqi-standards`, schemaVersion 3, verified today). It's a convenient cross-check,
**not authoritative**. The country docs own the final numbers and advice text.

| jurisdiction | index (agency) | averaging for PM2.5 in the index | PM2.5 µg/m³ breakpoints → categories (AG registry) | official short-term "now" guidance? |
|---|---|---|---|---|
| SG | PSI (NEA) + **1-hr PM2.5 bands** | PSI 24-h. Bands 1-h | PSI: 12 / 55 / 150 / 250 / 350 → Good · Moderate · Unhealthy · Very Unhealthy · Hazardous. 1-hr bands: 55 / 150 / 250 → Normal · Elevated · High · Very High | **Yes**: 1-hr PM2.5 bands + NEA/MOH advisory "for the next hour" (DATA_SOURCES §5.1) |
| MY | API / IPU (DOE, APIMS) | *verify in MY doc*. DOE historically used 24-h running averages for particulates in the hourly API | *not in AG registry. MY doc to supply* | *MY doc* |
| BN | (JASTRE / MY-style API) | *BN doc* | – | *BN doc* |
| ID | ISPU (KLHK, PermenLHK P.14/2020) | 24-h basis for PM2.5. ISPU is published hourly | 15.5 / 55.4 / 150.4 / 250.4 → Baik · Sedang · Tidak Sehat · Sangat Tidak Sehat · Berbahaya | *ID doc* |
| TH | AQI (PCD, Air4Thai) | 24-h rolling for the AQI. **Air4Thai also publishes hourly PM2.5** | 15 / 25 / 37.5 / 75 → Excellent · Satisfactory · Moderate · Starting to affect health · Affects health (AG labels: Very Unhealthy) | *TH doc* (PCD colours hourly values too) |
| VN | VN_AQI (VEA, QĐ 1459/2019) | **hourly AQI uses NowCast-style weighting**, plus a daily AQI | 25 / 50 / 80 / 150 / 350 → Good · Moderate · Poor · Bad · Very Bad · Hazardous | **Yes, partly**: the official hourly AQI |
| PH | AQI (DENR-EMB) | 24-h | *not in AG registry. PH doc* | *PH doc* |
| LA | Lao AQI | 24-h | 25 / 50 / 100 / 150 / 200 / 300 (AG) | *Mekong doc* |
| (IQAir, WAQI) | US AQI (EPA 2024) | NowCast (12-h weighted) | 9 / 35.4 / 55.4 / 125.4 / 225.4 / 325.4 | – |
| reference | WHO AQG 2021 | 24-h guideline | AQG 15 · IT-4 25 · IT-3 37.5 · IT-2 50 · IT-1 75 | – |

At the same concentration the words differ wildly. **50 µg/m³** is SG 1-hr "Normal", SG PSI
"Moderate", TH "Starting to affect health" (orange), ID "Sedang", VN "Moderate" (upper), US AQI
"Unhealthy for Sensitive Groups", and 3.3× the WHO guideline. Any single harmonised word would
contradict at least four authorities.

### 3.2 Options considered

| option | consistency | "never contradict the authority" | verdict |
|---|---|---|---|
| A. One regional index (US AQI, like IQAir) | high | **fails**: 50 µg/m³ = "Unhealthy for SG" while NEA says Normal. It's the 2013 SG confusion ×10 | no |
| B. HazeNow's own neutral 4-band scale everywhere (SG 1-hr thresholds) | high | **fails in TH/VN/ID**: we'd say "Normal / Fine to be out" at 50 µg/m³ while PCD colours the same hour orange | no |
| C. Compute each local index number from 1-hr data ("Instant ISPU / API / AQI") | medium | **fails**: the same trap as Instant PSI, which SPEC v1.2 removed. Authorities publish their own number, and ours would differ | no |
| D. Raw µg/m³ only, no bands | high | safe, but gives no guidance. Violates SPEC principles 1–3 (verdict first) | no |
| **E. One unit + local band from the authority's own scale + internal level for the verdict** | **high where it matters** (unit, layout, verdict grammar, actions) | **passes**: we use the authority's own words and colours for the number we show | **recommended** |

### 3.3 Recommendation (option E), stated as rules

1. **One unit everywhere.** The big number is PM2.5 in **µg/m³**, the freshest reading the local
   authority publishes (1-hr where it exists), or the v2 nowcast labelled "est.", exactly as in SG.
   We never show US AQI and never invent an index number. `instantPsi`-style fields may exist in
   the JSON API, but never in the UI.
2. **Local band on the chip, from the jurisdiction where the reading was measured** (not the user's
   nationality, phone locale, or home). Band thresholds, words (in the local language + English),
   and colours come from `scales/<id>.json` for that jurisdiction:
   - If the authority has **official short-term guidance** (SG 1-hr bands, VN hourly AQI category, and
     whatever the country docs find for TH/ID/MY/PH), use it verbatim.
   - Otherwise, use the authority's own index category for the concentration band, **only where the
     authority itself colours hourly values with that scale** on its public site (e.g. Air4Thai,
     ISPU hourly). We're then showing exactly what the authority shows for that hour.
   - If neither applies, show **no local band**: the number, the official index row, and a WHO-relative
     line ("3× the WHO daily guideline"). Unknown beats contradictory.
3. **The verdict comes from an internal `level` 0–3** (Normal/Elevated/High/Very High, which drives
   SPEC's verdict matrix, actions, notifications and hysteresis). Each scale maps its categories to
   `level` **by the advice the authority attaches to the category**, not by concentration:
   `0` = no restriction for anyone · `1` = sensitive groups reduce/avoid strenuous · `2` = everyone
   reduce strenuous, sensitive avoid outdoor · `3` = everyone minimise outdoor. The **headline copy is
   local**: each country doc supplies verbatim advice per category (like NEA's "for the next hour"),
   in `COPY.<cc>.md`. The level only selects the action set and notification logic, so the grammar
   feels the same everywhere while the words stay the authority's.
4. **Official index row, always visible, never "lagging".** Show `Official 24-hr ISPU 128 · Tidak
   Sehat (KLHK, 3 pm)` in the authority's words and colours, with the SG-style neutral explainer:
   "The 24-hr index averages the last 24 hours. The number above is the latest hour." The chart
   (SPEC v1.2 §2) plots hourly µg/m³ bars + the authority's 24-h PM2.5 concentration line where it's
   published. If only the index is published, don't back-convert it. Plot bars only and state the index.
5. **Cross-country surfaces are neutral.** The regional map, the "compare places" list and share
   images across borders colour points with **one neutral sequential ramp in µg/m³** (no band words),
   and show the WHO 2021 marks (15 / 37.5 / 75) as the only shared reference. Tapping a point shows
   its local band.

Provisional category→level mapping (for country docs to confirm or replace):

| scale | level 0 | level 1 | level 2 | level 3 |
|---|---|---|---|---|
| sg_nea_1h | Normal ≤55 | Elevated 56–150 | High 151–250 | Very High ≥251 |
| th_pcd | Excellent/Satisfactory/Moderate ≤37.5 | Starting to affect health 37.6–75 | Affects health >75 | – (red is the top. Level 3 only if PCD advice says minimise for all) |
| id_ispu | Baik/Sedang ≤55.4 | Tidak Sehat 55.5–150.4 | Sangat Tidak Sehat 150.5–250.4 | Berbahaya >250.4 |
| vn_aqi_h | Good/Moderate ≤50 | Poor 50–80 | Bad 80–150 | Very Bad/Hazardous >150 |
| my_api, ph_emb, bn, la, kh, mm | *country docs* | | | |

### 3.4 The "lag" analogue per country (what our "now" number is)

| jurisdiction | the lagging headline number people see | HazeNow's "now" number | status |
|---|---|---|---|
| SG | 24-hr PSI | NEA 1-hr PM2.5 (official since 2016) | shipping |
| MY | hourly API (24-h running particulate average, *to verify*) | hourly PM2.5 concentration if DOE publishes it, else nowcast from crowd anchored to DOE | MY doc |
| ID | ISPU (24-h basis) | hourly PM2.5 µg/m³ per KLHK station, if exposed | ID doc |
| TH | PCD AQI (24-h) | Air4Thai hourly PM2.5 (138 stations fresh today via OpenAQ, ~75 min old). Crowd nowcast in BKK/CNX | TH doc |
| VN | daily VN_AQI | official hourly VN_AQI already uses NowCast weighting, so it is itself a partial-lag "now". Show hourly µg/m³ where CEM exposes it | VN doc |
| PH | EMB AQI (24-h) | hourly PM2.5 if EMB publishes. Else crowd point estimates, clearly "est." | PH doc |
| IQAir/WAQI users' mental model | US AQI (NowCast 12-h) | – We don't compete. The "How we calculate" page explains why our numbers aren't US AQI | – |

### 3.5 Travellers and borders (JB ↔ SG, Batam, Penang–Satun, Nong Khai–Vientiane, …)

- **The jurisdiction follows the reading, not the person.** The band scale, agency, advice and language
  default switch when the *selected location* is in another country. A one-time banner on the first
  switch: "You're in Johor. Bands and advice now follow Malaysia's DOE." Saved places keep their own
  jurisdiction ("Home · SG", "Office · Johor Bahru").
- **Optional "Also in my home scale" line** (off by default, settable per profile): "In SG terms:
  Elevated". It's a secondary line, never the chip, so the local authority still leads.
- **Never interpolate official values across a border.** IDW for the official number uses only the
  authority's stations in the same jurisdiction. The nearest NEA region to Woodlands can be 5 km from a
  JB user, and it still isn't JB's official value. **The crowd nowcast may cross borders** (the air
  doesn't stop at the Causeway: the Eco Botanic, JB sensor tracked NEA west at 1.07×), but the
  provenance line says so: "est. from 3 sensors (1 in Singapore)". `k` is calibrated against the
  anchor of the jurisdiction the *sensor* is in.
- **Time:** show age in relative words ("12 min ago"). Clock times are in the **station's local time
  with its zone when it differs from the device's** ("3 pm WIB"). Watch for UTC+7 (TH/VN/KH/LA, WIB),
  UTC+8 (SG/MY/BN/PH, WITA) and UTC+9 (WIT). HazeNow's hour alignment uses each authority's
  hour-ending convention (per the country docs).
- **Notifications:** thresholds are per place and scale. A user with Home SG + Office JB gets
  crossings in each place's own scale. Don't fire an alert just because they crossed the border.
- **Share text** always names the scale: "PM2.5 142 µg/m³ in Johor Bahru, Tidak Sihat (DOE) · via
  HazeNow".

---

## 4. Multi-country architecture

### 4.1 Shape

```
                    ┌─────────────── Railway: hazenow-edge (asia-southeast1, 1 replica) ───────────────┐
 upstreams          │ pollers (per adapter, own schedule + backoff)  →  normalise  →  store (Redis)   │   clients
 NEA v1/v2 ────────▶│   sg.nea          th.air4thai | th.openaq      Observation[]    last + 48 h ring  │──▶ GET /v3/obs/{cc}.json
 DOE/KLHK/PCD/… ───▶│   my.doe  id.klhk vn.cem  ph.emb  …            QC + EPA + k     per station      │──▶ GET /v3/crowd/{geohash3}.json
 AirGradient map ──▶│   crowd.airgradient (bbox per country)                                          │──▶ GET /v3/context/{cc}.json
 Sensor.Community ─▶│   crowd.sensorcommunity                                                        │──▶ GET /v3/scales.json
 FIRMS / ASMC ─────▶│   ctx.firms  ctx.asmc(link-only until permitted)  ctx.wind                     │──▶ (opt-in) push
                    └────────────────────────────────────────────────────────────────────────────────┘
 Direct from clients (no proxy needed, CORS *):  NEA v1/v2 · Sensor.Community · Open-Meteo · GIBS tiles
```

**Snapshot assembly stays on the device.** SPEC's promise "Your location never leaves your device"
rules out `GET /snapshot?lat&lon`. The proxy serves **per-country** official observations and
**per-geohash-3 tile** (~156 km) crowd lists. The client picks the tiles it needs, then runs IDW, the
nowcast, band lookup and verdict locally (the same code in TS/Swift/Kotlin). The one exception is an
opt-in `GET /v3/nowcast?g5=` for dumb clients (SwiftBar, Telegram, HA), which take a geohash-5 (~5 km)
that the user chooses.

### 4.2 Adapter contract

```ts
interface Adapter {
  id: string                      // "sg.nea", "th.air4thai", "crowd.airgradient"
  jurisdiction: CountryCode | "regional"
  kind: "official" | "crowd" | "context"
  schedule: Schedule              // e.g. { publishLagSec: 60, burstEverySec: 60, burstUntilMin: 10, idleEverySec: 900 }
  runsIn: ("client" | "edge")[]   // "client" only if CORS * and no key
  licence: { id: string, attribution: string, url: string, shareAlike?: boolean, redistribution: "ok"|"link-only" }
  fetch(ctx): Promise<Raw>        // honours ETag / If-Modified-Since, 429 + Retry-After, backoff 30 s → 10 min
  parse(raw): Observation[]
}

interface Observation {
  stationId: string               // "<adapter>:<native id>"
  lat: number; lon: number
  grade: "reference" | "lowcost"
  indoor: boolean
  pm25_1h?: number                // µg/m³, after source-side or our correction (flag which)
  pm25_24h?: number
  officialIndex?: { scaleId: string, value: number, category: string }  // verbatim from the authority, never computed
  periodEnd: ISO8601              // end of averaging window, with offset
  publishedAt?: ISO8601           // first time we (or the source) saw it
  corrected?: "source" | "epa_ext" | "none"
  k?: number; qc?: "ok"|"stale"|"erratic"|"indoor"|"dup"   // crowd only
  attributionId: string
}
```

`Snapshot` (SPEC §7 + ARCHITECTURE_V2 §1) gains the following, all additive:
`jurisdiction`, `band: { scaleId, level: 0|1|2|3, labelLocal, labelEn, color, icon }`,
`official: { scaleId, value, category, averaging: "24h"|"1h"|"nowcast", agency, periodEnd, url }`,
`context?: { asmc?: { level, subregion, since, url }, fires?: { count24h, upwindSector, source } }`,
and `attribution: string[]`. `band.scaleId` is what tells the UI which words to show.

`scales/*.json` (one file per scale, shipped in-app and served at `/v3/scales.json` for hot-fixes):
`id, agency, pollutant, averaging, breakpoints[], labels{en, ms, id, th, vi, fil, …}, colors[],
icons[], level[], adviceKeys[], sourceUrl, verifiedAt`. Test vectors per scale go in SPEC (e.g.
`id_ispu(55.4) → level 0`, `id_ispu(55.5) → level 1`).

### 4.3 What the Railway service must do

| duty | why | detail |
|---|---|---|
| **CORS proxy** | AirGradient (both hosts), FIRMS CSVs, ASMC files, and (per country docs) most ASEAN govt portals send no `Access-Control-Allow-Origin` | Only fixed, allow-listed upstream URLs. **No open proxy.** Responses get `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=30, stale-while-revalidate=300`, `ETag` |
| **Key custody** | OpenAQ, FIRMS (backfill), data.gov.sg prod key, PurpleAir (later) | Railway variables. Keys never leave the service. Each key has its own token bucket |
| **Fan-in cache** | Upstream load is set by our schedule, not by user count. It also works around data.gov.sg's per-IP 429s behind CGNAT | Redis (Railway plugin): `obs:{cc}` latest, `ring:{stationId}` 48 h hourly for `k` and charts, `crowd:{g3}` |
| **Compute once** | Per-sensor `k`, QC flags, EPA correction and FIRMS sector counts are the same for everyone | Hourly job after each anchor publishes. It uses our own stored minute data, so **AG history calls drop to ~0 after warm-up** |
| **Attribution passthrough** | CC BY-SA (AG), ODbL (S.C.), SG Open Data Licence, NASA, per-country govt terms | Every response has `attribution: [{id, text, url, licence}]`, and clients must render it. Share-alike data (AG, S.C.) stays under its licence when re-served. The **MIT code licence is separate**, as ARCHITECTURE_V2 notes. Link-only sources (ASMC for now, IQAir, WAQI) are never fetched for display |
| **Not on the critical path** | Railway can be down | Clients fall back to direct sources that allow CORS (NEA for SG. Others per country doc). Native apps may call no-CORS sources directly. The web shows "Official data only · crowd layer unavailable" |
| **Health + provenance** | Trust | `/v3/health` per adapter: `lastOk`, `lastError`, `ageSec`, upstream status. Stale data is served with its real `periodEnd`, never re-stamped |
| **Privacy** | SPEC principle 12 | No GPS in requests (§4.1). No request logging of query strings. Push subscriptions store geohash-5 + threshold only |

Deploy: one Node (Hono/Fastify) service + Railway Redis, region **asia-southeast1 (Singapore)**,
1 replica (pollers must be single-writer; use a Redis lock if scaled), with `HAZENOW_EDGE` as the
only client constant. Ingress (~35 GB/month, mostly the 4.4 MB Sensor.Community and 1.5 MB AG dumps)
is the main traffic. Egress is small JSON. Check Railway's current egress pricing before launch.

### 4.4 Upstream rate-limit budget (whole service, independent of users)

| upstream | call | cadence | calls/h | upstream limit | notes |
|---|---|---|---|---|---|
| NEA v1 pm25 + psi | 2 endpoints | 1/min from :00:30 until the new hour (≤ :10), then every 15 min | ~24 | none observed | SPEC v1.3 §3 |
| NEA v2 pm25 | 1 | :35 and :50 back-fill checks | 2 | 6/10 s keyless, 30/10 s with prod key | key in Railway |
| Other govt feeds (MY, ID, TH, VN, PH, BN) | per country doc | the same "burst after publish, then idle" pattern | ≤ 25 each | per country doc | ≤ 150 total |
| AirGradient map `measurements/current/area` | 1 bbox per country with sensors (≈ 9) | every 2 min | 270 | undocumented | Ask AG. Drop to 1 world call at 5 min if asked |
| AirGradient world dump (fallback / raw + model) | 1 × 1.5 MB | every 10 min | 6 | undocumented | indoor filter via `model` |
| AirGradient `measures/history` | cold start only | once per new sensor | ~0 steady | – | we keep our own 48 h ring |
| Sensor.Community `data.dust.min.json` | 1 × 4.4 MB | every 5 min | 12 | fair use | or skip: the AG map mirrors it |
| OpenAQ v3 (TH Air4Thai, if chosen) | `/v3/locations?iso=TH` daily + `/v3/parameters/2/latest?iso=TH` | every 10 min :10–:40 | ≤ 6 | 60/min, 2,000/h | free key |
| FIRMS keyless SEA 24 h CSV | 3 files (J1, J2, SNPP) | every 30 min with `If-Modified-Since` | 6 | none stated | key API as backfill: ≪ 5,000/10 min |
| ASMC hotspot txt (after permission) | 4 regions (sumatra, kalimantan, p_malaysia, sabahsarawak) | hourly, `If-Modified-Since` | 4 | – | alert HTML: every 6 h |
| Open-Meteo wind (context) | 1 per active geohash-3 tile | hourly | ~20 | 10k/day free, non-commercial | or AG `wind-data` |
| PurpleAir (v2.3) | 1 SEA bbox, 4 fields | every 10 min | 6 | points-billed | cost scales with cadence, not users |
| **Total** | | | **≈ 520/h** | | ~12.5k/day |

Clients → edge: per-country obs polled on the SPEC v1.3 cadence (1/min only in the publish burst),
crowd tiles every 2 min while the app is in the foreground, and nothing in the background except the
OS-scheduled refresh at hh:02. Rate-limit clients at the edge at 60 req/min/IP with a 429 +
`Retry-After`, which clients already handle.

### 4.5 Rollout (regional additions to ARCHITECTURE_V2 §7)

| step | change |
|---|---|
| v3.0 | `scales/` registry + `jurisdiction` + neutral µg/m³ map ramp. SG unchanged. Railway edge with the NEA cache + AG CORS proxy (replaces the Cloudflare Worker plan) |
| v3.1 | First non-SG country whose country doc says "ship now" (likely **TH**: Air4Thai + dense crowd, or **MY** for JB ↔ SG commuters). Cross-border rules in §3.5 |
| v3.2 | FIRMS "fires upwind" context card. ASMC alert card (link-only → inline after MSS permission) |
| v3.3 | Remaining countries per verdicts. GIBS smoke layer |

---

## 5. Open questions / to verify

1. OpenAQ per-country counts (needs a free key): does it carry MY DOE, ID KLHK, VN CEM, PH EMB live?
   Today's AG mirror suggests **no** for all four.
2. PurpleAir SEA counts (needs a key, ~0 points for a one-off count query).
3. AirGradient: confirm we may poll `map-data-int` from a server at the budget above, or get a stable
   endpoint. Ask about the Nafas-branded Indonesian sensors (world API 94 vs map 51).
4. ASMC/MSS written permission (email above).
5. Country docs must fill: MY/PH/BN/LA/KH/MM scales, official short-term guidance, hourly-colouring
   practice, and verbatim advice per category → `COPY.<cc>.md`.
