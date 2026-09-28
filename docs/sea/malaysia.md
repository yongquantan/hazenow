# Malaysia: air quality data for HazeNow

Research captured live on **2026-09-28, 17:11–18:30 SGT (= MYT, UTC+8)**, during the haze episode.
Every `curl` below was actually run and outputs are trimmed. Anything I could not confirm with a
live call is marked **unverified**.

Snapshot at 17:00 MYT (DOE APIMS): 68 stations reporting. Highest was **IPD Serian (Sarawak, mobile) API 158
"Unhealthy"**. Others: Larkin (Johor) 96, Kuching 96, Pasir Gudang 95, Samarahan 92, Batu Pahat 88,
Cheras (KL) 84. 61 stations were "Moderate" and 6 "Good". At the same time, EPA-corrected AirGradient sensors read
**~60 µg/m³ (1-hr) in the Klang Valley and ~111 µg/m³ in Iskandar Puteri (Johor)**, which is NEA's "Elevated" band.

## TL;DR

- **Best authoritative source: DOE APIMS (eQMS portal).** It has undocumented but clean **JSON** (ArcGIS
  REST + `publicportalapims/*`), 68 stations, hourly, no key, and no rate limit observed. **It publishes the API index only, not
  a PM2.5 concentration, and the index is built on the 24-hr PM2.5 average.** Malaysia has **no public 1-hr PM2.5**
  (checked: no concentration field in any APIMS endpoint or the data.gov.my catalogue).
- **The index lags, as SG's 24-hr PSI does.** With PM2.5 dominant (67 of 68 stations today), the API can be inverted exactly to the
  **24-hr PM2.5 average** (DOE publishes the breakpoints). That gives a "24-hr line" for the chart, but not the "now" number.
- **Best crowd source: AirGradient.** It has **8 live outdoor sensors in Malaysia** (6 Klang Valley, 1 Johor, 1 Perlis) plus 1 Sabah
  sensor reading 0 (suspect). There are **none in Sarawak**, which has today's worst haze. No key, CC BY-SA 4.0, **no CORS**.
- PurpleAir, IQAir and OpenAQ need keys (verified 403/401). **Sensor.Community has 0 sensors in MY** (verified). WAQI mirrors
  DOE 1–2 h late. MET Malaysia has no PM data.
- Index: **API (Indeks Pencemar Udara, IPU)**, a US-EPA-derived max of sub-indices, with bands Good ≤50 / Moderate 51–100 / Unhealthy
  101–200 / Very Unhealthy 201–300 / Hazardous >300. The PM2.5 breakpoints differ from SG's PSI.
- **Verdict: needs proxy (v2).** Ship "official API + implied 24-hr PM2.5" plus the AirGradient 1-hr where one is near. It is
  **not "ship now"**: there is no official 1-hr PM2.5, no CORS on either source, and no licence is stated for APIMS.

---

## Authoritative (government) sources

| source | agency | what (PM2.5 1-hr? index?) | stations (count verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS for redistribution in a free MIT app | reliability notes |
|---|---|---|---|---|---|---|---|---|---|
| **APIMS current readings (ArcGIS REST)** | Jabatan Alam Sekitar (DOE), NRES | **API only** (per-station max sub-index) + dominant pollutant (`PARAM_SELECTED`: `PM2.5` at 67/68 today, `O3` at 1). **No concentration, no 1-hr PM2.5** | **68** (65 fixed `CA…` + 3 mobile `MCAQM…`), all 16 states/FTs: Sarawak 13, Johor 8, Selangor 6, Sabah 6, … | hourly. **18:00 hour: first stations at 18:01:59, 65/68 by 18:08:00, 68/68 at 18:13** (partial/null in between, see §Evidence 4) | `https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json` | no | **No for third parties.** `Access-Control-Allow-Origin: https://eqmp.doe.gov.my` (fixed, not echoed). Native OK, web needs proxy | **None stated.** DOE site has only a disclaimer ("Kerajaan Malaysia tidak bertanggungjawab…"). Undocumented endpoint. Treat as "permission unverified". Attribute "DOE Malaysia (APIMS)" | ArcGIS 11.3 behind DOE's own proxy. Frontend bundle hard-codes it (`restapi = https://eqms.doe.gov.my/api3/publicmapproxy`). URL has changed before (`apims.doe.gov.my` now 404) |
| **APIMS portal JSON** | DOE | API per station per hour (history), state lists, rankings | same stations | hourly; `apitablehourly` served 17:00 at 17:13 | `https://eqms.doe.gov.my/api3/publicportalapims/{statelist, apiranking, apitablehourly?stateid=N&datetime=YYYY-MM-DDTHH:00:00&, datatrendchart?stateid=N&datetime=…&}` | no | same fixed `eqmp` origin | same | `datatrendchart` = 25 hourly points per station (24 h history in one call, good for the chart). `apiranking` returned values that differ from the map layer (Langkawi 24 vs 44). Don't use it |
| data.gov.my `air_pollution` | DOSM / DOE | **monthly national mean** concentration per pollutant | national | **last row 2022-12-01** (verified) | `https://api.data.gov.my/data-catalogue/?id=air_pollution` | no | `*` | **CC BY 4.0** (stated on dataset page) | Useless for "now". Proves the open-data portal has no hourly AQ dataset |
| data.gov.my weather (MET Malaysia) | MET Malaysia via data.gov.my | forecasts and warnings, **no PM / haze** | n/a | issued 17:00 today | `https://api.data.gov.my/weather/{forecast,warning}/` | no | `*` | CC BY 4.0 (portal) | Not an AQ source. `api.met.gov.my/v2.1` returns 401 (`METToken`) |
| WAQI / aqicn mirror of APIMS | WAQI | converted index | 48 pen. + 20 Borneo markers | at 17:16 still showing **15:00/16:00** while DOE had 17:00 | undocumented `mapq` | token | – | redistribution forbidden | **Don't use** (stale, ToS) |

### Evidence (all times MYT = SGT)

**1. APIMS current readings: 17:12:30**
```bash
$ curl -s -i -H "Origin: https://example.com" \
  "https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json"
HTTP/2 200
content-type: application/json; charset=UTF-8
access-control-allow-origin: https://eqmp.doe.gov.my          # fixed, NOT our origin -> browser blocked
{"displayFieldName":"STATE_NAME", ..., "features":[
 {"attributes":{"STATION_ID":"CA34J","DATETIME":1790614800000,"API":95.0,"API_PM10":null,
   "PARAM_SELECTED":"PM2.5","PARAM_SYMBOL":"**","CLASS":"Moderate",
   "STATION_LOCATION":"Pasir Gudang, JOHOR","LONGITUDE":103.89366,"LATITUDE":1.470121,
   "PLACE":"Sek. Men. Keb Pasir Gudang 2 Johor","STATION_CATEGORY":"Sub Urban","STATE_NAME":"Johor","REGION_NAME":"Southern"}},
 {"attributes":{"STATION_ID":"MCAQM002","API":158.0,"PARAM_SELECTED":"PM2.5","CLASS":"Unhealthy",
   "STATION_LOCATION":"IPD Serian","STATION_CATEGORY":"Mobile ","STATE_NAME":"Sarawak", ...}},
 {"attributes":{"STATION_ID":"CA02K","API":44.0,"PARAM_SELECTED":"O3","PARAM_SYMBOL":"c","CLASS":"Good","STATION_LOCATION":"Langkawi, KEDAH", ...}}, ... 68 features]}
```
- **`DATETIME` gotcha:** `1790614800000` decodes to **2026-09-28T17:00:00Z**, but the reading is **17:00 MYT**. DOE
  stores local wall-clock time as if it were UTC, even though the service says `"datesInUnknownTimezone": false`. Decode it as
  UTC, then relabel it `+08:00`. Don't convert it. (The portal JSON uses naive strings: `"DATETIME":"2026-09-28T17:00:00"`.)
- Symbols: `**` = PM2.5, `c` = O3 (from `PARAM_SELECTED`). Use `PARAM_SELECTED`, not the symbol.
- Service directory (`…/publicmapproxy/PUBLIC_DISPLAY?f=json`) lists only this AQ layer plus water-quality layers. **There is no
  concentration layer.** I grepped the eQMS JS bundles (`app.b7aa2f9f.js`, `777.1321c95c.js`, and 7 other chunks) for
  concentration fields and found none. The APIMS module only ever reads `API`/`CLASS`/`PARAM_SYMBOL`.

**2. Portal JSON: 17:12:55**
```bash
$ curl -s "https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly?stateid=1&datetime=2026-09-28T17:00:00&"
{"api_table_hourly":[{"PAGE_ROWNUM":1,"PAGE_TOTALROW":200,"STATION_ID":"CA29J","STATE_ID":1,
  "STATION_LOCATION":"Segamat, JOHOR","DATETIME":"2026-09-28T17:00:00","API":76,"PARAM_SYMBOL":"**"}, ...]}
$ curl -s "https://eqms.doe.gov.my/api3/publicportalapims/datatrendchart?stateid=14&datetime=2026-09-28T17:00:00&"
{"highcharts_bar":[{"STATION_ID":"CA16W","DATETIME":"2026-09-27T17:00:00","API":…,"EPOCHDATE":…,"API_CATEGORY":"Moderate"}, … 25 points/station]}
$ curl -s https://eqms.doe.gov.my/api3/publicportalapims/statelist
[{"STATE_ID":1,"STATE_NAME":"Johor",...}, ... 16 states: 10 Selangor, 13 Sarawak, 14 WP Kuala Lumpur ...]
```
Last 10 hours of API (to 17:00), showing the slow 24-hr climb:
- Johor Larkin `CA33J` 77→96, Pasir Gudang `CA34J` 85→95, Batu Pahat `CA31J` 72→88
- Sarawak Kuching `CA65Q` 91→96, Samarahan `CA64Q` 74→92, Sri Aman `CA63Q` 69→83
- KL Cheras `CA16W` 72→84, Batu Muda `CA15W` 59→71. Selangor Shah Alam `CA20B` 68→75, Klang `CA21B` 59→69

**3. Rate limit and caching.** 12 back-to-back ArcGIS queries and 8 portal calls all returned `200`. No `Cache-Control`/`ETag`.
Be polite anyway: 1 req/min max, and cache in the Worker.

**4. Publication latency (1-min polling of both endpoints from 17:13 to 18:30)**
```
time      | ArcGIS layer: stations by DATETIME (of 68)     | sample API                          | portal apitablehourly (Johor) latest
17:59:58  | {17:00: 68}                                    | CA34J 95  CA65Q 96  CA16W 84        | 17:00 (76)
18:00:59  | {17:00: 68}                                    |                                     | 17:00
18:01:59  | {18:00: 42}   26 stations DATETIME+API = null  | CA34J 100 CA65Q null CA16W null     | 17:00
18:03:59  | {18:00: 47}                                    |                                     | 17:00
18:06:00  | {18:00: 42}   (went backwards)                 |                                     | 17:00
18:08:00  | {18:00: 65}   3 still null                     | CA34J 100 CA65Q 96 CA16W 87 MCAQM002 158 | 17:00
18:10:02  | {18:00: 65}                                    |                                     | 18:00 (78)
18:13:02  | {18:00: 68}   all complete, stable to 18:30    | CA34J 100 CA65Q 96 CA16W 87 MCAQM002 158 | 18:00 (78)
(17:55:06: one non-JSON response from both endpoints, OK again at 17:56)
```
**Result:** the ArcGIS layer starts serving the new hour **~1–2 min after the hour**, but it is **rewritten in place station
by station**. For about 7 minutes, a third of the stations have `DATETIME: null, API: null`, and the count even went backwards (47 → 42).
Most stations are complete by **~hh:08**. The portal `apitablehourly` switches over later (~hh:10). **Gotcha:** a reader that
polls at hh:02 sees many "offline" stations that are only mid-update. Treat a null `API` in the first 10 min of the hour as "keep
the previous hour's value", not "offline". The poll plan: first fetch at hh:08, then retry at hh:10/hh:15 for stragglers.

**5. DOE methodology PDF** (`https://eqms.doe.gov.my/Documents/APIMS/API_Calculation.pdf`, HTTP 200, fetched 17:14):
the averaging period is "PM2.5: **24 Jam / 24 hours**" (PM2.5 was added in 2017), "API = MAX(SI SO2, SI PM10, SI PM2.5, SI O3(8h), SI O3(1h), SI NO2, SI CO)".

**6. Open data / MET**
```bash
$ curl -s "https://api.data.gov.my/data-catalogue/?id=air_pollution&sort=-date&limit=3"      # CORS *
[{"date":"2022-12-01","pollutant":"SO2","concentration":0.0013},{"date":"2022-12-01","pollutant":"CO",...},{"date":"2022-12-01","pollutant":"PM 10",...}]
$ curl -s -i "https://api.met.gov.my/v2.1/locations?locationcategoryid=STATE"
HTTP/2 401   www-authenticate: METToken   {"detail":"Authentication credentials were not provided."}
```

---

## Crowd / low-cost sensor networks

| source | sensor type | what | stations in MY (verified today) | cadence & latency (verified) | endpoint | key? | CORS | licence | correction needed | coverage by city | reliability notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **AirGradient** | PMS5003T (Open Air O-1PST), 2 × I-9PSL-DE | raw `pm02` (world API) / **EPA-corrected `pm25`** (map API), RH, hourly history | **8 live in MY** + 1 Sabah reading 0.0 (suspect) | ~1 min, `measuredAt` within 0–60 s of wall clock at 17:15 | `api.airgradient.com/public/api/v1/world/locations/measures/current`; `map-data-int.airgradient.com/map/api/v1/measurements/current/area?...` | no | **none** (only `Access-Control-Allow-Credentials`) | CC BY-SA 4.0 | EPA-extended + per-sensor `k`. **No DOE 1-hr anchor to learn `k` against** (see below) | Klang Valley 6 (Cyberjaya, KL ×4, Shah Alam), Johor 1 (Eco Botanic, Iskandar Puteri), Perlis 1 (Kangar), Sabah 1 (Tambulaung, 0 µg/m³), **Sarawak 0, Penang 0, Kuantan 0** | Mont Kiara and Setapak are `I-9PSL-DE` models (the AirGradient ONE body). Check they are really outdoors before use. KL sensor RH 33–44 % (enclosure heat) |
| PurpleAir | PMS5003 ×2 | – | **unverified** (403 without key) | 2 min | `api.purpleair.com/v1/sensors` | **yes** | `*` | PurpleAir ToS | EPA | unknown | Worker-only if ever |
| IQAir / AirVisual | own + DOE | US AQI | **unverified** (`incorrect_api_key`) | hourly | `api.airvisual.com/v2/nearest_city` | yes | ? | no redistribution | – | – | Don't use |
| OpenAQ v3 | aggregator | – | **unverified** (401). Note: AirGradient's map pulls OpenAQ "Reference" stations for **Thailand** in the same bbox but **none for Malaysia**, which suggests DOE data isn't in OpenAQ (inference, unverified) | – | `api.openaq.org/v3/locations?iso=MY` | yes | yes | per provider | – | – | Redundant |
| Sensor.Community | SDS011 / PMS | – | **0** (country=MY, and 40–60 km radius around KL, JB, Kuching, KK, Penang all return `[]`) | – | `data.sensor.community/airrohr/v1/filter/country=MY` | no | `*` | ODbL | – | none | Nothing to read |
| WAQI crowd ("A…" markers) | mixed | US AQI | 26 in the peninsula bbox (many are Thai/Sumatran, several dead since May–Jul) + 7 Borneo. Live MY ones: the AirGradient duplicates, "Wisma Satok, Kuching" (130), "Bandar Baru Air Putih" (50), an unnamed one at Belaga, Sarawak (157), and **"MCAQM003, station" (156)**. The last is a DOE mobile-station ID, while APIMS shows `MCAQM003` Politeknik Kota Kinabalu API **57** | 1–60 min | undocumented | token | – | **forbids redistribution** | – | – | Evidence only. The Kuching and Belaga crowd sensors' **network is unverified** (not AirGradient, maybe PurpleAir/IQAir) |
| University / local (UKM AiRBOXSense, UMS AQUAMS schools, UTM) | various | – | **unverified: no public live feed/API found** (web search. UKM's AiRBOXSense is a commercial platform, and UMS AQUAMS is a UNICEF school project) | – | none found | – | – | – | – | – | Worth a partnership email. Not a data source today |

### Evidence

```bash
# 17:15:16 world dump (2,842 sensors), filtered to MY bboxes
$ curl -s https://api.airgradient.com/public/api/v1/world/locations/measures/current -o ag.json
 189728 Sejati Residences Cyberjaya  2.9130,101.6406 pm02=69.7 rh=33 age=1m O-1PST
 166027 ENVIRO EXCELTECH SDN BHD     3.0207,101.7142 pm02=67.5 rh=41 age=0m O-1PST
  90287 Setia Eco Park               3.1113,101.4764 pm02=73.5 rh=43 age=0m O-1PST
  86311 Taman Tun Dr. Ismail         3.1411,101.6275 pm02=80.3 rh=44 age=1m O-1PST
 207035 KLCC                         3.1566,101.7085 pm02=84.8 rh=38 age=0m O-1PST
 203630 Mont Kiara                   3.1696,101.6528 pm02=79.5 rh=54 age=1m I-9PSL-DE
 206811 Setapak                      3.1922,101.7232 pm02=61.0 rh=39 age=0m I-9PSL-DE
 208606 Eco Botanic (Johor)          1.4421,103.6174 pm02=131.8 rh=53 age=0m O-1PST
 160109 SM SAINS TUANKU SYED PUTRA   6.4276,100.2165 pm02=18.8 rh=44 age=1m O-1PST   (Kangar, Perlis)
 154357 Tambulaung (Sabah)           6.2269,116.4517 pm02=0.0  rh=65 age=1m O-1PST   (suspect)

# 17:15:36 map API (EPA-corrected pm25). No CORS header returned for Origin: https://example.com
$ curl -s -D- -H "Origin: https://example.com" "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=99.6&ymin=1.4&xmax=104.7&ymax=6.8&zoom=12&measure=pm25"
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
{"data":[{"locationId":119362966,"locationName":"Eco Botanic","pm25":103.1,"rhum":53,"measuredAt":"2026-09-28T09:14:13.000Z","dataSource":"AirGradient"},
 {"locationId":110009290,"locationName":"KLCC","pm25":68.1,...},{"locationId":956,"locationName":"Taman Tun Dr. Ismail","pm25":65.1,...},
 {"locationId":98066951,"locationName":"ENVIRO EXCELTECH SDN BHD","pm25":55.3,...},{"locationId":52094943,"locationName":"Sejati Residences Cyberjaya","pm25":57.7,...},
 {"locationId":1087,"locationName":"Setia Eco Park","pm25":59.8,...},{"locationId":98500617,"locationName":"Mont Kiara","pm25":63.6,...},
 {"locationId":108254583,"locationName":"Setapak","pm25":50.3,...},{"locationId":11157428,"locationName":"SM SAINS TUANKU SYED PUTRA","pm25":11.8,...},
 {"locationId":196843,"locationName":"child development centers, Betong","sensorType":"Reference","dataSource":"OpenAQ",...}  # Thai, not MY
 ...15 items]}
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=109.5&ymin=0.8&xmax=119.5&ymax=7.5&zoom=12&measure=pm25"
{"data":[{"locationName":"Belait","pm25":2.7,...(Brunei)},{"locationName":"Tambulaung","pm25":0,...}]}      # Sarawak: none

$ curl -s -i "https://api.purpleair.com/v1/sensors?fields=pm2.5_10minute&nwlng=99.6&nwlat=7.4&selng=119.3&selat=0.85"
HTTP/2 403  {"error":"ApiKeyMissingError", ...}
$ curl -s "https://api.airvisual.com/v2/nearest_city?lat=3.14&lon=101.69"      -> {"status":"fail","data":{"message":"incorrect_api_key"}}
$ curl -s -i "https://api.openaq.org/v3/locations?iso=MY&limit=100"            -> HTTP/2 401
$ curl -s "https://data.sensor.community/airrohr/v1/filter/country=MY"         -> []
```

**Crowd vs DOE cross-check (this is also the validation of the API→PM2.5 inversion below).** These are AirGradient
map-API hourly buckets (EPA-corrected), averaged over the 24 full hours to 08:00Z (16:00 MYT), compared with the DOE API
at 17:00 inverted to a 24-hr PM2.5:

| AirGradient sensor | AG 24-h mean | nearest DOE station | DOE API 17:00 | implied DOE 24-hr PM2.5 | AG last full hour (16:00) |
|---|---|---|---|---|---|
| Eco Botanic (JB) | **44.2** | Larkin `CA33J` / Pasir Gudang `CA34J` | 96 / 95 | **47.3 / 46.5** | **111.4** |
| KLCC | 26.1 | Batu Muda `CA15W` / Cheras `CA16W` | 71 / 84 | 27.7 / 37.9 | 59.6 |
| TTDI | 26.8 | Batu Muda `CA15W` | 71 | 27.7 | 60.6 |
| Enviro Exceltech (KL south) | 23.3 | Cheras `CA16W` | 84 | 37.9 | 61.2 |

The 24-h means agree within ~5–15 % for the closest pairs. So (a) the inversion is right, and (b) AirGradient
is usable in MY. It also shows **the lag problem in numbers**: in Johor Bahru the air right now is ~111 µg/m³
(NEA "Elevated", and close to "High"), while DOE shows API 96 "Moderate / no restriction for outdoor activities".

---

## National index & bands

**Air Pollutant Index (API) / Indeks Pencemar Udara (IPU)**, DOE Malaysia. Source: DOE, *Pengiraan Indeks Pencemar Udara*
(`https://eqms.doe.gov.my/Documents/APIMS/API_Calculation.pdf`, fetched 2026-09-28).

- Pollutants and averaging: SO₂ 1 h, NO₂ 1 h, CO 8 h, O₃ 8 h and 1 h, PM10 **24 h**, PM2.5 **24 h** (since 2017).
  API = the max sub-index. The dominant pollutant is flagged per station.
- **The lag problem is the same as SG's 24-hr PSI:** the API is recomputed every hour, but its PM term is a 24-hr average. Malaysia
  publishes **no** 1-hr PM2.5 and no "1-hr guide" like NEA's. The whole public system is 24-hr based.
- PM2.5 sub-index breakpoints (24-h avg, µg/m³). These are **not** SG's PSI breakpoints:

| API | PM2.5 24-h (µg/m³) |
|---|---|
| 0–50 | 0 – 12.0 |
| 51–100 | 12.1 – 50.4 |
| 101–150 | 50.5 – 55.4 |
| 151–200 | 55.5 – 150.4 |
| 201–300 | 150.5 – 250.4 |
| 301–400 | 250.5 – 350.4 |
| 401–500 | 350.5 – 500.4 |

  This is the old US AQI PM2.5 table, but with DOE's own **band names**. So 24-h PM2.5 of 55.5 µg/m³ is API 151 and still
  "Unhealthy", while in SG 56 µg/m³ is 24-hr PSI 101 ("Unhealthy") and 1-hr "Elevated".
- Bands (status text and colours as rendered by APIMS JS and the PDF):

| API | BM | EN | APIMS colour |
|---|---|---|---|
| 0–50 | Baik | Good | blue `#3D8AF7` |
| 51–100 | Sederhana | Moderate | green `#7CDE6B` |
| 101–200 | Tidak Sihat | Unhealthy | yellow `#FFFF00` |
| 201–300 | Sangat Tidak Sihat | Very Unhealthy | orange |
| >300 | Merbahaya | Hazardous | red |
| >500 | Kecemasan | Emergency | – |

- Official health advice (DOE PDF p. 24–25, verbatim EN):
  - 0–100: "No restriction for outdoor activities to the public. Maintain healthy lifestyle."
  - 101–200: "Limited outdoor activities for the high risk people." (Effect: "Worsen the health condition for elderly, pregnant woman, children and people who is with heart and lung complications.")
  - 201–300: "Old and high risk people are advised to stay indoor and reduce physical activities. People with health complications are advised to see doctor."
  - >300: "Old and high risk people are prohibited for outdoor activities. Public are advised to prevent from outdoor activities."
  - >500: "Public are advised to follow orders from National Security Council …"
  - MOH Malaysia's haze-specific advisories: **unverified** (not fetched).

**Mapping to HazeNow's "1-hr PM2.5 + band + verdict" without contradicting DOE:**
1. The official number on screen is **the DOE API + DOE band name** for the nearest station, labelled "DOE API (24-hour
   based)". This is the equivalent of SG's "official 24-hr PSI" line. Never re-label it.
2. When `PARAM_SELECTED == "PM2.5"`, invert the API to **24-hr PM2.5 µg/m³** for the chart line (the inverse of the table
   above, piecewise linear). When another pollutant dominates, don't invert. Show the API only.
3. The "now" number can only come from a **crowd sensor (AirGradient, EPA-corrected)** within ~5–10 km, shown as "~" with a
   range and "Community sensor, not DOE". Where none exists (all of Sarawak, most of the country), **show the DOE API only, with no
   1-hr number and no verdict upgrade**.
4. Bands for the 1-hr crowd value: DOE has no 1-hr bands. Using NEA's 1-hr bands in MY would bring in a foreign authority
   and could clash with DOE ("Moderate"/no restriction vs our "Elevated"). Options, from safest down: (a) show the number and trend
   only, and keep the verdict from the DOE band. (b) Use WHO/US-EPA-style wording clearly attributed ("By NEA Singapore's 1-hr guide this would be Elevated").
   **Decision needed (product).** My recommendation is (a) for v2.0, with the verdict copy saying "Air is worse right now than
   the 24-hour index shows" when the crowd 1-hr value is more than 1.5× the implied 24-hr PM2.5.

## Language / localisation

- Official language: **Bahasa Melayu**. DOE publishes bilingual BM/EN (band names above, verbatim). English is widely
  used. Chinese and Tamil are common secondary languages (no official AQ copy in them, unverified).
- Use DOE's own terms: "IPU" in BM, "API" in EN. The haze is "jerebu". Use the band names exactly (Baik / Sederhana / Tidak Sihat / Sangat
  Tidak Sihat / Merbahaya).
- Framing: haze is transboundary and politically sensitive (ASEAN AATHP). Keep the copy neutral and avoid blaming sources. DOE's
  own blue for "Good" differs from NEA's palette. Use DOE's band semantics, but keep HazeNow's muted palette and don't
  alarm-colour "Tidak Sihat".
- School closures are triggered by API thresholds (Ministry of Education rule, historically API >200, **unverified for 2026**).
  It's worth a factual line, but only after checking it.

## Integration recipe

1. **Fetch (Worker, not client: no CORS):** `GET …/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=STATION_ID,DATETIME,API,PARAM_SELECTED,CLASS,LATITUDE,LONGITUDE,STATION_LOCATION,STATE_NAME,STATION_CATEGORY&returnGeometry=false&f=json`
   (~16 KB). History for the chart: `publicportalapims/datatrendchart?stateid=<1..16>&datetime=<YYYY-MM-DDTHH>:00:00&` (25 h per station).
2. **Fields → Snapshot:**
   - `regions[STATION_ID] = {pm25: <crowd 1-hr or null>, psi24h: API, lat: LATITUDE, lon: LONGITUDE}`. Here `psi24h` holds the API. Rename it
     to `officialIndex` in a multi-country model, because it is not a PSI.
   - `officialPsi24h` → `API` of the nearest station. `HistoryPoint.pm25Avg24h` → inverse(API) when PARAM_SELECTED is PM2.5.
   - `observedAt` = `DATETIME` decoded as UTC and **relabelled +08:00** (e.g. `1790614800000` → `2026-09-28T17:00:00+08:00`).
   - `publishedAt`: not provided. Use the first-seen time in the Worker.
   - `source`: "DOE Malaysia (APIMS)" (+ "AirGradient contributors, CC BY-SA 4.0" when crowd is used).
   - `instantPsi`: **do not compute**. SG's PSI formula is meaningless in MY.
3. **Nulls:** `API` null/"NA"/"N/A" means offline (the APIMS JS checks all three). Stations drop to "N/A" (grey `#b3b3b3`). Mobile
   stations (`MCAQM…`, `STATION_CATEGORY: "Mobile "`, trailing space!) move over time. Re-read lat/lon every fetch.
4. **Polling:** first fetch at **hh:08** (65/68 stations done by then today), then hh:10 and hh:15 for stragglers, then idle
   until the next hour. Merge per station: during hh:00–hh:10, a null `API`/`DATETIME` means "mid-update, keep the previous hour". ≤1 req/min. No rate limit was observed, but it is a government ArcGIS box, so cache in the Worker and fan out.
5. **Gotchas:** fixed `eqmp` CORS origin (a typo of `eqms`?), so it may be "fixed" to lock down further. The host moved from
   `apims.doe.gov.my` (now 404) to `eqms.doe.gov.my` without notice. `apiranking` disagrees with the map layer. Wrap everything in
   one adapter with schema checks. All three countries share UTC+8. Sabah/Sarawak are the same timezone.
6. **Crowd:** reuse the SG AirGradient adapter (EPA-extended correction). Per-sensor `k` can't be learned against a DOE 1-hr
   value (there isn't one). Learn it against the **implied DOE 24-hr PM2.5** using a 24-h rolling mean of the sensor, which the cross-check
   above shows is workable (JB 44.2 vs 46.5–47.3).

## Verdict

**v2 (needs proxy): feasible but degraded.**
- Official layer: DOE APIMS is solid JSON with good coverage (68 stations, every state, Sarawak well covered) and hourly updates.
  It needs a Worker (no CORS) and has no stated licence. **Ask DOE for written permission** (the hard blocker for a public MIT app that
  redistributes the data). Until then, the Worker should only relay and cache, with attribution.
- "Right now": **there is no official 1-hr PM2.5 in Malaysia.** HazeNow's core promise holds only where AirGradient sensors
  exist: Klang Valley (6) and Johor Bahru (1). There are none in Sarawak (today's hotspot: Serian API 158, Kuching 96) or Penang.
  Elsewhere the honest product is "DOE's 24-hour-based API, plus the trend", not "right now".
- Key blockers: (1) no 1-hr concentration from DOE, (2) no CORS, (3) licence unstated, (4) sparse crowd sensors outside the
  Klang Valley, (5) a product decision on 1-hr bands in a country whose authority has none.
