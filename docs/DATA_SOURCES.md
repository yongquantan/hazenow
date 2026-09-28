# Data sources for "right here, right now" PM2.5 in Singapore

Research lead notes, captured live on **2026-09-28 between 16:33 and 17:10 SGT, during a haze episode**
(NEA 1-hr PM2.5 at 16:00: north 49, south 105, west 117, east 83, central 105. 24-hr PSI 64–84).
Every `curl` below was actually run. Outputs are trimmed.

Related: [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) · [DIY_SENSOR.md](DIY_SENSOR.md)

---

## TL;DR

1. **The biggest, cheapest win is in NEA's own data: it goes live about 1 minute after the hour, not about 30.**
   Polling both endpoints once a minute across 17:00 showed **v1 and v2 both served the 17:00 reading
   at 17:00:56–17:00:59**. v2's `updatedTimestamp` is **rewritten by later re-publishes (~:30 and ~:45,
   same values)**, which is why the history shows :30–:47 and why SPEC.md assumes "~30 min later".
   SPEC's poll window (":20–:50") therefore **misses each new hour by about 20 minutes**. Poll at :01–:05. v1
   keeps the original stamp and has no per-IP rate limit. v2 back-fills gaps.
2. **AirGradient is the only usable open crowd network in SG:** 14 live outdoor sensors plus 1 in
   Johor, 1-min freshness, **no key**, CC BY-SA 4.0, with hourly history. After EPA correction, half of
   them track NEA within ±7 %. **No CORS** (native OK, web needs a proxy).
3. PurpleAir, OpenAQ, IQAir, Google, WAQI all need keys. WAQI and IQAir forbid redistribution,
   PurpleAir and Google cost money. Sensor.Community has **zero** sensors within 40 km.
4. **Models are useless as "now" during haze.** Open-Meteo/CAMS: **32.6 µg/m³ and falling** at 16:00
   while NEA measured **105–117 and rising**.
5. SPEC.md's **bands and breakpoints are correct**. SPEC.md's **advice text is too soft** vs NEA's
   June 2026 guide (§5).

---

## Master comparison table

| Source | What | Cadence | Latency to "now" | SG density (verified today) | Key | Cost | CORS | Licence / redistribution in a free OSS app | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **NEA v2** `api-open.data.gov.sg/v2/real-time/api/pm25` | FEM, 1-hr avg | hourly | **~1 min** after the hour (then re-stamped at ~:30/:45) | 5 regions | no (optional key raises limits) | free | `*` | Singapore Open Data Licence (attribution) | v1 baseline. Keep. **Fix the poll window** |
| **NEA v1** `api.data.gov.sg/v1/environment/pm25` | same data | hourly | **~1 min** after the hour (verified §1.1), stable stamp | 5 regions | no | free | `*` | same | Add as secondary/merge source (no rate limit, stable first-publish stamp). Legacy, may be retired |
| NEA advisory JSON `www.nea.gov.sg/api/advisory/latesthazesituationupdate/` | daily haze update text, 24-hr PSI forecast, advisory | ~daily | n/a | national | no | free | `*` | NEA website terms (undocumented endpoint) | Nice-to-have "NEA says" card. Not a number source |
| **AirGradient** public/world + map API | low-cost PMS5003T ×2 (Open Air), EPA-corrected on the map API | ~1 min | **< 2 min** | **14 outdoor SG + 1 Johor** | no | free | **none** | **CC BY-SA 4.0**, attribute contributors | **Best crowd source. Add in v2** (native direct, web via Worker) |
| AirGradient **local API** `http://airgradient_<serial>.local/measures/current` | your own monitor | on request (device updates ~every 2–5 s) | seconds | 1 (yours) | no | device ~US$150–230 | none, and LAN only | your data | **Best personal source** (native apps) |
| **PurpleAir** API | PMS5003 ×2, `pm2.5_cf_1`, RH | 2 min (real-time), `pm2.5_10minute` avg | ~2–4 min | **unverified** (API refused without key. Likely a handful to low tens) | **yes** (`X-API-Key`) | points: ~US$1 per 100k points. Owners' own sensor free | `*` | PurpleAir Terms of Service + Data Licence. Attribution. A key cannot ship in the client | v2.3 via Worker only |
| **WAQI / aqicn** | re-published NEA (converted to **US AQI**, not µg/m³) + crowd stations | hourly (NEA) / ~1–5 min (crowd) | NEA copy was **1–2 h behind** (at 16:40 still 14:00/15:00) | 5 NEA + 6 live crowd ("A…") + 1 Johor | yes (free token, `demo` only returns Shanghai) | free (non-commercial) | `*` | Terms prohibit redistribution/caching of the data. Must attribute WAQI + original EPA | **Don't use** |
| **IQAir / AirVisual** | own + crowd + NEA, US AQI | hourly | hourly | unknown, city-level | yes | Community: 10k calls/mo, ~5/min, `nearest_city` only | ? | Must link to AirVisual. No redistribution | **Don't use** |
| **OpenAQ v3** | aggregator (ingests AirGradient + govt feeds) | varies, lagged | ≥ AirGradient's | ≈ AirGradient SG set (unverified, 401 without key) | **yes** (`X-API-Key`, free) | free (60/min, 2k/h) | yes | per-provider licence (AirGradient CC BY-SA) | Redundant with AirGradient direct |
| **Sensor.Community** | DIY SDS011/PMS nodes | 2.5 min | ~5 min | **0 within 40 km** (verified) | no | free | `*` | ODbL | Nothing to read. Encourage DIY uploads |
| **Open-Meteo air-quality** (CAMS global, ~40 km) | **model** | hourly, 2 runs/day | forecast | grid | no (non-commercial) | free < 10k/day | `*` | CC BY 4.0 (Open-Meteo) + Copernicus | **Forecast only**. Wrong by 3× today (§4) |
| **Google Air Quality API** | model + station fusion (UAQI) | hourly | ~1 h | 500 m grid | **yes** | ~US$5 / 1000 current-conditions calls after the free monthly cap | n/a (key) | Maps Platform ToS: no caching/redistribution beyond terms. Key must be hidden | **Don't use** (cost, ToS, still modelled) |
| **Himawari-8/9 AOD** (JAXA P-Tree, MRI/Kyushu aerosol) | satellite **column** AOT, not surface PM2.5 | 10 min (L2 5 km), hourly L3 | ~20–40 min | ~5 km pixels, **blind under cloud** | registration (FTP) | free. Commercial use only for data ≥ 2026-02-01 | n/a | JAXA P-Tree terms + citation | Optional "smoke plume" map layer only. **Not ground truth** |
| haze.gov.sg internal `/api/airquality/jsondata/<ts>` | chart data for haze.gov.sg | hourly | same as v1 | 5 | no | free | same-origin only | undocumented | Don't use. v1 is the clean equivalent |

---

## 1. NEA (baseline and the easy win)

### 1.1 v1 vs v2 publication delay: verified

Both endpoints were called for the same hours of 2026-09-28:

```bash
curl -s "https://api.data.gov.sg/v1/environment/pm25?date=2026-09-28"           # v1
curl -s "https://api-open.data.gov.sg/v2/real-time/api/pm25?date=2026-09-28"    # v2
```

| hour (SGT) | v1 `update_timestamp` | v2 `updatedTimestamp` | values |
|---|---|---|---|
| 12:00 | 12:03:05 | 12:45:39 | identical |
| 13:00 | 13:00:42 | 13:45:37 | identical |
| 14:00 | 14:01:18 | 14:45:37 | identical |
| 15:00 | 15:01:58 | 15:46:02 | v1 **missing `south`**, v2 `south: 106` (back-filled) |
| 16:00 | 16:00:42 | 16:30:40 | identical |

Across today's hours, v1 stamps land at **:00:39–:03:05** (16 hours, 01:00–16:00), and v2 at **:30:40–:47:26** (17 hours, median ~:45).

The timestamps could just be labels, so I polled both endpoints once a minute from 16:34 to 17:01
(`curl` both, log `timestamp`, `updatedTimestamp`, readings) to see when a value actually became servable:

```
16:45:24 | v1 16:00 upd 16:00:42 | v2 16:00 upd 16:30:40  {south 105 ...}
16:46:25 | v1 16:00 upd 16:00:42 | v2 16:00 upd 16:45:57  {south 105 ...}   <- v2 re-stamped, values unchanged
17:00:28 | v1 16:00 upd 16:00:42 | v2 16:00 upd 16:45:57  {south 105 ...}
17:01:28 | v1 17:00 upd 17:00:59 | v2 17:00 upd 17:00:56  {north 55, south 140, west 107, east 108, central 137}
```

**Result: both endpoints publish the new hour about 1 minute after the hour.** v2 then re-publishes the
same hour at about :30 and :45 and **overwrites `updatedTimestamp`** each time (16:00 went
`16:30:40` → `16:45:57` with identical values). v1 keeps the first-publish stamp. So:

- SPEC.md's assumption "`updatedTimestamp` ... published ~30 min later" and its poll window
  "every 5 min between :20 and :50" are **wrong**: the value exists from ~:01. With the SPEC window, a
  client shows the previous hour for an extra ~20 min. **Fix: poll every 1 min from :01 to :05 (until
  the new `timestamp` appears), then every 5 min to :50 (to catch back-fills), otherwise every 15 min.**
- Don't display v2's `updatedTimestamp` as "published at". It is "last revised at". v1's
  `update_timestamp` is the true first-publish time.
- The re-publishes matter: at 15:00 today v1 had no `south` key at all, while v2 later showed `south: 106`.
  Merge rule: per hour, take v2 values when present, else v1. Keep polling after :05 so back-filled
  values appear.
- v1 is "legacy" and could be retired (there have been v1 outages before, e.g.
  datagovsg/datagovsg-datasets#1218). Use it as a secondary source, never the only one.

The 17:00 reading also validated the crowd layer: at 16:35, EPA-corrected AirGradient sensors near
"south"/"central" read 104–140 while NEA's 16:00 values were 105. NEA's 17:00 values came out at
**south 140, central 137, east 108** (§3.2). A PM2.5 of 140 is still Band II, but the Instant PSI
estimate is ~190, near the Unhealthy/Very Unhealthy boundary.

### 1.2 v2 rate limit (important for clients behind NAT)

```bash
$ for i in $(seq 1 9); do curl -s -o /dev/null -w "%{http_code} " https://api-open.data.gov.sg/v2/real-time/api/pm25; done
200 200 200 200 429 429 429 429 429
$ curl -s https://api-open.data.gov.sg/v2/real-time/api/pm25     # while limited
{"code":24,"name":"TOO_MANY_REQUESTS","data":null,"errorMsg":"Rate limit exceeded. Please try again in 10 seconds and sign up for an API key for higher rate limits. ..."}
```

The documented limits for v2 real-time are 6 calls/10 s without a key, 12 with a dev key and 30 with a
production key (guide.data.gov.sg → API rate limits, enforced since 31 Dec 2025). A `429` comes back
with **HTTP 429 and `data: null`**. Clients must treat it as "keep the last good value, retry after
10 s + jitter" and **must not** crash on `data.items` (the other agents' pollers already hit this
intermittently today). Singapore mobile carriers use CGNAT, so many HazeNow users can share one public IP.

v1 did not rate-limit: 15 back-to-back calls all returned 200.

### 1.3 v1 sample

```bash
$ curl -s -i -H "Origin: https://example.com" https://api.data.gov.sg/v1/environment/pm25
HTTP/2 200
access-control-allow-origin: *
{"region_metadata":[{"name":"south","label_location":{"latitude":1.29587,"longitude":103.82}},...],
 "items":[{"timestamp":"2026-09-28T16:00:00+08:00","update_timestamp":"2026-09-28T16:00:42+08:00",
 "readings":{"pm25_one_hourly":{"south":105,"east":83,"north":49,"west":117,"central":105}}}],
 "api_info":{"status":"healthy"}}
```

Shape differences vs v2: snake_case (`region_metadata`, `label_location`, `update_timestamp`), no
`code`/`data` wrapper, and `api_info.status`. The `?date=YYYY-MM-DD` and `?date_time=YYYY-MM-DDTHH:mm:ss`
params work. **A missing key** (like `south` at 15:00) is how v1 signals "offline", while v2 uses `-1`/null.

### 1.4 Is there anything finer than 5 regions / 1 hour?
No public feed. haze.gov.sg's JS (`/assets/scripts/data.js`) uses its own
`/api/airquality/jsondata/<epoch>` (hourly, 5 regions, same-origin) and then *overrides the latest point
with `api.data.gov.sg/v1`*. So NEA's own site trusts v1 for freshness. NEA has more stations than 5
(the regional values are aggregates), but it does not publish per-station or sub-hourly data.

### 1.5 NEA advisory JSON (bonus)
```bash
$ curl -s https://www.nea.gov.sg/api/advisory/latesthazesituationupdate/      # CORS: *
{"AirQualityBlurb":"24-hr PSI Forecast: Moderate to Low Unhealthy",
 "HealthAdvisoryBlurb":"<strong>Healthy persons:</strong> ... If 1-hr PM2.5 is Elevated (Band 2), reduce strenuous outdoor activity for the next hour. ...",
 "DateOfArticle":"2026-09-27T18:05:00+08:00", "BoldItalicLabel":"<b><i>Refer to the 1-hr PM2.5 for immediate activities, and the 24-hr PSI forecast to plan ahead.</b></i>", ...}
```
This is useful for an optional "NEA forecast for tomorrow" line. It is HTML, so sanitise it. It is undocumented, so treat it as best-effort.

---

## 2. Correction factors (PMS5003 + humidity)

Low-cost optical counters (Plantower PMS5003/6003, used by PurpleAir and AirGradient) size
particles by light scattering. In humid air, hygroscopic particles (sulphate, nitrate, and **biomass
smoke is strongly hygroscopic**) take up water and grow, so the sensor overreads. Plantower's
fixed density/shape assumptions add a further, roughly concentration-proportional overread of
~1.3–2× vs FEM.

### 2.1 EPA US-wide correction (Barkjohn et al., AMT 14, 4617, 2021)
Inputs: `PA` = PM2.5 **CF=1** (`pm2.5_cf_1`, the mean of channels A and B), `RH` = the sensor's own RH (%).

```
PM2.5 = 0.524·PA − 0.0862·RH + 5.75                    (valid up to PA ≈ 343)
```

### 2.2 Extended version for smoke (Barkjohn et al., Sensors 22, 9669, 2022). Use this during haze.
This is what the AirNow Fire & Smoke map uses, and AirGradient's firmware implements it verbatim
(`src/PMS/PMS.cpp :: PMSBase::compensate`, `"epa_2021"` algorithm):

```
PA < 30         : 0.524·PA − 0.0862·RH + 5.75
30 ≤ PA < 50    : [0.786·(PA/20 − 1.5) + 0.524·(1 − (PA/20 − 1.5))]·PA − 0.0862·RH + 5.75
50 ≤ PA < 210   : 0.786·PA − 0.0862·RH + 5.75
210 ≤ PA < 260  : [0.69·w + 0.786·(1−w)]·PA − 0.0862·RH·(1−w) + 2.966·w + 5.75·(1−w) + 8.84e-4·PA²·w,
                  where w = PA/50 − 4.2
PA ≥ 260        : 2.966 + 0.69·PA + 8.84e-4·PA²
clamp at ≥ 0
```

Worked example from today (AirGradient "Singapore" at 1.3521,103.8198, 16:35 SGT: raw 138.4, RH 63):
`0.786·138.4 − 0.0862·63 + 5.75 = 109.1` vs NEA central 105 (hour ending 16:00, still rising).

### 2.3 Does it apply in tropical Singapore?
The regression was fitted on US collocations (RH mostly 20–80 %). What that means for SG:
- **The RH term is too small for SG's 75–95 % ambient RH.** PMS overread grows non-linearly (κ-Köhler)
  above ~75–80 % RH. A linear −0.0862·RH term under-corrects on humid nights and in rain. Published
  κ-Köhler corrections cut RH-induced error by > 50 % at 50–95 % RH, but they need a κ for the aerosol.
- **Sensor RH is not ambient RH.** The PMS5003T/BME280 sits in a warm enclosure. SG AirGradient
  Open Airs reported **51–64 % RH at ~29 °C this afternoon**, when ambient was likely 65–80 %. The
  EPA fit was built with PurpleAir's own (similarly low) RH, so using sensor RH is "correct" for the
  formula. Don't substitute NEA/MSS RH.
- **The smoke branch (PA ≥ 50) is dominated by the 0.786 slope**, so the RH term matters less in exactly
  the haze regime we care about. Today's evidence supports this: see §3.2. 7 of 14 sensors land
  within 0.97–1.07× of NEA after the extended EPA correction.
- **Therefore:** apply EPA-extended as the physical correction, then an **empirical per-sensor factor
  `k` learned against NEA** over a rolling 24 h (ARCHITECTURE_V2 §3). That absorbs the tropical/RH
  residual, siting, and unit-to-unit variation. No published NEA collocation study of PMS5003 exists
  that I could find, so the NEA-anchored `k` is our local calibration.
- The SPS30 has lower RH sensitivity than the PMS5003. No EPA-style correction is published for it. Use
  `k` only.

---

## 3. Crowd sources: details and evidence

### 3.1 AirGradient

Three endpoints, none needs a key:

```bash
# (a) World dump, all ~2,800 public sensors, 1.5 MB, raw pm02
$ curl -s https://api.airgradient.com/public/api/v1/world/locations/measures/current -o ag.json
# fields: locationId, locationName, latitude, longitude, offline, pm01, pm02, pm10, pm003Count,
#         atmp, rhum, rco2, tvoc, wifi, timestamp, tvocIndex, noxIndex, model, firmwareVersion, ...

# (b) Single location, raw
$ curl -s https://api.airgradient.com/public/api/v1/world/locations/207314/measures/current
{"locationId":207314,"locationName":"Alexandra Canal","latitude":1.29213,"longitude":103.82421,
 "offline":false,"pm01":87.8,"pm02":177.0,"pm10":187.2,"pm003Count":6760,"atmp":28.6,"rhum":63,
 "timestamp":"2026-09-28T08:40:06.000Z", ...}

# (c) Map API (GPL service, CC BY-SA data): bbox query, EPA-CORRECTED pm25, plus hourly history
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=103.6&ymin=1.2&xmax=104.05&ymax=1.47&zoom=12&measure=pm25"
{"data":[{"locationId":360,"locationName":"Midwood","longitude":103.7637,"latitude":1.3641,
  "sensorType":"Small Sensor","pm25":102.7,"rhum":61,"measuredAt":"2026-09-28T08:40:13.000Z","dataSource":"AirGradient"}, ... 15 items]}
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/locations/112044805/measures/history?start=2026-09-28T05:00:00Z&end=2026-09-28T09:00:00Z&bucketSize=1h&measure=pm25"
{"data":[{"timebucket":"2026-09-28T05:00:00.000Z","value":106.4},{"timebucket":"2026-09-28T06:00:00.000Z","value":118.9},
         {"timebucket":"2026-09-28T07:00:00.000Z","value":132.8},{"timebucket":"2026-09-28T08:00:00.000Z","value":135.7}],"total":4}
# OpenAPI: https://map-data-int.airgradient.com/map/api/v1/docs-json
```

- CORS: **no `Access-Control-Allow-Origin`** on either host (tested with `Origin: https://example.com`
  and `https://map.airgradient.com`). Browsers are blocked, native/CLI/HA are fine.
- The `-int` map host is what map.airgradient.com uses. It is **undocumented for third parties** and
  may change, so wrap it behind one adapter. The `api.airgradient.com/public/api/v1/world/...`
  endpoints are the more stable choice (raw values, so apply EPA yourself).
- Licence: data shared to the AirGradient map is **CC BY-SA 4.0**. Show "Crowd data: AirGradient
  contributors (CC BY-SA 4.0)". Derived per-sensor values we republish (e.g. from a Worker) inherit
  BY-SA. That is fine for an MIT app, because the *code* licence is separate from the *data* licence.
- Latency: `timestamp` was within 0–60 s of wall-clock for 13 of 15 SG sensors at 16:35.

Singapore sensors at 16:35 SGT (world API, raw `pm02`, EPA-extended applied by me):

| sensor | model | raw pm02 | RH | EPA-corrected | nearest NEA (16:00) |
|---|---|---|---|---|---|
| Midwood | O-1PS | 131.7 | 61 | 104.0 | central 105 |
| Singapore | O-1PST | 138.4 | 63 | 109.1 | central 105 |
| Sembawang | O-1PST-CE | 99.3 | 56 | 79.0 | north 49 |
| Shelford | O-1PST | 109.7 | 53 | 87.4 | south 105 |
| Potong Pasir | O-1PST | 142.0 | 57 | 112.4 | central 105 |
| Joo Chiat Place | O-1PST | 143.7 | 58 | 113.7 | east 83 |
| CGB | O-1P | 76.2 | 58 | 60.6 | south 105 |
| Marine Terrace | O-1PST | 46.8 | 62 | 35.2 | east 83 |
| NUS Science ×3 (co-located) | O-1PST | 88.3 / 41.7 / 25.5 | 51–54 | 70.5 / 29.5 / 14.7 | south 105 |
| Alexandra Canal | O-1PST | 177.8 | 63 | 140.1 | south 105 |
| Marina Bay | O-1PST | 145.5 | 59 | 115.0 | south 105 |
| Jalan Tembusu | O-1PST | 158.8 | 56 | 125.7 | east 83 |
| Eco Botanic (Johor, MY) | O-1PST | 140.3 | 51 | – | west 117 |

Raw median 120.7 vs corrected median 95.7. **Raw overreads NEA by ~15–35 %, and correction brings it into line.**

### 3.2 AirGradient (corrected, hourly) vs NEA, 16 hours today

Map-API hourly buckets (UTC start) aligned to NEA's hour-ending SGT timestamp. Ratio = AG / NEA
(nearest region):

| sensor | nearest | hour-pairs | median ratio | last 3 h (SGT hour: AG vs NEA) |
|---|---|---|---|---|
| Midwood | central | 16 | **0.97** | 14: 78/84 · 15: 102/80 · 16: 103/105 |
| Potong Pasir | central | 16 | **1.02** | 14: 69/84 · 15: 81/80 · 16: 97/105 |
| Singapore | central | 16 | **1.03** | 14: 68/84 · 15: 78/80 · 16: 91/105 |
| Alexandra Canal | south | 15 | **1.01** | 14: 106/112 · 16: 133/105 |
| Marina Bay | south | 15 | **0.98** | 14: 93/112 · 16: 116/105 |
| Marine Terrace | east | 16 | **0.99** | 14: 46/66 · 15: 48/63 · 16: 46/83 |
| Eco Botanic (JB) | west | 16 | **1.07** | 14: 82/79 · 15: 98/103 · 16: 110/117 |
| Joo Chiat Place | east | 16 | 1.21 | 14: 65/66 · 15: 75/63 · 16: 92/83 |
| Jalan Tembusu | east | 16 | 1.38 | 14: 74/66 · 15: 87/63 · 16: 112/83 |
| Sembawang | north | 16 | 1.54 | 14: 65/48 · 15: 67/53 · 16: 73/49 |
| Shelford | south | 15 | 0.77 | 14: 66/112 · 16: 91/105 |
| CGB | south | 15 | 0.43 | 14: 47/112 · 16: 62/105 |
| NUS Science ×3 | south | 1–2 | 0.16–0.48 | too few points / erratic |

Takeaways: (1) about half the network is NEA-grade after correction. (2) Some sensors are systematically
biased, by siting or by distance from the regional station (east sensors near the coast vs NEA "east"
at 1.357,103.94). A per-sensor `k` fixes that. (3) The NUS trio shows why we need QC gates. (4) The
crowd **leads** NEA: at 16:35, corrected crowd values near "south" (Alexandra Canal 140, Marina Bay 115)
were already above NEA's 16:00 south value of 105. The haze was still thickening. **Confirmed at 17:01: NEA's 17:00 reading was south 140, central 137, east 108**, so the corrected
crowd was ~25 min ahead of the NEA publication.

### 3.3 PurpleAir
```bash
$ curl -s -i "https://api.purpleair.com/v1/sensors?fields=pm2.5_10minute&nwlng=103.6&nwlat=1.48&selng=104.1&selat=1.15"
HTTP/2 403
access-control-allow-origin: *
{"api_version":"V1.2.3-1.1.45","error":"ApiKeyMissingError","description":"No API key was found in the request."}
```
- The key is mandatory (read key via develop.purpleair.com). Billing is in points: about 100,000 points per
  US$1, and each call has a base cost plus a per-row-per-field cost. Sensor owners can read their own
  sensors free. The map's own data endpoint also requires a key now, so I could not count SG sensors.
  **Unverified. Check with a key before investing.** WAQI shows 6 live non-AirGradient crowd
  markers in SG, which suggests PurpleAir SG density is similar to or lower than AirGradient's.
- Useful fields: `pm2.5_cf_1_a/_b` (for EPA), `humidity`, `pm2.5_10minute`, `last_seen`,
  `location_type` (0 = outside), `confidence`.
- Cadence: sensors report every 120 s. Latency ~2–4 min.
- A client-embedded key would be drained by anyone, so this is **Worker-only** (ARCHITECTURE_V2 §5).

### 3.4 WAQI / aqicn
```bash
$ curl -s "https://api.waqi.info/map/bounds?latlng=1.15,103.6,1.48,104.1&networks=all&token=demo"
{"status":"error","data":"Invalid key"}
$ curl -s "https://api.waqi.info/feed/geo:1.35;103.82/?token=demo"
{"status":"ok","data":{"aqi":43,"idx":1437,... "Shanghai Environment Monitoring Center" ...}}   # demo token = Shanghai only
# The public website's (undocumented) marker feed, for evidence only:
$ curl -s "https://mapq.waqi.info/mapq2/bounds?bounds=103.6,1.2,104.05,1.47&inc=placeholders&viewer=webgl&zoom=11"
{"data":[{"idx":"1663","aqi":"180","utime":"2026-09-28T14:00:00+08:00","name":"South, Singapore"},
 {"idx":"1666","aqi":"163","utime":"2026-09-28T15:00:00+08:00","name":"Central, Singapore"},
 {"idx":"A2791069","aqi":"222","utime":"2026-09-28T08:34:16Z","name":"4 Haig Road"}, ... 13 markers]}
```
- At 16:40 SGT WAQI still showed NEA regions at the **15:00 hour (south at 14:00)**. NEA v1 already had
  16:00. So WAQI's NEA copy is **~1–2 h staler** than NEA itself.
- Values are **US EPA AQI**, not µg/m³ or PSI. NEA north 53 µg/m³ became "144". It is easy to misread.
- 6 live crowd stations ("A…" ids) + 2 dead + 1 Johor.
- The free token requires attribution and forbids redistribution. **Don't use.**

### 3.5 IQAir / AirVisual, OpenAQ, Google
```bash
$ curl -s "https://api.airvisual.com/v2/nearest_city?lat=1.35&lon=103.82"
{"status":"fail","data":{"message":"incorrect_api_key"}}
$ curl -s -i "https://api.openaq.org/v3/locations?coordinates=1.3521,103.8198&radius=25000&limit=100"
HTTP/2 401
{"message": "Unauthorized. A valid API key must be provided in the X-API-Key header."}
$ curl -s -X POST "https://airquality.googleapis.com/v1/currentConditions:lookup" -H 'Content-Type: application/json' -d '{"location":{"latitude":1.35,"longitude":103.82}}'
{"error":{"code":403,"message":"Method doesn't allow unregistered callers ... Please use API Key ...","status":"PERMISSION_DENIED"}}
```
- **IQAir Community** (free): 10k calls/month, ~5/min, city-level `nearest_city`, must link to
  AirVisual, no redistribution. Singapore data is NEA plus IQAir's own devices, in US AQI, hourly.
- **OpenAQ v3**: free key (60 req/min, 2,000/h). It ingests AirGradient (partnership), so in SG it is a
  delayed mirror of §3.1. Licence is per provider.
- **Google Air Quality API**: modelled/fused hourly at ~500 m. About US$5 per 1,000 current-conditions
  calls beyond the free monthly allowance. Maps Platform ToS restrict caching and redistribution. A key
  in an OSS client is a liability. It is modelled, and hourly, so it is no faster than NEA v1.

### 3.6 Sensor.Community
```bash
$ curl -s "https://data.sensor.community/airrohr/v1/filter/area=1.3521,103.8198,40"
[]
```
Zero sensors within 40 km of central Singapore (the earlier 25 km result is confirmed at 40 km).

---

## 4. Models are unreliable during haze (evidence)

```bash
$ curl -s "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.29587&longitude=103.82&current=pm2_5,pm10,us_aqi&hourly=pm2_5&past_days=1&forecast_days=1&timezone=Asia%2FSingapore"
current: {"time":"2026-09-28T16:00","pm2_5":32.6,"pm10":38.0,"us_aqi":105}
```

| hour SGT | Open-Meteo/CAMS pm2_5 @ south | NEA 1-hr south | model / NEA |
|---|---|---|---|
| 10:00 | 38.5 | 50 | 0.77 |
| 11:00 | 40.7 | 57 | 0.71 |
| 12:00 | 43.1 | 69 | 0.62 |
| 13:00 | 43.5 | 75 | 0.58 |
| 14:00 | 40.7 | 112 | **0.36** |
| 15:00 | 36.4 | 106 | **0.34** |
| 16:00 | 32.6 | 105 | **0.31** |
| 17:00–23:00 | 28.6 → 23.9 (forecast "improving") | – | – |

The model got the **direction wrong** (falling while the air got worse) and was **3× low** at the
peak. Global CAMS (~40 km grid) uses fire-emission inventories (GFAS) that under-represent peat
smouldering. The fires are also under cloud, so satellites don't see them (NEA's own 27 Sep update:
"The full extent of the hotspot and smoke haze situation could not be determined due to extensive
cloud cover"). Open-Meteo *does* return `access-control-allow-origin: *` and needs no key, so it is
fine for a clearly labelled "model outlook", but **never** as the "now" number.

Himawari-8/9 AOD (JAXA P-Tree): 10-min L2 at 5 km and hourly L3, with registration and FTP. It measures
aerosol optical thickness of the whole column. It is empty under cloud, and the AOD→surface-PM2.5
ratio varies with boundary-layer height. At most it is a "smoke nearby" map overlay. It is not
ground truth, and not a number to show.

---

## 5. NEA advisory wording and SPEC.md check

Sources: NEA poster "How to plan your outdoor activities during haze" (June 2026,
`haze.gov.sg/docs/default-source/posters/haze-pm-psi-guide-a4-english.pdf`), NEA "Computation of
the PSI" (`haze.gov.sg/docs/default-source/faq/computation-of-the-pollutant-standards-index-(psi).pdf`),
and the live NEA advisory JSON (§1.5).

### 5.1 1-hr PM2.5 personal guide (NEA/MOH, verbatim)

| Band | µg/m³ | Everyone | Vulnerable persons* |
|---|---|---|---|
| Band 1 Normal | 0–55 | CONTINUE with normal activities | (same) |
| Band 2 Elevated | 56–150 | REDUCE strenuous outdoor activity for the next hour | AVOID strenuous outdoor activity for the next hour |
| Band 3 High | 151–250 | AVOID strenuous outdoor activity for the next hour | AVOID all outdoor activity for the next hour |
| Band 4 Very High | ≥251 | MINIMISE all outdoor activity for the next hour | AVOID all outdoor activity for the next hour |

\* Vulnerable persons include **the elderly, pregnant women, children, and persons with chronic
lung disease or heart disease.**
Definitions: REDUCE (do less), MINIMISE (do as little as possible), AVOID (do not do),
PROLONGED (continuous exposure for several hours), STRENUOUS (involving a lot of energy or effort).
"For immediate outdoor activities, use the 1-hour PM2.5 readings. For next day activities, use the
24-hour PSI forecast and health advisory." The guide is "not intended to be prescriptive".

### 5.2 24-hr PSI health advisory (verbatim)

| 24-hr PSI | Healthy persons | Elderly, pregnant women, children | Chronic lung/heart disease |
|---|---|---|---|
| Good 0–50 | Normal activities | Normal activities | Normal activities |
| Moderate 51–100 | Normal activities | Normal activities | Normal activities |
| Unhealthy 101–200 | REDUCE prolonged or strenuous outdoor physical exertion | MINIMISE prolonged or strenuous outdoor physical exertion | AVOID prolonged or strenuous outdoor physical exertion |
| Very Unhealthy 201–300 | AVOID prolonged or strenuous outdoor physical exertion | MINIMISE outdoor activity | AVOID outdoor activity |
| Hazardous >300 | MINIMISE outdoor activity | AVOID outdoor activity | AVOID outdoor activity |

### 5.3 PSI PM2.5 sub-index breakpoints: confirmed

NEA table (24-hr PM2.5, µg/m³ → PSI): 0–12 → 0–50 · 13–55 → 51–100 · 56–150 → 101–200 ·
151–250 → 201–300 · 251–350 → 301–400 · 351–500 → 401–500. NEA's own worked example interpolates on
the **continuous** segment (12, 50)–(55, 100): "40 µg/m³ → 83". SPEC's continuous table and formula are
therefore **correct**, and SPEC's vectors check out (105→153, 117→165, 49→93. Verified against the live
v1 PSI feed: 24-hr PM2.5 south 41 → sub-index 84, north 24 → 64). Descriptor bands (Good / Moderate /
Unhealthy / Very Unhealthy / Hazardous at 50/100/200/300) are correct. The 1-hr bands 0–55 / 56–150 /
151–250 / ≥251 are correct.

Small caveat to add to the info sheet: the real PSI is the **max of six sub-indices** (PM2.5, PM10,
SO₂, CO, O₃, NO₂). "Instant PSI" uses PM2.5 only. During haze PM2.5 dominates (today PM10 sub-index
≤ 51, O₃ ≤ 28), so this is fine, but say "PM2.5-based".

### 5.4 What is wrong in SPEC.md §5 (Advice)

| SPEC band | SPEC text | Problem | Suggested replacement (NEA wording, short) |
|---|---|---|---|
| Normal | "Normal activities." | OK | "Continue normal activities." |
| Elevated | "*Consider* reducing prolonged or strenuous outdoor exertion. Elderly, kids, heart/lung conditions: *minimise* outdoor exertion." | **Too soft.** NEA says REDUCE (not "consider") for everyone, and **AVOID** strenuous outdoor activity for vulnerable persons. "Prolonged" belongs to the 24-hr PSI advice, not the 1-hr guide. It also omits **pregnant women** | "Reduce strenuous outdoor activity for the next hour. Elderly, pregnant women, children, heart/lung conditions: avoid strenuous outdoor activity." |
| High | "*Reduce* outdoor exertion. Sensitive groups: avoid it. Close windows." | **Too soft.** NEA says **AVOID** strenuous outdoor activity (everyone). Vulnerable: **AVOID ALL** outdoor activity. "Close windows" is not in NEA's 1-hr guide (fine as an extra tip, but label it as a tip) | "Avoid strenuous outdoor activity for the next hour. Vulnerable persons: avoid all outdoor activity." |
| Very High | "Avoid outdoor activity. Stay indoors, windows shut, use an air purifier." | Slightly **too strong** for healthy people (NEA: MINIMISE all outdoor activity). Vulnerable: AVOID all. Purifier/windows are extra tips, not NEA guidance | "Minimise all outdoor activity. Vulnerable persons: avoid all outdoor activity." |

Other SPEC nits:
- SPEC says `updatedTimestamp` is "~30 min later" and polls ":20–:50". **Wrong**: data appears at ~:01
  on both v1 and v2. v2 re-stamps `updatedTimestamp` at ~:30/:45 on re-publish. Poll from :01, and label
  v2's stamp "revised", not "published" (§1.1).
- SPEC should state the rate-limit behaviour (§1.2): HTTP 429, `code: 24`, `data: null`.
- Add "vulnerable persons = elderly, pregnant women, children, chronic lung/heart disease" to the info
  sheet. SPEC says "Elderly, kids, heart/lung conditions" and omits pregnant women.
- Keep the SPEC's framing "NEA itself recommends using the 1-hr PM2.5 for immediate activity decisions".
  It is correct and quoted on the poster.

---

## 6. Recommendation for v1 (now) and v2

**Add to v1 now (zero infra, low risk):**
1. **Fix the poll schedule**: 1-min polls from :01 until the new hour appears, instead of starting at
   :20. This cuts ~20 min of delay for free. Optionally merge v1 (no rate limit, true first-publish
   stamp, snake_case shape, missing key = offline) with v2 winning on conflicts.
2. **Correct the advice text** (§5.4) and handle v2 `429`s.

**Add in v2:**
3. **AirGradient crowd layer** (14 SG sensors, no key, CC BY-SA), EPA-extended correction plus a
   per-sensor NEA-anchored `k`, and QC gates → a "Now · est." nowcast. Native first, web via the
   optional Worker.
4. **Personal AirGradient/ESPHome sensor over LAN** (native apps).
5. Optional Worker: CORS proxy/cache, data.gov.sg key, push alerts, then PurpleAir.

Not recommended: WAQI, IQAir, Google (keys, ToS, cost, and not fresher than NEA v1), Sensor.Community
(no sensors), Open-Meteo/CAMS/Himawari as "now" (wrong by 3× today).

---

## Appendix: reproduce

```bash
# NEA
curl -s https://api.data.gov.sg/v1/environment/pm25
curl -s "https://api.data.gov.sg/v1/environment/pm25?date=$(TZ=Asia/Singapore date +%F)"
curl -s https://api-open.data.gov.sg/v2/real-time/api/pm25
curl -s https://api.data.gov.sg/v1/environment/psi
# AirGradient SG
curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=103.6&ymin=1.2&xmax=104.05&ymax=1.47&zoom=12&measure=pm25"
# Model (for comparison only)
curl -s "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.29587&longitude=103.82&current=pm2_5"
```

References:
- Barkjohn, Gantt, Clements (2021) *AMT* 14, 4617, US-wide PurpleAir correction.
- Barkjohn et al. (2022) *Sensors* 22, 9669, extreme smoke extension (+ 2024 correction note).
- AirGradient firmware `github.com/airgradienthq/arduino` (`docs/local-server.md`, `src/PMS/PMS.cpp`).
- AirGradient data licence: airgradient.com/documentation/data-ownership-and-sharing (CC BY-SA 4.0).
- AirGradient map API: github.com/airgradienthq/airgradient-map-api (GPL-3.0).
- data.gov.sg rate limits: guide.data.gov.sg/developer-guide/api-overview/api-rate-limits.
- NEA haze guide poster (June 2026) and PSI computation PDF (March 2014), haze.gov.sg.
- JAXA Himawari Monitor P-Tree terms: eorc.jaxa.jp/ptree/terms.html.
- PurpleAir API pricing: community.purpleair.com/t/api-pricing/4523, develop.purpleair.com.
- Google Air Quality API billing: developers.google.com/maps/documentation/air-quality/usage-and-billing.
