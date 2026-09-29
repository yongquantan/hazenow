# Vietnam — air quality data for HazeNow

Research notes captured live on **2026-09-28, 17:11–17:29 SGT = 16:11–16:29 ICT (UTC+7)**, from a Singapore IP.
Every `curl` below was actually run. Outputs are trimmed. Anything I could not reach or confirm is marked **unverified**.
Context: clean, rainy afternoon (Hanoi raw PM2.5 3–10 µg/m³, HCMC 5–48 µg/m³). Vietnam's worst season is Oct–Mar in the north.
Institutional note: MONRE has been merged into the Ministry of Agriculture and Environment. `baotainguyenmoitruong.vn` now redirects to `nongnghiepmoitruong.vn` (observed today), but CEM keeps its `cem.gov.vn` domain.

## TL;DR (≤6 bullets): best authoritative source, best crowd source, index used, feasibility verdict (ship now / needs proxy / blocked)

- **Best authoritative source in practice: Hanoi's `moitruongthudo.vn`.** It has undocumented but open JSON: **5-minute PM2.5 in µg/m³ (~3 min latency)** plus hourly VN_AQI, with no key and **no CORS**. It lists **4 stations, but only 2 were current today** (the 2 city-owned ones have been stale since 25 Sep 09:00). **No licence stated.**
- **National authority: VEA/CEM (`cem.gov.vn`, "Envisoft").** It runs **≥20 automatic stations** (16 live today, seen through WAQI's mirror), including HCMC. But `cem.gov.vn` and `envisoft.gov.vn` hit us with a **CAPTCHA wall** after the first request, and there is no documented API. **Blocked without an agreement.**
- **Best crowd source: none is shippable at scale.** **PAM Air** (claims 400+ devices in 63 provinces) sells its API as a B2B service, and its web map authenticates with a JWT. **AirGradient** has only **3 sensors** (1 Hanoi, 2 HCMC). **Sensor.Community** has **3 PM sensors** in Hanoi and 0 in HCMC/Da Nang.
- **Index: VN_AQI (Decision 1459/QĐ-TCMT, 2019).** It uses an hourly AQI with a **12-hour NowCast** for PM, and 6 bands (Tốt/Trung bình/Kém/Xấu/Rất xấu/Nguy hại). I **verified the PM2.5 breakpoints 0/25/50/80 µg/m³ → AQI 0/50/100/150** by reproducing Hanoi's published hourly AQI exactly (20/20 hours).
- **Verdict: v2, Hanoi first, via proxy** (moitruongthudo + CEM stations it re-serves). National/HCMC coverage **needs a CEM data agreement**, and the crowd layer **needs a PAM Air partnership**.

## Authoritative (government) sources

| source | agency | what (PM2.5 1-hr? index?) | stations (count verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS for redistribution in a free MIT app | reliability notes |
|---|---|---|---|---|---|---|---|---|---|
| **moitruongthudo.vn** (Cổng thông tin quan trắc môi trường thủ đô Hà Nội) | Hanoi Natural Resources & Environment Technical Centre (Trung tâm Kỹ thuật TN&MT Hà Nội, under the Hanoi environment department) | **5-min PM2.5, PM10, NO₂, CO, SO₂, O₃ in µg/m³** (`/public/dailystat/{id}`, 30 days) + **hourly VN_AQI sub-index per pollutant** (`/public/dailyaqi/{id}`) + station list with current AQI (`/api/site`) | **4 listed**: #48 Nhân Chính and #49 Giải Phóng/Bạch Mai (both "envisoft" = CEM stations) are **current**. #14 Lưu Quang Vũ and #15 Minh Khai (city-owned) have been **stale since 2026-09-25 09:00**. #49 PM2.5 is `null` in the last 5-min samples (PM10 fine) | 5-min series last point 16:15 ICT at 16:18 ICT (**~3 min**). Hourly AQI for "16:00" present at 16:18 ICT | `https://moitruongthudo.vn/api/site` · `/public/dailystat/{id}` · `/public/dailyaqi/{id}` (the `/api/indicator` and `/api/view` routes return an HTML error page to curl) | no | **none** (no `Access-Control-Allow-Origin`) | **none stated** (contact page lists staff only). **Unverified**. Ask before redistribution | Laravel app, sets a session cookie but doesn't require it for these routes. Undocumented, so it may change. City-owned stations go stale for days |
| **CEM portal** `cem.gov.vn` / `envisoft.gov.vn` | Vietnam Environment Administration → Centre for Environmental Monitoring (CEM) | hourly PM2.5, PM10, NO₂, CO, SO₂, O₃, VN_AQI | **≥20 CEM stations** on WAQI's VN map at zoom 6 (clustered, so a floor), **16 live**: Hanoi ×2, HCMC ×2 (Q2 Lê Hữu Kiều, 20 Lý Chính Thắng), Bình Dương, Vũng Tàu, Hưng Yên, Hà Nam, Quảng Nam, Quảng Ngãi, Long An, Quảng Ninh… | Via WAQI mirror: 09:00 UTC (16:00 ICT) values present at 16:23 ICT. **Direct cadence unverified** | **no documented API**. First GET returned 85 KB HTML, then **every GET (17:17–17:29 SGT) returned "Validation request" CAPTCHA** (`/captcha_resp`) for both hosts | ? | ? | **unverified**. CEM is credited as WAQI's source ("Vietnam Center For Environmental Monitoring Portal") | Anti-bot is aggressive. Scraping is not acceptable. Needs a formal request |
| HCMC own feed | HCMC environment department | – | **none found**. HCMC stations visible publicly are CEM's | – | – | – | – | – | Search found only CEM/WAQI/IQAir for HCMC (**unverified** that no HCMC portal exists) |
| US Embassy Hanoi / Consulate HCMC (AirNow DOS) | US Dept of State | 1-hr PM2.5 (FEM) | sites `HN1010001`, `HC1010001` listed "Active" | **no rows in today's AirNow hourly files** (00–08 UTC). WAQI shows Hanoi embassy "-" | `files.airnowtech.org/airnow/YYYY/YYYYMMDD/HourlyData_*.dat` | no | – | public domain | Not reporting today |

Evidence:

```bash
# 17:17:50 SGT (16:17 ICT): station list. JSON, no CORS header
$ curl -s -i -H "Origin: https://example.com" https://moitruongthudo.vn/api/site
HTTP/1.1 200 OK
Server: Apache/2.4.18 (Ubuntu)
Set-Cookie: laravel_session=...; Max-Age=7200
Content-Type: application/json
[{"id":14,"name":"Số 46, phố Lưu Quang Vũ","latitude":21.0152,"longtitude":105.7999,"code":"HN_CCMT_KHITY3","type":"normal",
  "aqi":67,"aqiText":"Trung bình","temp":"27.8","humid":"70.2","aqi_time":"25-09-2026",...},
 {"id":15,"name":"Minh Khai - Bắc Từ Liêm","code":"HN_CCMT_KHIPMK","aqi":106,"aqiText":"Kém","aqi_time":"25-09-2026",...},
 {"id":48,"name":"Công viên Nhân Chính - Khuất Duy Tiến","latitude":21.0031,"longtitude":105.7947,
  "code":"31390908889087377344742439468","type":"envisoft","aqi":33,"aqiText":"Tốt","aqi_time":"28-09-2026",...},
 {"id":49,"name":"Số 1 đường Giải Phóng - phường Bạch Mai","code":"31390903576425084107499649578","type":"envisoft","aqi":35,...}]
# note the misspelt "longtitude" field, and the envisoft `code` = WAQI's CEM station id (same station)

# 17:18:20 SGT: 5-min raw concentrations (ICT, µg/m³, strings, null = missing)
$ curl -s https://moitruongthudo.vn/public/dailystat/48
{"PM2.5":[{"time":"2026-08-29 00:00","value":"15.49"}, ... ,{"time":"2026-09-28 16:15","value":"9.68"}],
 "PM10":[...], "NO2":[...], "CO":[...{"value":null}], "SO2":[...], "O3":[...]}      # 8,844 rows ≈ 30 days × 5 min
# station 14/15: same shape but HOURLY rows, last "2026-09-25 09:00"

# hourly VN_AQI sub-index per pollutant (NOT µg/m³), last 30 hours
$ curl -s https://moitruongthudo.vn/public/dailyaqi/48
{"PM2.5":[...,{"time":"2026-09-28 14:00","PM25":50,"color":"#00e400","value":50},
          {"time":"2026-09-28 15:00","value":30,...},{"time":"2026-09-28 16:00","value":19,...}], "PM10":[...], ...}
$ curl -s https://moitruongthudo.vn/public/dailyaqi/49 | jq '.["PM2.5"][-1]'   # {"time":"2026-09-28 16:00","value":0}  ← 0 = no data, not clean air

# 17:17 SGT: CEM
$ curl -s -A "Mozilla/5.0" https://cem.gov.vn/ | head -c 200
<html><body ...><title>Validation request</title><h3 align="center">User validation required to continue..</h3>
... <img src = "/captcha.gif"> <form name="input" action="/captcha_resp" method="POST">
# first probe at 17:14:47 got HTTP 200 / 85,568 B, then the CAPTCHA on every retry (17:17, 17:23, 17:29). envisoft.gov.vn: same page.

# 17:14–17:23 SGT: CEM stations via WAQI's mirror (EVIDENCE ONLY, WAQI ToS forbid redistribution)
$ curl -s https://airnet.waqi.info/airnet/feed/hourly/477292
{"atrb":{"name":"Vietnam Center For Environmental Monitoring Portal (cổng thông tin quan trắc môi trường)","url":"http://cem.gov.vn/"},
 "data":{"pm25":[...,{"time":"2026-09-28T09:00:00Z","mean":7.44}], ...}}
# = Hà Nội Nhân Chính = moitruongthudo #48 (5-min values 3.5–6.9 over 16:00–16:15 ICT, consistent)
# 476167 HCM Q2 Lê Hữu Kiều: pm25 41.5 → 46.9 → 48.1 (07–09 UTC) · 476182 HCM 20 Lý Chính Thắng: 9.6 → 5.76 → 4.56

# 17:23 SGT: AirNow DOS
$ curl -s https://files.airnowtech.org/airnow/today/monitoring_site_locations.dat | grep -i -E "hanoi|ho chi minh"
HN1010001|PM2.5|0001|Hanoi|Active|HN1|U.S. Department of State Vietnam - Hanoi|DSVM|21.021939|105.818806|...
HC1010001|PM2.5|0001|Ho Chi Minh City|Active|HC1|U.S. Department of State Vietnam - Ho Chi Minh|DSVM|10.782773|106.700035|...
$ grep -c -E 'HN1010001|HC1010001' HourlyData_20260928{00,02,04,06,08}.dat      # 0 in each
```

## Crowd / low-cost sensor networks

| source | operator | sensor type | what | stations (verified today) | cadence & latency | API/endpoint | key? | CORS | licence | correction needed | coverage by city | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **PAM Air** | DLCorp (Vietnam), USAID-backed pilots | light-scattering PM2.5 + electrochemical gases (per their site) | PM2.5, VN_AQI | claims **400+ devices, 63 provinces**. **Count unverified** (no open endpoint) | real-time (claimed). **Unverified** | `api.pamair.org` (web map `maps.pamair.org` gets a JWT via `customer/key` using a client id/secret embedded in its JS bundle). The public API is a **paid "Dịch vụ API"** for partners | **yes** (partner credentials) | **unverified** | proprietary. **Unverified** | vendor-calibrated (method **unverified**) | nationwide, densest in Hanoi/HCMC (claimed) | **Do not reuse the web app's embedded credentials**. That would bypass their access control. Pursue a partnership |
| **AirGradient** | community | PMS5003(T) | PM2.5 raw / EPA-corrected | **3 in VN**: OceanPark (Hanoi, Gia Lâm), CMT8 (HCMC D3/D10), Saigon South International School (HCMC D7) | ~1 min, < 1 min latency | same as SG: `map-data-int.airgradient.com/map/api/v1/measurements/current/area?...` | no | none | CC BY-SA 4.0 | EPA-extended + `k` against CEM | Hanoi 1, HCMC 2 | Too sparse on its own. Good for calibration pairs with CEM |
| **Sensor.Community** | citizens | SDS011 + DHT22 | PM2.5 (`P2`) | **Hanoi: 3 SDS011** (1 flagged indoor). **HCMC 0, Da Nang 0** | 2.5 min, ~1–5 min | `data.sensor.community/airrohr/v1/filter/area=lat,lon,km` | no | `*` | ODbL | RH correction. DHT22 reads 99.9 % RH | Hanoi only | Too sparse |
| **WAQI / aqicn** (includes "AirNet"/uRadMonitor crowd) | – | mixed | US AQI | Hanoi 12 markers, HCMC 10 (most crowd markers dead since Jan 2026) | hourly | token API | yes | `*` | no redistribution | – | – | **Don't use**. Evidence only |
| **IQAir / AirVisual** | – | – | US AQI | **unverified** (`incorrect_api_key`) | hourly | `api.airvisual.com` | yes | ? | no redistribution | – | – | Don't use |
| **PurpleAir** | – | PMS5003 ×2 | – | **unverified** (key required, 403) | 2 min | `api.purpleair.com` | yes | `*` | ToS | EPA | ? | Worker-only |
| **OpenAQ v3** | – | aggregator | – | **unverified** (401) | – | `api.openaq.org/v3` | yes | yes | per provider | – | – | CEM ingestion unknown |
| **Live & Learn / CGFED** | NGOs | – | – | **unverified**: no public data endpoint found in the time available | – | – | – | – | – | – | – | Historically ran Hanoi community monitoring (unverified) |

Evidence:

```bash
# 17:13 SGT: AirGradient map API (EPA-corrected)
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=105.6&ymin=20.8&xmax=106.1&ymax=21.2&zoom=8&measure=pm25"
{"data":[{"locationId":13752026,"locationName":"OceanPark","latitude":20.9933,"longitude":105.9441,"pm25":3.1,"measuredAt":"2026-09-28T09:13:52.000Z","dataSource":"AirGradient"},
 {"locationId":16009215,"locationName":"Hà Nội","pm25":2.4,"dataSource":"SensorCommunity",...},{"locationId":71747021,"locationName":"Quang Ba","pm25":5.95,"dataSource":"SensorCommunity",...}]}
$ curl -s "...area?xmin=106.5&ymin=10.6&xmax=106.9&ymax=11&zoom=8&measure=pm25"
{"data":[{"locationId":860,"locationName":"CMT8","pm25":13.7,...},{"locationId":11611954,"locationName":"Saigon South International School - S...","pm25":21.5,...}]}
# careful: a naive VN lat/lon bbox pulls in ~60 Lao/Thai/Cambodian AirGradient schools. Filter with a VN polygon, not a box.

# 17:14 SGT: Sensor.Community
$ curl -s "https://data.sensor.community/airrohr/v1/filter/area=21.0285,105.8542,40"   # 5 sensors: 3×SDS011 (22606, 44434 indoor=1, 99385) + 2×DHT22
$ curl -s "https://data.sensor.community/airrohr/v1/filter/area=10.7769,106.7009,40"   # []
$ curl -s "https://data.sensor.community/airrohr/v1/filter/area=16.0544,108.2022,30"   # []

# 17:19 SGT: PAM Air
$ curl -s https://maps.pamair.org/main.3c5911dea7abd5cce9b2.js | grep -o 'apiUrl:"[^"]*",jwtKeyUrl:"[^"]*"'
apiUrl:"https://api.pamair.org/",jwtKeyUrl:"customer/key"         # (client id/secret also embedded, deliberately not used or reproduced)
$ curl -s -i https://api.pamair.org/customer/key                 # HTTP/2 404 (GET). Not probed further
# pamair.org/dich-vu-pamair/dich-vu-api/: "Dịch vụ API ... Dữ liệu chất lượng không khí có thể được kết nối trực tiếp với trang website,
#  ứng dụng di động ... của đối tác" (API data for *partners*)
```

Model check (17:29 SGT, Open-Meteo/CAMS, 16:00 ICT): Hanoi Nhân Chính **30.5** vs CEM **7.4** (4× high). HCMC Q2 **26.7** vs CEM **48.1** (0.55×). **Not usable as "now".**

## National index & bands

**VN_AQI**: Decision **1459/QĐ-TCMT**, 12 Nov 2019, Vietnam Environment Administration ("Hướng dẫn kỹ thuật tính toán và công bố chỉ số chất lượng không khí Việt Nam"). Original PDF: `cem.gov.vn/storage/news_file_attach/QD 1459 TCMT ngay 12.11.2019 AQI.pdf` (CAPTCHA-blocked for us). Table 1 and the NowCast rules were read from the text reproduced on hoatieu.vn.

| AQI | Chất lượng không khí | EN | Colour (RGB, verbatim) | PM2.5 NowCast µg/m³ (breakpoints) |
|---|---|---|---|---|
| 0–50 | Tốt | Good | Xanh 0;228;0 | 0–25 ✔ |
| 51–100 | Trung bình | Moderate | Vàng 255;255;0 | 25–50 ✔ |
| 101–150 | Kém | Poor | Da cam 255;126;0 | 50–80 ✔ |
| 151–200 | Xấu | Bad | Đỏ 255;0;0 | 80–150 (**unverified**) |
| 201–300 | Rất xấu | Very bad | Tím 143;63;151 | 150–250 (**unverified**) |
| 301–500 | Nguy hại | Hazardous | Nâu 126;0;35 | 250–350–500 (**unverified**) |

- ✔ = verified empirically. With linear interpolation on (0,0)–(25,50)–(50,100)–(80,150) and the NowCast below applied to moitruongthudo's hourly concentrations, I reproduced the published hourly PM2.5 AQI **exactly for 20/20 hours** (station 14: 25–51. Station 15: 73–112, which crosses the 100 boundary). The higher breakpoints are the commonly cited Table 2 values. I couldn't open Table 2 itself.
- **Averaging and lag:** VN_AQI hourly for PM is **not** a 1-hr value. It is a **NowCast over the last 12 hours**: `w* = Cmin/Cmax`, `w = max(w*, 0.5)`; if `w > 0.5`, `NowCast = Σ wⁱ⁻¹cᵢ / Σ wⁱ⁻¹`; if `w = 0.5`, `NowCast = Σ 0.5ⁱ cᵢ`. It needs ≥2 of the latest 3 hours, else "no data". This is the US-EPA NowCast and **lags on rising haze** (much less than SG's 24-hr PSI, but still). There is also a daily AQI (24-h mean).
- The published AQI is the **max over pollutants** (SO₂, CO, NO₂, O₃, PM10, PM2.5), and it must include PM10 or PM2.5.
- **Health advice (Table 3):** split into "người bình thường" (general) and "nhóm người nhạy cảm" (sensitive: children, elderly, people with respiratory/cardiac disease). **Verbatim wording unverified** (source page truncated). Paraphrase from secondary sources: at Kém, the general public should reduce time outdoors if they have symptoms, and sensitive groups should avoid strenuous outdoor activity. Get the verbatim text from the CEM PDF before shipping.

**Mapping to HazeNow's "1-hr PM2.5 + band + verdict":**
- Show the **latest hourly PM2.5 in µg/m³** (mean of moitruongthudo 5-min values for the last full hour, or the CEM hourly value) as the big number.
- Show the **official VN_AQI (NowCast-based) value and band as published** by the authority, as the "official" line (like the 24-hr PSI in SG). Do **not** compute our own "instant VN_AQI" from 1-hr PM2.5 and show it as the index. That repeats the SG Instant-PSI confusion (SPEC v1.2 §1).
- Band chip: use VN_AQI band names/colours driven by the **official published AQI**, with the 1-hr µg/m³ number and trend words to show "it's getting worse faster than the index". Chart: hourly PM2.5 bars + the NowCast concentration line (both µg/m³), which is the direct analogue of the SG chart.
- Verdict wording must be derived from Table 3 (to be fetched verbatim), scoped "for now".

## Language / localisation

- Official language: **Vietnamese**. All verdict, action and band strings must exist in Vietnamese with correct diacritics (the API returns Unicode escapes like `"Trung bình"`). Use the official band names verbatim: Tốt · Trung bình · Kém · Xấu · Rất xấu · Nguy hại.
- English as secondary (large expat community in Hanoi/HCMC, and the AirGradient/international school sensors).
- Framing: Vietnamese users are highly familiar with "bụi mịn PM2.5" and with US-AQI apps (IQAir, AirVisual) showing much higher numbers than VN_AQI for the same air. Say once, neutrally, that "VN_AQI and US AQI use different scales". Masks ("khẩu trang") are ubiquitous for motorbike riders, so the mask action is culturally normal, but follow SPEC v1.2 §4 (N95 wording).
- Hanoi winter inversions and straw/rice-stubble burning (Oct–Nov, May–Jun) are the salient haze sources. It isn't transboundary peat haze like SG.

## Integration recipe

**v2, Hanoi (Worker-proxied, no CORS):**
1. `GET https://moitruongthudo.vn/api/site` hourly → station registry (`id`, `name`, `latitude`, `longtitude` [sic], `type`, `aqi`, `aqiText`, `aqi_time` "DD-MM-YYYY"). Keep only stations whose last data is < 2 h old (today: #48, #49).
2. `GET /public/dailystat/{id}` → `PM2.5[]` of `{time:"YYYY-MM-DD HH:mm" (ICT, no offset), value:"12.34"|null}`. It covers 30 days, so the response is large (~8.8k rows × 6 pollutants). Poll every 5 min, take the tail, and compute the **1-hr mean** for the last complete hour (require ≥ 9 of 12 samples).
3. `GET /public/dailyaqi/{id}` → official hourly VN_AQI per pollutant. The **overall station AQI = max over pollutants**. `value: 0` with no data means **missing**, not "0 = clean" (station 49 PM2.5 at 16:00).
4. Snapshot mapping: `stationId = "hn:" + id` (or the CEM `code` for dedupe with CEM later), `pm25_1h` = our hourly mean, `officialIndex = {name:"VN_AQI", value, band}` from dailyaqi, `observedAt` = parse the ICT string as `+07:00`, `source = "Hanoi Environmental Monitoring Portal (moitruongthudo.vn) / CEM"`.
5. Timezones: **ICT = UTC+7 (SG −1 h)**, no DST. Hour labels in dailyaqi appear to be hour-*ending* for 5-min stations (best fit), but the evidence is mixed, so verify over more hours.
6. Gotchas: numbers come as strings in dailystat and as ints in dailyaqi. `aqi_time` has no time component. The city stations (#14, #15) silently freeze for days while `/api/site` still shows their old AQI, so always check the series tail. #49's PM2.5 channel can be null while other gases continue. Treat per-pollutant availability separately.
7. Fallback: nearest AirGradient (EPA-corrected, labelled "~ estimate") when both CEM Hanoi stations are down.

**National / HCMC:** blocked until CEM provides access. Request a data feed (station list, hourly JSON) and written permission to redistribute in a free app. The WAQI mirror proves CEM already shares it with third parties. PAM Air: request a partner key held in the Worker.

## Verdict

**v2 for Hanoi (needs our Worker proxy). National/HCMC not feasible yet.**
- Hanoi works today with key-free JSON, 5-min µg/m³ at ~3 min latency, from 2 CEM reference stations. It's a genuine authoritative "now", fresher than NEA's hourly. The limits: only 2 live stations for a city of ~8 M, no CORS, no stated licence, undocumented routes.
- HCMC and the rest of Vietnam depend on CEM, which is CAPTCHA-walled with no documented API. It is **blocked pending an agreement**, and scraping is not acceptable.
- Crowd is weak without PAM Air: AirGradient has 3 sensors and Sensor.Community 3. PAM Air is the real crowd network but is commercial and auth-gated.
- Key blockers: (1) licence/permission from the Hanoi centre and CEM, (2) CEM machine access, (3) PAM Air partnership, (4) verbatim VN_AQI health-advice text (Table 3) and higher PM2.5 breakpoints from the original PDF, (5) Vietnamese copy.

## HCMC / CEM access, round 2

Captured live on **2026-09-29, 02:17–02:28 UTC = 09:17–09:28 ICT**, from the same Singapore IP as round 1. Pages were loaded with **Kuri 0.3.3** (`~/.local/bin/kuri`, HTTP server → headless Chrome 154) with HAR recording, and robots.txt was checked with plain `curl`. There were about 12 page loads in total across 7 hosts, each ≥ 4 s apart. **No CAPTCHA was answered, retried or worked around.** On each CEM host I stopped at the first CAPTCHA. The HAR summary is in `packages/core/fixtures/sea/vn-kuri-har-summary-2026-09-29.json`.

**Tooling caveat (read before reusing Kuri here).** The Kuri *server* always applies its "stealth" patches to every tab it discovers, and there is no flag to turn this off in 0.3.3 (`src/server/router.zig`, `discoverTabs`). The patches are `navigator.webdriver=false`, fake plugins/languages, WebGL/canvas spoofing and a **random user agent**. That conflicts with our "don't spoof identity" rule. Mitigation used here: after startup I reset the UA with `/set/useragent` to the true headless string plus a `HazeNow-research/0.1` token. The JS fingerprint patches could not be removed without rebuilding Kuri (it needs Zig 0.17-dev; 0.16 is installed). They made no difference to what we saw: CEM's WAF blocked us by IP anyway. **Next time, use `kuri-agent`** (stealth is off by default) **or Chrome DevTools "Save all as HAR"** in a normal browser. Kuri's HAR recorder also misses requests: the cem.gov.vn document itself was not captured. So `performance.getEntriesByType('resource')` was read as a second record of what each page fetched.

### 1. CEM (`cem.gov.vn`, `tedp.vn`, `envisoft.gov.vn`): no open "now" endpoint

| check | result (verified 2026-09-29) |
|---|---|
| robots.txt | `cem.gov.vn/robots.txt` → `User-agent: * / Disallow:` (allow all). `envisoft.gov.vn/robots.txt` → HTTP 400 "invalid request". `tedp.vn/robots.txt` → **CAPTCHA page** |
| cem.gov.vn home (Kuri, 02:18 UTC) | **Loaded normally** (title "CEM \| Trang Chủ"). The "VN_AQI GIỜ" table (columns Trạm / Thời gian / Chỉ số / Chất lượng) was **empty**: `#block_aqi_index` has no rows, and **no XHR/fetch was made**. Its "Trang chi tiết" link and the "Công khai kết quả quan trắc" menu both point to **`tedp.vn/web/tedp/map?filter-kind=aqi&code=4`**. The page loads Barracuda's `bnith__…` script and `cdn.infisecure.com/barracuda.js` (the WAF behind the CAPTCHA) |
| second request to cem.gov.vn (02:18, a static `/front/js/chart_home.js`) | **Barracuda "Validation request" CAPTCHA**. I stopped CEM there |
| tedp.vn (curl robots 02:19, one Kuri page load 02:26) | **CAPTCHA** both times: "Validation needed due to the detection of invalid input from this client IP address, error code : 426". `tedp.vn` and `envisoft.gov.vn` resolve to the same IP (103.88.113.253), and `cem.gov.vn` is .228 in the same /24. It is the same WAF, and it now flags **our IP** (probably since round 1's probes). Not retried |
| terms / licence | The CEM homepage has **no terms-of-use or licence link** (links: Giới thiệu, Liên hệ, news categories only). tedp.vn terms: **unverified** (CAPTCHA) |
| **Open, CAPTCHA-free:** `dubao.envisoft.gov.vn:8000/airforecast/` (CEM forecast site, same header "Cổng thông tin quan trắc môi trường / Trung tâm quan trắc môi trường miền Bắc") | Different host (14.160.24.136), no WAF. The page's own XHR is `GET /geoweb//{YYYYMMDD}/vntinh_AQIDaily{YYYYMMDD}.geojson`: `application/geo+json`, **30 MB** (province polygons), `server: webfs/1.21`, no CORS header seen. Properties per province are `{id_tinh, tentinh, AQI}`, 34 provinces (post-merger), **HCMC (id 79) = 45.05** for 29/09. It is a **48-h VN_AQI *forecast* (model), published daily (Last-Modified 2026-09-28 08:02 UTC)**, not an observation, so it is **not usable as "right now"**. robots.txt → 404. Fixture: `vn-cem-forecast-aqidaily-props-2026-09-29.json` (geometry stripped) |

**CEM answers:**
- **Open JSON/XML "now" endpoint reachable without a CAPTCHA token: none found.** The CEM homepage no longer embeds live station data. The live map moved to `tedp.vn`, which sits behind the same Barracuda WAF.
- **Station list, cadence and units from CEM directly: unverified** (behind CAPTCHA). From round 1 via the WAQI mirror (evidence only): hourly PM2.5 in µg/m³, and 2 HCMC stations (Q2 Lê Hữu Kiều, 20 Lý Chính Thắng). CEM's own public widget shows **hourly VN_AQI (index), not µg/m³**.
- The **only open CEM endpoint is the province-level AQI forecast**. It is a forecast, and no licence is stated.

### 2. HCMC's own sources: none real-time

| source | result |
|---|---|
| **Sở Nông nghiệp và Môi trường TP.HCM** (successor to Sở TN&MT), `sonnmt.hochiminhcity.gov.vn` | Loaded with Kuri. The page's own XHRs are CMS widgets (`POST /home/Widget_GetList`, `Document_GetWithCategory`…), with **no AQ data**. The "Quan trắc môi trường" category has 4 items: regulations, a draft decision, and "Bảng tổng hợp kết quả quan trắc môi trường (đợt 11)" dated 25/12/2025 (periodic campaign results, not real-time). Footer: **"Ghi rõ nguồn Sở Nông nghiệp và Môi trường Thành phố Hồ Chí Minh khi sử dụng thông tin trên website này"** (attribution required). Contact **snnmt@tphcm.gov.vn**, 63 Lý Tự Trọng, hotline (028) 3829 3653 |
| **Chi cục Bảo vệ Môi trường TP.HCM (HEPA)**, `hepa.gov.vn` | robots allows all but /wp-admin/. WordPress. "Báo cáo quan trắc chất lượng môi trường" holds **weekly/monthly PDF air bulletins ("Bản tin chất lượng môi trường không khí"), last posted 4 Sep 2024** (covering 12–16/8/2024). No live data, no API. Contact **ccbvmt.snnmt@tphcm.gov.vn**, 227 Đồng Khởi, (028) 3827 9669 |
| **HCMC data portal** `data.hochiminhcity.gov.vn` → open-data portal **`opendata.hochiminhcity.gov.vn`** (DKAN, run by Trung tâm Chuyển đổi số, ttcds@tphcm.gov.vn) | Behind an F5 "TSPD" JavaScript challenge (curl gets the JS challenge; a browser passes it transparently, and it is not a CAPTCHA). Dataset search: "không khí" → **0 results**. "môi trường" → only unrelated datasets (occupational-environment labs etc.). **No air-quality dataset.** Its `/dieu-khoan-su-dung` terms were not read |
| Other city AQ subdomains | DNS only: `quantrac.`, `quantracmoitruong.`, `aqi.`, `moitruong.`, `khongkhi.` under `hochiminhcity.gov.vn` and `tphcm.gov.vn` → **none resolve** |

So HCMC's public air monitoring (the 2 automatic stations) runs through CEM. The city itself publishes nothing real-time.

### 3. Other HCMC options (live checks 2026-09-29 ~02:23 UTC)

| source | today | terms | usable for "now"? |
|---|---|---|---|
| **AirGradient** (map API, bbox 106.3–107.1 E, 10.3–11.2 N) | **2 live outdoor sensors**: CMT8 (10.785, 106.670) **26 µg/m³** @02:22:36Z, SSIS D7 (10.722, 106.709) **25.4** @02:22:11Z. EPA-corrected, ~1 min old. `Access-Control-Allow-Credentials: true` but **no `Allow-Origin`** → needs the proxy. The existing `agMapObservations` already maps both to `VN` (checked against fixture `vn-ag-hcmc-2026-09-29T0923ICT.json`) | CC BY-SA 4.0 | **Yes**, as a labelled low-cost "~ estimate" (`pm25_now`, not an official 1-hr). Only 2 points for ~9 M people |
| **Sensor.Community** `area=10.7769,106.7009,50` | **0 sensors**. `access-control-allow-origin: *` | ODbL | No |
| **OpenAQ v3** | 401 without `X-API-Key`. No key in the repo or env, and none was sought. The AG map (which merges OpenAQ reference rows) shows **no OpenAQ reference in HCMC**. HCMC coverage **unverified** | free registered key, per-provider licence | Unverified. Probably nothing beyond AG |
| **US Consulate HCMC** (AirNow DOS `HC1010001`) | Listed "Active" in `monitoring_site_locations.dat`, but **0 rows** in `HourlyData` for 2026-09-29 00Z/01Z and 2026-09-28 12Z/18Z. It is also absent from every sample back to 2024-06-01. Hanoi `HN1010001` reported until at least 2025-03-01 but was absent from 2025-06-01 on. Files have no CORS header | US gov → public domain | **No: not reporting** |
| **IQAir / AirVisual** | `api.airvisual.com` → `incorrect_api_key` (400). Terms pages `/terms-of-service`, `/legal/terms-of-service` → 404; `/terms`, `/legal` → 429. **Terms unverified today.** Previous finding (REGIONAL.md): no redistribution, link-only | proprietary | No |
| **PAM Air** | `pamair.org/dich-vu-pamair/dich-vu-api/`: "Image API" and "Data API" for **partners** ("hiển thị trực tiếp trên hệ thống hiển thị của đối tác"), no pricing/free tier/licence stated. Contact **contact@dlcorp.com.vn**, hotline/Zalo 0363 159 596. No public API. The web map's embedded credentials were not used | proprietary, partner agreement | Only via partnership. It is the densest HCMC network (claimed) |
| **Live & Learn** | livelearn.org home: no Vietnam air-quality monitoring, data or API mentioned | – | No |
| **Vietnam Clean Air Partnership** | No site found: `vcap.vn` is an unrelated company, `cleanair.vn` is an appliance retailer, and `vietnamcleanair.org`/`vcap.org.vn` don't resolve. **Unverified** (web search budget was exhausted this session) | – | No |

### 4. Recommendation

- **Best legitimate HCMC "now" today: AirGradient (2 sensors, CC BY-SA, via our proxy).** It is already implemented (`sources/airgradient.ts`), so **no new adapter was written**. Show it as a crowd estimate ("~", low-cost, EPA-corrected), never as the official 1-hr PM2.5 or VN_AQI. HCMC gets **no official number** until CEM agrees.
- **CEM: no open "now" endpoint.** Live station data sits only behind the Barracuda WAF on `tedp.vn`/`cem.gov.vn`, which now CAPTCHAs our IP. The open `dubao.envisoft.gov.vn` GeoJSON is a province **forecast** with no stated licence. Don't ship it as "now". It could be a labelled "tomorrow's forecast" later, with permission.
- **Next step: a permission request** to CEM (station feed + redistribution) and a courtesy/coordination note to HCMC DONRE. Also a PAM Air partner request (round 1).
- Addresses: HCMC DONRE `snnmt@tphcm.gov.vn` (cc `ccbvmt.snnmt@tphcm.gov.vn`, HEPA). CEM: the address on `cem.gov.vn/lien-he` was **not read** (CAPTCHA). Look it up from a normal browser on another network, or go via the VEA site `vea.mae.gov.vn`.

#### Draft email: CEM (English)

> **Subject:** Request for access to hourly air-quality station data for a free, non-commercial public app (HazeNow)
>
> Dear Centre for Environmental Monitoring,
>
> I am the developer of HazeNow, a free, open-source (MIT) web app that shows people "what is the air like right now" using each country's official monitoring data. We already show official data for Singapore, Malaysia, Thailand and Indonesia. It has no advertising and no commercial use.
>
> We would like to show CEM's automatic stations for Vietnam, starting with Ho Chi Minh City and Hà Nội, with clear attribution to CEM and a link to cem.gov.vn. We found no public data service, and your portal (tedp.vn) is protected by a CAPTCHA, which we respect. We have not tried to get around it.
>
> May we ask:
> 1. Is there an official feed (JSON/XML/CSV) or API for hourly station data (PM2.5 in µg/m³ and the hourly VN_AQI), with the station list and coordinates?
> 2. Would CEM permit us to redistribute these values, with attribution, in a free public app? Are there terms we should follow (attribution wording, disclaimer, caching)?
> 3. If access needs a key or a whitelisted IP, we would request once per hour from a single server and cache the result, so CEM receives no traffic from end users.
>
> We will display the official VN_AQI bands (Decision 1459/QĐ-TCMT) exactly as published, and we're happy to follow any guidance on wording. Thank you for your time.
>
> Kind regards,
> [Name], HazeNow, [contact email] · [project URL]

#### Draft email: HCMC Department of Agriculture and Environment (English)

> **Subject:** Air-quality data for Ho Chi Minh City in a free public app (HazeNow): coordination request
>
> Dear Department of Agriculture and Environment of Ho Chi Minh City,
>
> HazeNow is a free, non-commercial, open-source app that shows residents the current air quality from official sources. For Ho Chi Minh City we would like to show official monitoring data rather than only low-cost community sensors.
>
> We could not find a real-time air-quality feed on the Department's website, the HEPA site (the latest air bulletin is from August 2024) or the city open-data portal (opendata.hochiminhcity.gov.vn). Could you tell us:
> 1. whether the city operates automatic air monitoring stations of its own, beyond the CEM stations, and whether their hourly data could be shared (e.g. via the open-data portal);
> 2. whether the Department would support our request to CEM for the two national stations in the city;
> 3. what attribution the Department would like us to use.
>
> We will credit the Department as your website asks ("Ghi rõ nguồn Sở Nông nghiệp và Môi trường Thành phố Hồ Chí Minh"), and we will follow any guidance you give. Thank you.
>
> Kind regards,
> [Name], HazeNow, [contact email] · [project URL]

#### Bản tiếng Việt (**needs native review**)

> **Tiêu đề:** Đề nghị tiếp cận dữ liệu quan trắc không khí theo giờ cho ứng dụng cộng đồng miễn phí, phi thương mại (HazeNow)
>
> Kính gửi Trung tâm Quan trắc môi trường miền Bắc (CEM),
>
> Tôi là người phát triển HazeNow, một ứng dụng web miễn phí, mã nguồn mở (giấy phép MIT), giúp người dân biết "chất lượng không khí ngay lúc này" dựa trên dữ liệu quan trắc chính thức của từng quốc gia. Ứng dụng không có quảng cáo và không nhằm mục đích thương mại.
>
> Chúng tôi mong muốn hiển thị dữ liệu các trạm quan trắc tự động của CEM tại Việt Nam, trước hết là TP. Hồ Chí Minh và Hà Nội, ghi rõ nguồn CEM và dẫn liên kết về cem.gov.vn. Chúng tôi chưa tìm thấy dịch vụ dữ liệu công khai. Cổng tedp.vn có cơ chế xác thực CAPTCHA; chúng tôi tôn trọng cơ chế này và không tìm cách vượt qua.
>
> Kính đề nghị Trung tâm cho biết:
> 1. Có kênh cung cấp dữ liệu chính thức (JSON/XML/CSV hoặc API) cho số liệu trạm theo giờ (PM2.5 đơn vị µg/m³ và VN_AQI giờ), kèm danh sách và tọa độ trạm hay không?
> 2. Trung tâm có đồng ý cho chúng tôi hiển thị lại các số liệu này (có ghi nguồn) trong ứng dụng công cộng miễn phí không? Có điều kiện nào cần tuân thủ (cách ghi nguồn, tuyên bố miễn trừ, lưu đệm) không?
> 3. Nếu cần khóa truy cập hoặc đăng ký địa chỉ IP, chúng tôi chỉ truy vấn mỗi giờ một lần từ một máy chủ duy nhất và lưu đệm, nên người dùng cuối không tạo thêm tải cho hệ thống của Trung tâm.
>
> Chúng tôi sẽ hiển thị đúng các mức VN_AQI theo Quyết định 1459/QĐ-TCMT và sẵn sàng điều chỉnh cách diễn đạt theo hướng dẫn của Trung tâm. Trân trọng cảm ơn.
>
> Trân trọng,
> [Họ tên], HazeNow, [email liên hệ] · [đường dẫn dự án]

> **Tiêu đề:** Phối hợp về dữ liệu chất lượng không khí TP. Hồ Chí Minh cho ứng dụng cộng đồng miễn phí (HazeNow)
>
> Kính gửi Sở Nông nghiệp và Môi trường Thành phố Hồ Chí Minh,
>
> HazeNow là ứng dụng miễn phí, phi thương mại, mã nguồn mở, giúp người dân biết chất lượng không khí hiện tại từ các nguồn chính thức. Tại TP. Hồ Chí Minh, chúng tôi mong muốn hiển thị số liệu quan trắc chính thức thay vì chỉ dùng cảm biến cộng đồng giá rẻ.
>
> Chúng tôi chưa tìm thấy nguồn dữ liệu không khí theo thời gian thực trên trang của Sở, trang của Chi cục Bảo vệ môi trường (bản tin không khí gần nhất là tháng 8/2024) hay Cổng dữ liệu mở của Thành phố. Kính đề nghị Sở cho biết:
> 1. Ngoài các trạm của CEM, Thành phố có vận hành trạm quan trắc không khí tự động riêng không, và có thể chia sẻ số liệu theo giờ (ví dụ qua Cổng dữ liệu mở) không?
> 2. Sở có thể hỗ trợ đề nghị của chúng tôi gửi CEM đối với hai trạm quốc gia trên địa bàn Thành phố không?
> 3. Sở mong muốn chúng tôi ghi nguồn như thế nào?
>
> Chúng tôi sẽ ghi rõ nguồn "Sở Nông nghiệp và Môi trường Thành phố Hồ Chí Minh" theo yêu cầu trên trang thông tin của Sở và tuân thủ mọi hướng dẫn. Trân trọng cảm ơn.
>
> Trân trọng,
> [Họ tên], HazeNow, [email liên hệ] · [đường dẫn dự án]

**Round-2 verdict:** HCMC stays **crowd-only (AirGradient ×2)**. The official number is **blocked pending CEM permission**. The emails above are the next action, and nothing was committed.
