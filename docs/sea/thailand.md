# Thailand: air quality data for HazeNow

Research captured live on **2026-09-28, 17:11–18:25 SGT (= 16:11–17:25 ICT, Thailand is UTC+7, one hour
behind SGT)**. Every `curl` below was actually run and outputs are trimmed. Anything I could not confirm
with a live call is marked **unverified**. All times in Thai feeds are ICT **with no offset in the string**.

Conditions today: rainy season, clean air. The Air4Thai 24-hr PM2.5 had a median of 7.2 µg/m³ and a max of 23.1 across 167 stations,
and every station was in the two best Thai AQI bands. So this doc verifies **plumbing, cadence and latency**. It doesn't show haze
behaviour. Burning-season context is in §Chiang Mai.

## TL;DR

- **Best authoritative source: PCD Air4Thai. It is the best government feed in the region after NEA.** It has **173 stations** (104 PCD
  ground stations, **68 Bangkok BMA stations** and 1 mobile), **real 1-hr PM2.5 in µg/m³ per station**, no key, JSON, and
  **CORS `*` on the `/forweb/` and `/webV2/history/` paths**. The new hour is live about **10–25 min after the hour** (§Latency).
- **Watch out:** the famous `services/getNewAQI_JSON.php` `AQILast.PM25.value` is the **24-hr rolling mean, not the 1-hr value**
  (proved exactly on 4 stations below). The 1-hr series is in `getHistoryData.php`. The `services/` path also has **no CORS**.
- **BMA's network is inside Air4Thai** (`stationType:"BKK"`, IDs `bkp*t`). BMA's old public site `bangkokairquality.com` now
  **redirects to an unrelated business page** (dead). We don't need a separate BMA integration.
- **Best crowd source: AirGradient.** It has **141 live sensors in Thailand (124 outdoor)**: 42 in greater Bangkok, 9 in Chiang Mai city, 49 north of 17°N.
  No key, CC BY-SA 4.0, no CORS (same as SG). **CMU CCDC DustBoy** is denser in the north (**546 live outdoor, 101 in
  Chiang Mai province**), but its sanctioned API needs a key and **caps public accounts at 10 stations**. The live all-stations feed
  only works with a token scraped from the website. So it needs a partnership.
- **Index: Thai AQI (PCD), built on the 24-hr rolling PM2.5.** PM2.5 bands are 0–15 / 15.1–25 / 25.1–37.5 / 37.6–75 / ≥75.1 µg/m³. There is **no official
  1-hr PM2.5 band scheme** (none found, **unverified** that none exists). This is the same "lag" problem as SG's 24-hr PSI, and there is no NEA-style 1-hr advisory to lean on.
- **Verdict: ship in v1.x (technically "ship now")** for the 1-hr number + official 24-hr Thai AQI, **pending (a) PCD licence
  confirmation** (the open-data catalogues were geo-blocked from SG, **unverified**), and **(b) a product decision on banding** (§Index).
  Crowd: AirGradient in v2 as for SG. DustBoy only via a CCDC agreement.

---

## Authoritative (government) sources

| source | agency | what | stations (verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS | reliability notes |
|---|---|---|---|---|---|---|---|---|---|
| **Air4Thai hourly history** | Pollution Control Dept (PCD) | **1-hr PM2.5 µg/m³** (also PM10, O3, CO, NO2, SO2), hour-ending label, 1 decimal | 173 IDs. At 17:23 SGT, **141 had the 15–16 ICT hour**, 20 were one hour behind and 10 had no data today | hourly. Most stations by **hh:10–hh:25 ICT** (§Latency) | `https://air4thai.pcd.go.th/forweb/getHistoryData.php?stationID=<id,id,…>&param=PM25&type=hr&sdate=YYYY-MM-DD&edate=YYYY-MM-DD&stime=HH&etime=HH` (same on `air4thai.com`, same IP) | no | **`*`** | **unverified**: Envilink/data.go.th catalogue pages returned 403 from SG. The dataset is listed on Envilink (Thai govt open-data catalogue) per search results | Undocumented web-app endpoint. PHP 5.3.29 / Apache. History window starts **2026-07-01** (earlier dates return empty). All 173 stations in **one 174 KB call, 1.8 s** |
| **Air4Thai latest AQI** | PCD | per-station Thai AQI + **24-hr rolling PM2.5** (`AQILast`) + coordinates, names TH/EN | 173 (167 with valid PM2.5, **9 stale** by ≥1 day) | hourly, same as above | `https://air4thai.pcd.go.th/forweb/getAQI_JSON.php[?region=1..]` (CORS) or `/services/getNewAQI_JSON.php` (no CORS) | no | `forweb`: **`*`**. `services`: **none** | unverified (as above) | Both return an identical 134 KB payload. `http://` 301s to `https://`. 13 rapid calls: all 200, no rate limit seen |
| Air4Thai legacy history | PCD | same 1-hr data, **hour-beginning labels, integer-rounded** | same | same | `https://air4thai.pcd.go.th/webV2/history/api/data.php?…` (same params) | no | `*` | unverified | **Labels are shifted one hour vs `forweb`** (proved below). Prefer `forweb` |
| Air4Thai 7-day daily | PCD | daily 24-hr means + AQI | per station | daily | `/forweb/getStationData.php?stationID=35t` | no | `*` | unverified | For a "past week" strip only |
| BMA network | Bangkok Metropolitan Admin. | PM2.5 (mostly) | **68 in Air4Thai** (`stationType:"BKK"`), plus 11 PCD ground stations in Bangkok | same feed | via Air4Thai | – | – | – | BMA's own `bangkokairquality.com/bma/` **redirects to `business.blab.com/bizfair`** (verified: domain lapsed). BMA's portals (`greener.bangkok.go.th`, `webportal.bangkok.go.th`) returned **403 from SG**. Whether BKK stations are reference-grade is **unverified** |
| GISTDA PM2.5 | GISTDA (space agency) | **modelled / satellite-derived** PM2.5 by point/tambon, 24-h history | grid | hourly | `https://pm25.gistda.or.th/rest/getPm25byLocation?lat=&lng=` | no | `*` | unverified | **Model, not measurement**. Its timestamps carry a fake `Z` (they are ICT). Map layer only, like SG's Open-Meteo rule |

### Evidence

```bash
# 17:11:40 SGT. The well-known feed. Note: no Access-Control-Allow-Origin
$ curl -s -D - -H "Origin: https://example.com" https://air4thai.pcd.go.th/services/getNewAQI_JSON.php
HTTP/1.1 200 OK
Server: Apache/2
X-Powered-By: PHP/5.3.29
Content-Type: application/json; charset=UTF-8
{"stations": [{"stationID":"119t","nameTH":"สวนสาธารณะธารา","nameEN":"Thara Public Park",
 "areaEN":"Pak Nam Subdistrict, Mueang District, Krabi","stationType":"GROUND","lat":"8.0506237","long":"98.9180489",
 "forecast":[],"AQILast":{ "date":"2026-09-28","time":"16:00",
 "PM25":{ "color_id":"1","aqi":"9","value":"5.6"},
 "PM10":{ "color_id":"0","aqi":"-1","value":"-1"}, ...
 "AQI":{ "color_id":"1", "aqi":"18", "param":"O3"}}}, ... 173 stations]}
# stationType: GROUND 104, BKK 68, MOBILE 1. AQILast stamps: 16:00 ×123, 15:00 ×40, older ×10.

# 17:17:37 SGT. Same payload on the web-app path, WITH CORS
$ curl -s -D - -H "Origin: https://example.com" https://air4thai.com/forweb/getAQI_JSON.php
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST
(134207 bytes, same schema. Also works as https://air4thai.pcd.go.th/forweb/getAQI_JSON.php; both hosts are 27.254.96.194)

# 17:17:59 SGT. The 1-hr series (hour-ending labels)
$ curl -s "https://air4thai.com/forweb/getHistoryData.php?stationID=bkp100t,35t,02t,bkp101t&param=PM25&type=hr&sdate=2026-09-27&edate=2026-09-28&stime=00&etime=23"
{"result":"OK","error":"","stations":[{"stationID":"bkp100t","params":["PM25"],"data":[...,
 {"DATETIMEDATA":"2026-09-28 14:00:00","PM25":9.3},{"DATETIMEDATA":"2026-09-28 15:00:00","PM25":16},
 {"DATETIMEDATA":"2026-09-28 16:00:00","PM25":15.4}],"summary":{"PM25":{"max":..,"count":..,"countPercentage":..}}}, ...]}
```

**Proof that `AQILast.PM25.value` is a 24-hr mean, not 1-hr.** The mean of the last 24 hourly values (history, ending at the
`AQILast` hour) reproduces it exactly:

| station | latest 1-hr (16:00 ICT) | `AQILast` 16:00 `PM25.value` | mean of last 24 hourly |
|---|---|---|---|
| bkp100t (Bueng Kum, BKK) | **15.4** | 6.6 | 6.6 |
| 35t (Chiang Mai City Hall) | **6.2** | 8.8 | 8.8 |
| bkp101t (Khlong Sam Wa, BKK) | **11.0** | 12.1 | 12.1 |
| 02t (Thon Buri) | 8.2 (arrived later) | 7.3 (stamped 15:00, then 16:00) | 7.3 (23 valid) |

At bkp100t the hour is **2.3× the 24-hr number**. That is exactly the gap HazeNow exists to show. Anyone reading `getNewAQI_JSON` as
"PM2.5 now" (many hobby apps do) is showing a 24-hr average.

**Proof that the two history endpoints disagree on labels** (35t, called 17:18:09 SGT):

```
webV2/history/api/data.php : 10:00 6 | 11:00 11 | 12:00 10 | 13:00 10 | 14:00 6 | 15:00 6
forweb/getHistoryData.php  : 11:00 6.2 | 12:00 11 | 13:00 10 | 14:00 9.9 | 15:00 6 | 16:00 6.2
```
`webV2(t) == round(forweb(t+1h))` for every hour. `forweb` is **hour-ending**: the value stamped 16:00 existed at 16:18 ICT, so it
cannot be a 16:00–17:00 average. `webV2` is hour-beginning and rounds to integers. `AQILast.time` uses the hour-ending convention.

### Latency (polled every 2 min, 17:18–18:25 SGT, `forweb` endpoints)

```
(filled in below from th_a4t_poll.log)
```

### Chiang Mai and the burning season (context)

- Northern Thailand's smoke season is roughly **Feb–Apr**: agricultural and forest burning in Thailand, Myanmar and Laos, trapped
  by the Chiang Mai–Lamphun basin inversion. It is the region's worst sustained PM2.5 outside Indonesian peat years. Peak values are
  **unverified here**, because Air4Thai's history API only serves data from **2026-07-01** (Feb–Apr 2026 returned empty today),
  and CCDC's history needs a key.
- **Official coverage in the north is thin:** there are **2 PCD stations in Chiang Mai city** (35t City Hall, 36t Yupparaj School) and 8 in
  Chiang Mai/Lampang/Chiang Rai combined, including the border station **73t Mae Sai**. Crowd coverage is much denser: **101 live DustBoys in
  Chiang Mai province** and **49 outdoor AirGradients north of 17°N**. In the north a "nearest station" of 20–60 km is normal, so
  SPEC's ">5 km → show a range" rule will fire most of the time. This is the strongest case in SEA for the v2 crowd layer.
- During the season the 24-hr Thai AQI lags badly behind hour-to-hour smoke swings (evening inversion build-up), which is HazeNow's
  whole thesis. Plan the first Thai launch **before February**.

---

## Crowd / low-cost sensor networks

| source | what | sensor type | stations (verified today) | cadence & latency | API/endpoint | key? | CORS | licence / ToS | correction needed | coverage by city |
|---|---|---|---|---|---|---|---|---|---|---|
| **AirGradient** | PM2.5 raw (world API), EPA-corrected (map API) | PMS5003(T) ×2 (O-1PST etc.) | **141 live in TH** (point-in-polygon): **124 outdoor** `O-*`, 8 indoor `I-*`/`8PS*`, 9 unknown model. The map API bbox shows 169 AG + **137 OpenAQ "Reference" (= Air4Thai, 1 h behind)** + 11 Sensor.Community | ~1 min, median age **0.9 min** | same as SG (DATA_SOURCES §3.1): `api.airgradient.com/public/api/v1/world/locations/measures/current`, `map-data-int.airgradient.com/map/api/v1/measurements/current/area?...` | no | **none** (only `Access-Control-Allow-Credentials`) | CC BY-SA 4.0 | **Yes.** Today at low levels: 27 AG sensors ≤2 km from an Air4Thai station read **raw median 3.0, corrected 2.5 vs reference 10.8 µg/m³** (RH ~60 %). Low-cost sensors **under-read by ~8 µg/m³ at clean levels**, so don't band from them near the 15/25 thresholds. Haze-level behaviour is unverified in TH (SG showed good agreement at 100+) | Bangkok metro 42 · Chiang Mai city 9 · north (>17°N) 49 · rest of the country ~24 |
| **CMU CCDC DustBoy** (open API) | hourly PM2.5/PM10, 30-day/1-yr/5-yr history, `nearme` ≤20 km | DustBoy low-cost PM (Plantower-class; model **unverified**) | registry: **2,299** (`/api/ccdc/stations`) | hourly | `https://open-api.cmuccdc.org/api/dustboy/{stations,nearme/{lat}/{lon}/{km},data30day/{id},…}`, `Authorization: Bearer <key>` | **yes**. Without one: `403 {"status":false,"message":"Access denied"}` | `*` | **Public accounts: max 10 stations. Attribution required**: "This data is supported by the Climate Change Data Center, Chiang Mai University (CCDC CMU)". Access may be suspended without citation | unknown. No published correction | – |
| DustBoy map feed (website) | per-station `daily_pm25` + TH/US AQI + captions | same | **546 live outdoor** in 69 provinces: **Chiang Mai 101**, Bangkok 26. All stamped `2026-09-28 15:00` at 17:13 SGT | hourly (label `15:00` at 16:13 ICT, so probably hour-beginning, **unverified**) | `https://www.cmuccdc.org/DustboyApi/getDustBoyGeo?token=<token embedded in www.cmuccdc.org HTML>&dataType=th` + a `ci_session` cookie from the homepage | page token | **none** | **Not sanctioned for third-party use.** Without cookie+Referer: `{"error":"Access denied"}` | Whether `daily_pm25` is 1-hr or 24-hr is **unverified**: named "daily" but stamped hourly. Night Bazaar read 4 vs PCD 35t 1-hr 6.2 / 24-hr 8.8 | north-heavy |
| Sensor.Community | PM2.5 (P2) | SDS011 16 · SPS30 5 · PMS5003 2 | **12 locations** in TH in the last-5-min window | 2.5 min | `https://data.sensor.community/airrohr/v1/filter/country=TH` | no | `*` | ODbL | SDS011 needs a humidity correction | scattered |
| PurpleAir | PM2.5 | PMS5003 ×2 | **unverified** (`ApiKeyMissingError`) | 2 min | `api.purpleair.com/v1/sensors` | yes | `*` | paid points, same as SG | EPA | unknown |
| WAQI / IQAir | aggregators | – | WAQI `demo` token: `{"status":"error","data":"Invalid key"}` for map bounds. iqair.com country pages: HTTP 429 | – | – | yes | – | no redistribution (same as SG) | – | Don't use |

```bash
# 17:13:15 SGT. CCDC registry (CORS *, ~1.3 MB). WARNING: the payload includes caretakers' names and phone numbers
$ curl -s -D - -H "Origin: https://example.com" https://www.cmuccdc.org/api/ccdc/stations
HTTP/2 200 · access-control-allow-origin: *
[{"dustboy_id":"6341","dustboy_uri":"tplus241","dustboy_name_en":"Ban Nam Bo Luang Health Promoting Hospital, Chiang Mai",
  "dustboy_lat":"18.6275762","dustboy_lng":"98.8608379","dustboy_status":"1","dustboy_version":"mini","db_co":"<name>","db_mobile":"<phone>",...}, ... 2299]
# → never ingest or cache this endpoint (PII). Also note leading spaces in some lat strings (" 7.88887058").

# 17:14:35 SGT. Sanctioned open API without a key
$ curl -s -i https://open-api.cmuccdc.org/api/dustboy/nearme/18.7883/98.9853/5
HTTP/1.1 403 Forbidden · Access-Control-Allow-Origin: *
{"status":false,"message":"Access denied"}

# 17:13:42 SGT. Website feed: denied with only the token, works with the homepage session cookie + Referer
{"type":"FeatureCollection","features":[{"geometry":{"coordinates":[98.9996602,18.7854765]},"properties":{"dustboy_uri":"nightbazaar",
 "dustboy_name_en":"Night Bazaar, Chiang Mai","dustboy_installed":"outdoor","daily_pm25":4,"daily_pm25_th_aqi":7,"daily_pm25_us_aqi":17,
 "daily_th_title_en":"Very Good","daily_th_color":"0,191,243","province_code":50,"log_datetime":"2026-09-28 15:00:00"}}, ... 546]}

# 17:14:44 SGT. AirGradient world dump (2,843 sensors worldwide), point-in-polygon on Natural Earth 1:50m
Thailand live<60min 141 · median age 0.9 min
  89  Prem Tinsulanonda International School 1  18.96 98.92  pm02 0.0 rh 91  I-9PSL-DE   (indoor model)

# 17:22:12 SGT. GISTDA model (note fake Z: "16:00Z" is labelled 16:00 Thai time)
$ curl -s "https://pm25.gistda.or.th/rest/getPm25byLocation?lat=18.7883&lng=98.9853"
{"status":200,"data":{"pm25":8.002712,"graphHistory24hrs":[[8.69,"2026-09-27T17:00:00.000Z"],...,[8.00,"2026-09-28T16:00:00.000Z"]],
 "pm25Avg24hrs":9.456,"datetimeEng":{"dateEng":"Monday 28 September 2026","timeEng":"16:00"},"loc":{"loctext":"พระสิงห์ เมืองเชียงใหม่ เชียงใหม่",...}}}
```

---

## National index & bands

**Thai AQI (ดัชนีคุณภาพอากาศ), PCD.** It is the max of sub-indices for PM2.5 (**24-hr rolling mean**), PM10 (24-hr), O3 (8-hr), CO (8-hr), NO2 (1-hr) and
SO2 (1-hr). Each sub-index is linear within its band. "AQI 100 = the ambient standard" (PM2.5 24-hr standard 37.5 µg/m³). Source: the Air4Thai web
app's own info page text (bundle `air4thai.pcd.go.th/webV3/js/app.*.js`, fetched 17:20 SGT) and CCDC's `assets/api/standard_aqi.json`.
The breakpoints are **verified against live data**: 119t 5.6 → AQI 9, bkp101t 12.2 → 20, 35t 8.8 → 15 (= value × 25/15). `color_id` 1 held 2.9–15.0 and
`color_id` 2 held 15.3–23.1.

| band | PM2.5 24-hr µg/m³ | AQI | TH name | PCD English | colour (RGB) | PCD advice (verbatim, condensed) |
|---|---|---|---|---|---|---|
| 1 | 0–15.0 | 0–25 | ดีมาก | Excellent (Very good) | blue 0,191,243 | "Everyone can live their life normally." |
| 2 | 15.1–25.0 | 26–50 | ดี | Satisfactory (Good) | green 0,166,81 | General: "able to do outdoor activities normally". At-risk: "abnormal symptoms should be observed, such as frequent coughing, difficulty breathing …" |
| 3 | 25.1–37.5 | 51–100 | ปานกลาง | Moderate | yellow 253,192,78 | General: "reduce the amount of time spent doing strenuous outdoor activities or exercises." At-risk: "Use … PM2.5 protective masks every time you go out" · reduce strenuous activity · see a doctor if symptoms |
| 4 | 37.6–75.0 | 101–200 | เริ่มมีผลกระทบต่อสุขภาพ | Unhealthy ("starting to affect health") | orange 242,101,34 | General: masks every time you go out · "Limiting the amount of time spent doing strenuous outdoor activities" · watch symptoms. At-risk: masks · "Avoid activities or outdoor exercise that requires a lot of energy" · follow doctor |
| 5 | ≥75.1 | ≥201 | มีผลกระทบต่อสุขภาพ | Very Unhealthy ("affects health") | red 205,0,0 | Everyone: "Should avoid outdoor activities" · masks if you must go out · people with chronic disease stay in a safe area, have medicines ready |

The Thai source for the advice is the `t1_n1…t1_n5` strings in the same bundle. The Thai text is the authoritative one, and the English strings are PCD's own (slightly machine-like) translation.

**The lag problem is identical to SG's PSI**: the official Thai "now" is a 24-hr rolling mean. Today bkp100t showed 15.4 (1-hr) vs 6.6 (24-hr).
In the burning season the gap runs the other way and matters (smoke arrives in the evening, and the 24-hr number catches up the next day).
Unlike NEA, **PCD publishes no 1-hr PM2.5 bands** (none found in the Air4Thai app or feeds, **unverified** for the Dept of Health / MOPH).

**How to map to HazeNow without contradicting PCD** (recommendation):
1. The **band chip and the verdict follow the official Thai AQI** (24-hr, PCD colours/names, PCD advice). This is the Thai equivalent of
   "borrow the authority's bands".
2. The **big number is the 1-hr PM2.5** from the same station, labelled "last hour". It is **not banded with the 24-hr breakpoints**,
   because that would create a second, unofficial Thai scale. Trend words ("Rising fast, up 30 in 2 h") and the rising-hour line
   ("Getting worse, check again in an hour") carry the "now" signal.
3. The chart is **hourly bars + the 24-hr rolling mean line**, both from Air4Thai, both in µg/m³. It is the same trust visual as SG, and
   Air4Thai gives us both series directly.
4. Open product question for the lead: whether a tentative "hourly level" chip is acceptable (e.g. PCD breakpoints applied to the 1-hr value,
   explicitly marked "indicative"). My view is **no** for v1.x. It recreates the 2013 SG confusion that SPEC v1.2 #1 removed.
5. **Masks:** PCD recommends masks at band 3 (at-risk) and band 4+ (everyone). That conflicts with SPEC v1.2 #4 (MOH-SG mask caution). In
   Thailand, follow PCD's wording, but keep HazeNow's rule "never the lead action" and the "not certified for children" filter.

---

## Language / localisation

- Verdict copy language: **Thai** (ภาษาไทย). The English UI is for expats and tourists (Chiang Mai has a large expat and digital-nomad population
  that follows AirGradient/IQAir closely).
- Use PCD's Thai band names verbatim. Use **ประชาชนทั่วไป** ("general public") and **ประชาชนกลุ่มเสี่ยง** ("at-risk group") as the profile split, as PCD does.
- Dates: Thai government sites use the Buddhist Era (GISTDA: "วันจันทร์ที่ 28 กันยายน 2569"). Show BE in the Thai UI and CE in English.
- The unit is written **มคก./ลบ.ม.** in PCD text (µg/m³ is fine in UI).
- Tone: Thai public discourse on ฝุ่น PM2.5 is highly politicised in Bangkok (WFH orders, school closures) and in the north (burning bans).
  Stay calm and neutral, attribute numbers to กรมควบคุมมลพิษ (PCD), and don't rank cities.

---

## Integration recipe

**Endpoints (all CORS `*`, no key):**
1. Station list + official index: `GET https://air4thai.pcd.go.th/forweb/getAQI_JSON.php` (134 KB, once per hour or cached daily for metadata).
2. 1-hr series for the nearest stations: `GET https://air4thai.pcd.go.th/forweb/getHistoryData.php?stationID=<a,b,c>&param=PM25&type=hr&sdate=<D-1>&edate=<D>&stime=00&etime=23`
   (a few KB for 3 stations × 48 h). A Worker can pull **all 173 stations in one call** (174 KB, 1.8 s).

**Mapping to `Snapshot`:**

| Snapshot field | source |
|---|---|
| `pm25` | last non-null `data[].PM25` for the chosen station (number, 1 dp) |
| `band` | **Thai AQI band** from `AQILast.PM25.color_id` (1–5) or from the 24-hr breakpoints. Needs a new enum for TH: `very_good`/`good`/`moderate`/`starting_to_affect`/`affects_health` |
| `officialPsi24h` → generalise to `official24h: {name:"Thai AQI", value: AQILast.AQI.aqi, param: AQILast.AQI.param}` | `AQILast.AQI` is the overall index. Its `param` is PM25 at 137 stations, O3 at 19, PM10 at 16, NO2 at 1 |
| chart 24-hr line | `AQILast.PM25.value` for now. For history, compute the rolling 24-hr mean from the hourly series (matches PCD exactly, as proved above) |
| `history` | `data[]` (hour-ending) |
| `regions` | stations (`stationID`, `nameEN`/`nameTH`, `lat`/`long` are **strings**) |
| `observedAt` | `DATETIMEDATA + "+07:00"` (hour-ending: "16:00" = the 15:00–16:00 ICT average) |
| `publishedAt` | not provided. Use our first-seen time |
| `stale` | observedAt > 2h15m old. **9 stations were 2–18 days stale today**, so drop them from nearest-station selection |
| `source` | "PCD Air4Thai" (+ "BMA" for `stationType:"BKK"`) |

**Polling:** from hh:05 ICT (= hh+1:05 SGT), poll the history endpoint for the user's 1–3 stations every 2 min until the new hour appears,
stop at hh:35, then idle. Refresh `getAQI_JSON` once per hour at ~hh:30. Never more than 1 req/min per endpoint. The server is PHP 5.3 on a
single IP, so be a polite client and use a Worker cache for the web app.

**Gotchas:**
- All numbers in `getAQI_JSON` are **strings**. Missing value = `"-1"`. Missing AQI = `"-1"`, `"-999"` or `"-9999"`. `color_id "0"` = no data.
  History uses JSON `null`.
- **`AQILast.PM25.value` is 24-hr, not 1-hr** (see above).
- `webV2` history labels are hour-beginning and rounded. `forweb` labels are hour-ending with 1 dp. Don't mix them.
- Timestamps have no offset (ICT, UTC+7). SG users are one hour ahead.
- `AQILast.time` for a station can advance while `value` stays the same (02t: stamped 15:00 then 16:00, both 7.3), because the mean is over available hours.
- `nameTH` has trailing spaces. `http://` 301s to `https://`.
- A few stations sit on the border (73t Mae Sai, 88t Nakhon Phanom). They are useful for Myanmar/Laos border towns (see cambodia-laos-myanmar.md).
- History only reaches back to 2026-07-01, so we can't compute "typical" from the API for past seasons.

---

## Verdict

**Ship in v1.x (Thailand = the easiest SEA expansion).** The data is authoritative, per-station, real 1-hr PM2.5, CORS-open and keyless,
with sub-30-min latency. Blockers:
1. **Licence**: confirm PCD's terms for redistribution (Envilink/data.go.th were geo-blocked from SG, **unverified**). Email PCD's Air Quality Data division.
2. **Banding decision**: there are no official 1-hr bands, so the verdict must follow the 24-hr Thai AQI (recommended) and the 1-hr number is shown as trend/context.
3. Undocumented endpoints on an old PHP stack: wrap them behind one adapter and add a Worker cache.

Crowd layer: AirGradient in v2 (same as SG, and the most valuable in the north). DustBoy only with a CCDC agreement (10-station cap and a PII-leaking registry). GISTDA model only as an optional map layer.
