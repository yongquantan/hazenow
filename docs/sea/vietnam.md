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
