# Philippines — air quality data for HazeNow

Research notes captured live on **2026-09-28, 17:11–17:29 SGT (= PHT, UTC+8)**, from a Singapore IP.
Every `curl` below was actually run. Outputs are trimmed. Anything I could not reach or confirm is marked **unverified**.
Context: EMB reported "Acutely Unhealthy" to "Very Unhealthy" PM2.5 across NCR on 1 Sep 2026, attributed to
Kalimantan smoke (SunStar, "DENR records 'acutely unhealthy' to 'very unhealthy' air quality in NCR"). Today Metro Manila air is
moderate: corrected crowd values are ~15–45 µg/m³.

## TL;DR (≤6 bullets): best authoritative source, best crowd source, index used, feasibility verdict (ship now / needs proxy / blocked)

- **Authoritative: DENR-EMB's AQMS network (air.emb.gov.ph) is blocked.** `emb.gov.ph` sits behind a Cloudflare JS challenge and `air.emb.gov.ph` behind an Azure WAF (HTTP 403). I found **no documented API or open-data feed**, and EMB stations are **not** mirrored on WAQI's Manila map (0 of 49 markers). The station list, cadence and licence are all **unverified**.
- **Best crowd source to ship: AirGradient.** It has **22 live PH sensors** on the map API (8 in Metro Manila, including one at **Manila Observatory**, plus Iloilo, Bacolod, Laguna, Davao and Palawan). No key, CC BY-SA 4.0, 1-min freshness, **no CORS**. It is the same integration as SG (docs/DATA_SOURCES.md §3.1).
- **Densest network: Breathe Metro Manila (Clarity Node-S), run by Ateneo BUILD, ACRI, Manila Observatory and Clarity.** **43 of 48** nodes were live today (hourly PM2.5, NO₂), but it is only readable through Clarity's keyed API (401 without a key) or the WAQI mirror (redistribution forbidden). **Needs a data-sharing agreement** with Breathe Metro Manila.
- **Index: DENR DAO 2020-14 PM2.5 AQI**, 6 categories in µg/m³: Good 0–25 · Fair 25.1–35 · USG 35.1–45 · Very Unhealthy 45.1–55 · Acutely Unhealthy 55.1–90 · Emergency ≥91 (verified from the signed order). The bands are far stricter than NEA's.
- **Verdict: needs a proxy plus a partnership.** Ship a **crowd-only "estimate" mode for Metro Manila in v2** (AirGradient via the Worker). An authoritative "now" is **blocked** until EMB access is confirmed from a PH IP or EMB is contacted.

## Authoritative (government) sources

| source | agency | what (PM2.5 1-hr? index?) | stations (count verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS for redistribution in a free MIT app | reliability notes |
|---|---|---|---|---|---|---|---|---|---|
| **air.emb.gov.ph** "Real-Time Ambient Air Quality Monitoring" (Air Quality Management Section) | DENR-EMB | PM2.5 (and other pollutants) at AQMS stations, DAO 2020-14 categories. **Averaging period shown on site: unverified** | **unverified**. Press names ≥15 NCR stations (Las Piñas, Malabon, Mandaluyong, Manila, Marikina-Parang, Muntinlupa-Filinvest, Parañaque-Don Bosco, QC-Ateneo, QC-SMPH Commonwealth, San Juan, Taguig-TUP, Valenzuela, Makati, Navotas, Pateros) | **unverified** | none documented. Page is **403 (Azure WAF)** from SG | ? | ? | none found (**unverified**) | Could be geo-blocked or bot-blocked. Needs a retry from a PH residential IP and a real browser |
| emb.gov.ph | DENR-EMB | agency site, advisories | – | – | **Cloudflare "Just a moment…" challenge** (curl 403. Headless Chrome also stuck on the challenge after >2 min) | – | – | – | Not machine-readable |
| data.gov.ph | DICT | open-data portal | – | – | JS SPA. No air-quality dataset found with curl (**unverified**) | – | – | – | – |
| US Embassy Manila (AirNow DOS) | US Dept of State | 1-hr PM2.5 (FEM, NowCast) | site `608PH1010001` listed "Active" | **no rows in any of today's AirNow hourly files** (00–08 UTC) | `files.airnowtech.org/airnow/YYYY/YYYYMMDD/HourlyData_*.dat` | no | – | US Gov public domain | Not reporting today. Single site, 14.577,120.978 |

Evidence:

```bash
# 17:14:47 SGT
$ curl -s -o /dev/null -L -A "Mozilla/5.0" -w "%{http_code}\n" https://emb.gov.ph/                   # 403
$ curl -s -A "Mozilla/5.0" https://emb.gov.ph/ | grep -o '<title>[^<]*'
<title>Just a moment...                      # Cloudflare managed challenge ("Enable JavaScript and cookies to continue")
$ curl -s -A "Mozilla/5.0" https://air.emb.gov.ph/ | grep -o '<title>[^<]*'
<title>Azure WAF                             # HTTP 403. Same for /aqms/ and /ambient-air-quality-monitoring/
$ curl -s https://iaqm.emb.gov.ph/          # DNS failure (curl exit 6), host does not exist

# 17:23:33 SGT, AirNow site list vs hourly files
$ curl -s https://files.airnowtech.org/airnow/today/monitoring_site_locations.dat | grep -i manila
608PH1010001|PM2.5|0001|Manila|Active|PH1|U.S. Department of State Philippines - Manila|DSRP|14.577110|120.977800|...
$ for h in 00 02 04 06 08; do curl -s ".../HourlyData_20260928$h.dat" | grep -c 608PH1010001; done   # 0 0 0 0 0
```

WAQI's Manila map, checked 17:14 SGT, shows **no EMB stations**. Of 49 markers, **48 are attributed "Clarity" and 1 "sensor.community"** (attribution read from `airnet.waqi.info/airnet/feed/hourly/<id>` → `atrb.name`). So "EMB data via aqicn" claims seen in search results are not true today.

## Crowd / low-cost sensor networks

| source | operator | sensor type | what | stations (verified today) | cadence & latency | API/endpoint | key? | CORS | licence | correction needed | coverage by city | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **AirGradient** | community (Amihan Initiative, DLSU, Manila Observatory, LGUs, individuals) | PMS5003(T) ×1–2 (O-1PS, O-1PST) | PM2.5 raw (`pm02`, world API) or EPA-corrected (`pm25`, map API) + RH | **22 live on map API** (all `measuredAt` within ~3 min at 17:13). World dump lists only 8 of them | ~1 min, latency < 3 min | `map-data-int.airgradient.com/map/api/v1/measurements/current/area?...` · `api.airgradient.com/public/api/v1/world/locations/measures/current` | no | **none** (only `Access-Control-Allow-Credentials: true`, no `Allow-Origin`) | CC BY-SA 4.0 | EPA-extended (DATA_SOURCES §2.2) + per-sensor `k`. No reference to anchor `k` to (EMB inaccessible) | Metro Manila 8 (Manila Observatory QC, Valenzuela, N. Caloocan, Tivoli QC, Valle/Pasig, "Sensor 1" Pasig, Las Piñas, + 1 **indoor** at Robinson's Equitable Tower → drop), Laguna 3 (DLSU Laguna, JGIC, Los Baños), Cavite 3 (Tagaytay ×2, Pinya Farm), Iloilo 3, Bacolod 1, Capiz 1, Camarines Norte 1 (roadside), Davao 1, Palawan 1 | Best shippable source. Same adapter as SG |
| **Breathe Metro Manila / Clarity** | Ateneo BUILD (hub), ACRI/ASMPH, Manila Observatory, Clarity Movement | Clarity Node-S (PM2.5 + NO₂), solar, cellular | hourly PM2.5 | **48 nodes, 43 live** (last hour 07:00 UTC = 15:00 PHT at 17:14 PHT, so ~1–2 h latency *via WAQI*) | hourly (direct cadence **unverified**) | Clarity API `clarity-data-api.clarity.io` → **401 "Unauthorized user"** without key. Embedded map `map.clarity.io/breathe-metro-manila/widgets/v1/map?...&aqiStdId=PH-AQI` | **yes** (org API key) | `*` on the API host | Data owned by the network. **No open licence found (unverified)**. WAQI copy not redistributable | Clarity applies its own calibration (method **unverified**) | Metro Manila only. Marker names today span Manila, QC, Caloocan, Valenzuela, Navotas, Malabon, San Juan, Mandaluyong, Makati, Pasay, Pasig, Marikina, Muntinlupa, Parañaque, Pateros, Las Piñas (inferred from names, not from an official list) | Densest NCR network. **Ask Breathe Metro Manila for a read key / data-sharing MoU** |
| **Sensor.Community** | citizens | SDS011 | PM2.5 (`P2`) | **1** within 40 km of Manila (id 93871, Caloocan). **0** within 30 km of Cebu | 2.5 min | `data.sensor.community/airrohr/v1/filter/area=lat,lon,km` | no | `*` | ODbL | humidity correction (SDS011 overreads at high RH) | Caloocan only | Too sparse |
| **PurpleAir** | – | PMS5003 ×2 | – | **unverified** (403 `ApiKeyMissingError`) | 2 min | `api.purpleair.com/v1/sensors` | yes | `*` | PurpleAir ToS | EPA | ? | Worker-only, paid points |
| **IQAir / AirVisual** | – | – | US AQI | **unverified** (`incorrect_api_key`) | hourly | `api.airvisual.com/v2/nearest_city` | yes | ? | no redistribution | – | – | Don't use |
| **OpenAQ v3** | – | aggregator | – | **unverified** (401) | – | `api.openaq.org/v3/locations` | yes | yes | per provider | – | – | Probably mirrors AirGradient. EMB presence unknown |
| **WAQI / aqicn** | – | mirror | US AQI | 49 Metro Manila markers (48 Clarity) | hourly, ~2 h behind | token API | yes | `*` | ToS forbids redistribution | – | – | **Don't use**. Evidence only |
| UP / Ateneo / Manila Observatory own networks | – | – | – | Manila Observatory appears as an **AirGradient** node and a **Breathe/Clarity** partner. No separate public feed found (**unverified**) | – | – | – | – | – | – | – | Route via Breathe Metro Manila |

Evidence:

```bash
# 17:13 SGT: AirGradient map API, Metro Manila bbox (EPA-corrected pm25)
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=120.85&ymin=14.3&xmax=121.2&ymax=14.8&zoom=8&measure=pm25"
{"data":[{"locationId":8334410,"locationName":"Manila Observatory","latitude":14.6354,"longitude":121.0779,
  "sensorType":"Small Sensor","pm25":40.1,"measuredAt":"2026-09-28T09:12:54.000Z","dataSource":"AirGradient"},
 {"locationId":12013534,"locationName":"Valenzuela","pm25":25.6,"measuredAt":"2026-09-28T09:12:13.000Z",...},
 {"locationId":16017392,"locationName":"Caloocan","pm25":15,"dataSource":"SensorCommunity",...},
 {"locationId":105204881,"locationName":"Robinson's Equitable Tower (Indoor)","pm25":8.6,...}, ... 9 items]}
# whole-PH bbox (116.5,4.5 → 127,21.5): 23 items = 22 AirGradient + 1 SensorCommunity

# 17:24 SGT: hourly history (UTC buckets), Manila Observatory
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/locations/8334410/measures/history?start=2026-09-28T03:00:00Z&end=2026-09-28T09:00:00Z&bucketSize=1h&measure=pm25"
{"data":[{"timebucket":"2026-09-28T03:00:00.000Z","value":29},...,{"timebucket":"2026-09-28T08:00:00.000Z","value":25}],"total":6}

# 17:12 SGT: world API (raw), PH subset: only 8 locations, e.g.
202637 'Bacolod City Araneta-Hernaez Sts' pm02 54.0 rh 56 O-1PS ts 09:12:37Z
196876 'Daet, Camarines Norte (Roadside)' pm02 94.7 rh 53 O-1PST ts 09:12:46Z
192625 'Tivoli' pm02 52.3 rh 51 O-1PST ts 09:10:55Z
# note: the world dump returned 1,248 locations today (SG doc saw ~2,800) and one download was truncated
# (JSON parse error at byte 971,498). The response also contains raw control chars → parse with strict=False.

# 17:14 SGT: Clarity (Breathe Metro Manila)
$ curl -s -i "https://clarity-data-api.clarity.io/v1/open/all-recent-measurement/pm25/individual"
HTTP/2 401 · access-control-allow-origin: * · {"message": ["Unauthorized user"]}
$ curl -s "https://airnet.waqi.info/airnet/feed/hourly/544759"     # WAQI mirror, evidence only
{"atrb":{"name":"Clarity","url":"https://openmap.clarity.io/",...},"data":{"pm25":[...{"time":"2026-09-28T08:00:00Z","mean":21.4}]}}

# 17:14 SGT: Sensor.Community
$ curl -s "https://data.sensor.community/airrohr/v1/filter/area=14.5995,120.9842,40"   # 1 sensor: 93871 SDS011 P2 33.03
$ curl -s "https://data.sensor.community/airrohr/v1/filter/area=10.3157,123.8854,30"   # []  (Cebu)

# 17:14 SGT: keyed APIs
$ curl -s "https://api.purpleair.com/v1/sensors?fields=pm2.5_10minute&nwlng=120.9&nwlat=14.8&selng=121.2&selat=14.3"
{"error":"ApiKeyMissingError","description":"No API key was found in the request."}
$ curl -s "https://api.airvisual.com/v2/nearest_city?lat=14.6&lon=121.0"   # {"status":"fail","data":{"message":"incorrect_api_key"}}
$ curl -s -i "https://api.openaq.org/v3/locations?coordinates=14.5995,120.9842&radius=25000"   # HTTP/2 401
```

Model check (17:29 SGT): Open-Meteo/CAMS at Manila Observatory gave `pm2_5` 24.2 (16:00 PHT) vs AirGradient 25 (08:00 UTC bucket). It agreed today, in clean air. That says nothing about haze days (see SG §4, where it was 3× low). **Never use it as "now".**

## National index & bands

**DENR Administrative Order 2020-14** (signed 21 Oct 2020, published Manila Times 26 Nov 2020). Source: signed scan at
`law.upd.edu.ph/wp-content/uploads/2021/03/DENR-Administrative-Order-No-2020-14.pdf` (also `air.emb.gov.ph/wp-content/uploads/2021/01/DAO-2020-14-PM-2.5-Signed.pdf`, which is WAF-blocked for us). **Verified by reading the scan.**

| Category | Colour (hex) | PM2.5 µg/m³ | Cautionary statement (verbatim) |
|---|---|---|---|
| Good | Green #00E400 | 0–25 | None |
| Fair | Yellow #FFFF00 | 25.1–35.0 | None |
| Unhealthy for sensitive groups | Orange #FF7E00 | 35.1–45.0 | "People with respiratory disease, such as asthma, should limit outdoor exertion." |
| Very Unhealthy | Red #FF0000 | 45.1–55 | "Pedestrians should avoid heavy traffic areas. People with heart or respiratory disease, such as asthma, should stay indoors and rest as much as possible. Unnecessary trips should be postponed. People should voluntarily restrict the use of vehicles." |
| Acutely unhealthy | Purple #8F3F97 | 55.1–90 | "People, should limit outdoor exertion. People with heart or respiratory disease, such as asthma, should stay indoors and rest as much as possible. Unnecessary trips should be postponed. Motor vehicle use may be restricted. Industrial activities may be curtailed." |
| Emergency | Maroon #7E0023 | Above 91 | "Everyone should remain indoors, (keeping windows and doors closed unless heat stress is possible). Motor vehicle use should be prohibited except for emergency situations. Industrial activities, except that which is vital for public safety and health, should be curtailed." |

- It is **PM2.5 only**, in **µg/m³ directly**. There is no index-number conversion. The table has a gap (90–91) in the original.
- **Averaging period is not stated in the AQI table.** The same order sets the short-term guideline at **35 µg/m³, 24-hour** (98th percentile) and 25 µg/m³ annual. How EMB's real-time page averages (1-hr vs 24-hr) is **unverified**. This is the "lag" question to settle with EMB before we claim alignment.
- The bands are **much stricter** than NEA's. A reading of 60 is "Normal/Band 1" in SG but "Acutely unhealthy" in PH. In PH, HazeNow must use DAO bands and never SG's.
- Breathe Metro Manila's Clarity map renders with `aqiStdId=PH-AQI`, so the leading crowd network already uses DAO categories.

**Mapping to HazeNow's "1-hr PM2.5 + band + verdict":**
- Show the 1-hr (or crowd "now") PM2.5 in µg/m³, coloured by the **DAO category of that value**, labelled "past hour". Use DAO names verbatim ("Acutely unhealthy" is the official term, so don't soften it into invented names).
- Verdict copy must be **derived from the DAO cautionary statements**, and scoped "for now / the next hour" as in SPEC v1.2 §3. Suggested mapping (to be reviewed): Good/Fair → "Fine to be out." · USG → sensitive: limit outdoor exertion · Very Unhealthy → sensitive: stay indoors. Everyone: avoid heavy-traffic areas, postpone unnecessary trips · Acutely unhealthy → everyone limit outdoor exertion. Sensitive stay indoors · Emergency → everyone stay indoors.
- The DAO's "sensitive" group is only "people with heart or respiratory disease, such as asthma". It does not name children, elderly or pregnant people. Keep HazeNow's profiles, but attribute stricter advice for those groups to WHO/DOH, not DENR. The DOH wording is **unverified**.
- Drop the SG-specific "24-hr PSI" chart line. If EMB's 24-hr value becomes accessible, overlay it in the same µg/m³ unit.

## Language / localisation

- Official languages: **Filipino and English**. Government advisories (EMB, PAGASA, DOH) are mostly issued in English, with Filipino for public messaging. Ship **English first**, then Filipino (Tagalog) verdict strings. Regional languages (Cebuano, Hiligaynon for the Iloilo/Bacolod sensors) come later.
- Framing: Filipinos know haze from "usok" (smoke) and "polusyon", and heavy-traffic exposure (jeepney/EDSA) is the daily concern. DAO advice already targets pedestrians and vehicle use, so actions like "avoid main roads when walking" fit culturally and match the official text.
- Heat: the DAO itself warns against closing windows "unless heat stress is possible". Pair every "close windows" with a heat caveat (as in SPEC v1.2 §8).
- Typhoon season (Jun–Nov): rain washes PM out, and offline sensors are common during storms. The stale-state copy matters.

## Integration recipe

**v2, crowd-only estimate (AirGradient):**
1. Endpoint: `GET https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=116.5&ymin=4.5&xmax=127&ymax=21.5&zoom=8&measure=pm25` via the Worker (no CORS). The fallback is the world dump `api.airgradient.com/public/api/v1/world/locations/measures/current` with raw `pm02` + `rhum` and EPA-extended applied by us. Note that it currently lists fewer PH sites (8 vs 22).
2. Fields → Snapshot: `locationId` → stationId (prefix `ag:`), `locationName`, `latitude`/`longitude`, `pm25` → value (already EPA-corrected), `measuredAt` (UTC ISO, `Z`) → observedAt. Hourly bars come from `/locations/{id}/measures/history?bucketSize=1h&measure=pm25` (UTC buckets. **PHT = UTC+8, no DST**).
3. Filters: drop names containing "(Indoor)", `sensorType != "Small Sensor"` is not needed, drop `measuredAt` older than 15 min, drop `dataSource == SensorCommunity` unless we add SDS011 RH correction.
4. Band with DAO 2020-14 on the **1-hr mean of the corrected value** (history bucket), not the 1-min value.
5. Provenance: "Estimated from N community sensors (AirGradient, CC BY-SA 4.0) · no official reading available". Prefix "~" and show the range, per SPEC v1.2 §9.
6. Polling: every 5 min for the current area call (1 call covers PH), and history once per hour at hh:02.
7. Gotchas: the world-dump JSON contains unescaped control characters (use a lenient parser) and was once truncated mid-download (retry, validate). Timezone fields on sensors are inconsistent (`Asia/Singapore`, `Asia/Hong_Kong`, `Asia/Taipei` for PH sites), so ignore them and use `measuredAt` UTC. Map `locationId` ≠ world `locationId` for the same sensor.
8. No per-sensor `k` anchor exists without EMB. Use EPA-extended only and show wider uncertainty.

**Later (authoritative / dense):**
- EMB: retry from a PH IP with a real browser. If the real-time page loads, capture its XHRs. Then **write to EMB-AQMS** asking for a feed and redistribution permission. **Unverified whether any feed exists.**
- Breathe Metro Manila: request a Clarity read key (Worker-held) under an MoU. That gives ~43 live nodes across most NCR cities.

## Verdict

**v2 (crowd-only, Metro Manila first), not v1.x.**
- There is no authoritative "now" we can read today: EMB is behind Cloudflare/Azure WAF, has no documented API, and is not mirrored anywhere open. Without it we cannot "complement the national authority" the way we do with NEA, and we have no reference to calibrate against.
- AirGradient gives a legitimate, key-free, CC BY-SA crowd layer (8 NCR + 14 provincial sensors) that we can ship behind the existing v2 Worker, clearly labelled as an estimate on DAO 2020-14 bands.
- Key blockers: (1) EMB access and licence, (2) Breathe Metro Manila/Clarity data agreement, (3) DAO averaging period (1-hr vs 24-hr) to confirm with EMB before claiming alignment, (4) Filipino copy review.
