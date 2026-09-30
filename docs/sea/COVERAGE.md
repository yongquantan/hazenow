# Southeast Asia: city and destination coverage

What HazeNow can show in each major SEA city today, and what unblocks the rest. Built from the country
research in this folder ([REGIONAL.md](REGIONAL.md) and the per-country docs) and **re-verified live on
2026-09-28 at 10:27–10:35 UTC (18:27–18:35 SGT)**. At that time these upstreams all answered, and their payloads are
recorded in `packages/core/fixtures/sea/`:

| upstream | what came back (live) |
|---|---|
| PCD Air4Thai `forweb/getAQI_JSON.php` + `forweb/getHistoryData.php` | 173 stations; 151 had the 17:00 ICT hour, 162 had a value within 3 h |
| DOE Malaysia APIMS (ArcGIS layer) | 68/68 stations at 18:00 MYT (API index only, no concentration) |
| BMKG `kualitas-udara/pm25` (`__NUXT_DATA__`) | 25 stations, JAM 16 WIB (Palangkaraya 165.9, Kota Jambi 188.4 µg/m³) |
| KLH ISPU `apimobile/v1/getStations` | 117 stations (24-hr) |
| Hanoi `moitruongthudo.vn` | 4 listed; #48 current (17:00 ICT), #49 PM2.5 last at 15:00, #14/#15 stale since 25 Sep |
| AirGradient map API, one SEA bbox | 596 rows: 404 AirGradient, 174 OpenAQ (= Air4Thai), 18 Sensor.Community |
| SiPongi hotspots | 350 high-confidence hotspots in 24 h |

## Update: coverage hunt, 2026-09-30

The per-country hunts in [`coverage-hunt/`](coverage-hunt/) re-checked every blocked or 24-hr-only place live on
**2026-09-30, 08:00–08:20 UTC**. What changed in the app (only what passed the hunt's checks):

| change | places | why |
|---|---|---|
| **Thailand reads community sensors** (AirGradient + Sensor.Community, through the proxy), only where no PCD station is within 25 km | **Pai** → Community sensors only | ~20 live outdoor AirGradient sensors within 10 km; the nearest PCD station is 50 km away in Mae Hong Son. Estimate only: no official anchor to check against |
| **Sensor.Community rows in the AirGradient map feed are read** (tagged `sc:`, ODbL 1.0, dropped at RH ≥ 90 % because they aren't RH-corrected) | **Johor Bahru** gains "Iolite" (SPS30, 9.9 km) → an hourly estimate beside DOE's 24-hr API; **Siem Reap** gains its second network | `agMapObservations()` used to drop every non-AirGradient row |
| **Cambodia served by the proxy** (community sensors only, no chip) | **Siem Reap** → Community sensors only | AirGradient "Mondul 2" 1.6 km and Sensor.Community 2.7 km agree (19.0 vs ~20.5 µg/m³) |
| **Offline rule**: a station with no data for > 24 h is left out | **Nusa Dua** → Not available yet; Denpasar, Canggu, Seminyak, Kuta, Sanur, Ubud, Jimbaran → Community sensors only (no ISPU line) | KLH ISPU Badung Sempidi has had no data since 29 Sep 10:00 WITA. Revert when it reports again |
| **Plausibility guard**: 1-hr (or 24-h) PM2.5 outside 0–1000 µg/m³, or a rise > 400 in an hour, is left out with a calm note | all | KLH Palangka Raya reported a 24-h mean of 1,372.89 µg/m³ (BMKG's 1-hr 793.8 there is severe but possible, and stays) |
| **Cluster outlier rule** for community sensors: > 3× the cluster median (≥ 4 sensors within 10 km) and ≥ 10 µg/m³ above it | all crowd places | Pai's NT/TOT unit read 23.8 against a median of 6.8 |
| **ISPU `t_pm25 0` read as missing**, like `a_pm25 0` | Medan | DLH Medan 01/02 showed "ISPU 0 · Baik" from a missing value; DLH Medan 03 (7.2 km) is now the official row |
| New city | **Pangkalan Bun** (Central Kalimantan) → Needs proxy, 1-hr | BMKG "Pangkalanbun" (pm25_pkn2) is in the existing BMKG feed (121.7 µg/m³ at 22:00 WIB on 28 Sep) |
| Status | **Cameron Highlands** → Needs permission (MET Malaysia) | MET Malaysia runs a TEOM PM2.5 monitor there, published only as a week-old PDF chart |
| Note only, no data shown | **Balikpapan** (2 Nafas sensors ≤ 8 km, licence pending), **Bandung** (ITB), **Surabaya** (ITS) | Nafas licence unconfirmed; the university sensors are only on IQAir |

Checked and unchanged: Batam, Yogyakarta and Makassar were already hourly via BMKG (13.7, 7.4 and 22.6 km). Medan's
"+2 ISPU" are three DLH Medan stations 5.9–7.2 km out, already read by the existing feed. The trust report for every
community sensor is [COMMUNITY_SENSORS.md](COMMUNITY_SENSORS.md).

Distances are from a city-centre point. "Official ≤ 25 km" counts stations with a fresh value. "Crowd" counts live
(≤ 15 min old) outdoor AirGradient sensors in the same country. The snapshot builder only uses crowd sensors within
**10 km** of the user, and only when no official 1-hr station is within 25 km (SPEC v2.0).

**Statuses**

- **Live now (direct)**: clients call the authority themselves (CORS `*`, no key). Nothing to deploy.
- **Needs proxy (built, not deployed)**: `services/proxy` serves it today (verified live locally). It goes live once
  the proxy is deployed to Railway. Most of these also carry a permission TODO before a public launch.
- **Needs permission**: the data exists, but it can only be read with an agreement (CAPTCHA, WAF, keyed API).
- **Not feasible**: no government feed and too few sensors.

**"1-hr or 24-hr"** says what the big number is. "1-hr" = an official 1-hr PM2.5 concentration. "1-hr est." = a
community-sensor estimate. "24-hr only" = no 1-hr number exists here, so we show the authority's 24-hr index and its band,
and the big number is left empty.

---

## City table

| city | status | source(s) | nearest official station | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | band scale (chip) |
|---|---|---|---|---|---|---|---|
| **Singapore** | Live now (direct) | NEA via data.gov.sg (v1 + v2) | 5 regions island-wide | 5 | 8 / 12 | 1-hr | NEA 1-hr PM2.5 bands (Normal / Elevated / High / Very High) |
| **Kuala Lumpur / Klang Valley** | Needs proxy | DOE APIMS + AirGradient | Cheras 5.0 km | 5 | 4 / 6 | 1-hr est. (DOE: 24-hr API) | DOE API (Baik / Sederhana / Tidak Sihat / …), from the index |
| **Johor Bahru** | Needs proxy | DOE APIMS + Sensor.Community | Larkin 0.6 km | 2 | 1 / 2 (Iolite 9.9 km, S.C.; Eco Botanic 15 km). Sembawang, 9.3 km, is in Singapore and never used | 1-hr est. (one sensor) + DOE 24-hr API | DOE API |
| **Penang (George Town)** | Needs proxy | DOE APIMS | Minden 6.8 km | 4 | 0 / 0 | 24-hr only | DOE API |
| **Ipoh** | Needs proxy | DOE APIMS | Tasek 4.6 km | 2 | 0 / 0 | 24-hr only | DOE API |
| **Malacca** | Needs proxy | DOE APIMS | Bandaraya Melaka 0.8 km | 3 | 0 / 0 | 24-hr only | DOE API |
| **Kuching** | Needs proxy | DOE APIMS | Kuching 3.4 km | 2 | 0 / 0 | 24-hr only | DOE API |
| **Kota Kinabalu** | Needs proxy | DOE APIMS | Kota Kinabalu 11.4 km | 2 | 0 / 0 | 24-hr only | DOE API |
| **Jakarta** | Needs proxy | BMKG + KLH ISPU + AirGradient | BMKG Kemayoran 5.9 km (ISPU DKI1 2.9 km) | 1 BMKG + 12 ISPU | 1 / 2 | 1-hr | ISPU categories on the 1-hr value (BMKG practice) |
| **Surabaya** | Needs proxy | KLH ISPU | ISPU Mojokerto 35 km (no BMKG within 250 km) | 0 | 0 / 0 (ITS university sensors exist, IQAir only: note shown) | 24-hr only | ISPU, from the index |
| **Bandung** | Needs proxy | KLH ISPU | ISPU Saguling 14.8 km (BMKG 120 km) | 1 ISPU | 0 / 0 (ITB campus sensor exists, IQAir only: note shown) | 24-hr only | ISPU, from the index |
| **Medan** | Needs proxy | BMKG + KLH ISPU | BMKG Medan 19.7 km (ISPU DLH Medan 01–03, 5.9–7.2 km) | 1 + 3 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Palembang** | Needs proxy | BMKG + KLH ISPU + AirGradient | BMKG Musi 2 8.7 km (ISPU 3.2 km) | 2 + 1 | 11 / 11 | 1-hr | ISPU on the 1-hr value |
| **Jambi** | Needs proxy | BMKG + KLH ISPU | BMKG Kota Jambi 3.7 km | 2 + 2 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Pekanbaru** | Needs proxy | BMKG + KLH ISPU | BMKG Pekanbaru 5.0 km | 1 + 1 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Pontianak** | Needs proxy | BMKG + KLH ISPU | BMKG Kubu Raya 17.4 km (ISPU 2.3 km) | 1 + 2 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Palangka Raya** | Needs proxy | BMKG + KLH ISPU + SiPongi | BMKG Palangkaraya 3.7 km | 1 + 1 | 0 / 0 | 1-hr (166 µg/m³, Sangat Tidak Sehat, at verification; 30 Sep: KLH's 24-h 1,372.89 fails the plausibility guard) | ISPU on the 1-hr value |
| **Pangkalan Bun** | Needs proxy | BMKG | BMKG Pangkalanbun 6.4 km | 1 | 0 / 0 | 1-hr (added 30 Sep) | ISPU on the 1-hr value |
| **Balikpapan** | Needs proxy | KLH ISPU | ISPU Balikpapan Baru 0.7 km (BMKG Samarinda 90 km) | 3 ISPU | 2 Nafas / 2 (3.7, 7.4 km; licence pending, not shown) | 24-hr only | ISPU, from the index |
| **Samarinda** | Needs proxy | BMKG + KLH ISPU | BMKG Samarinda 2.2 km | 1 + 1 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Makassar** | Needs proxy | BMKG | BMKG Maros 22.6 km (nearest ISPU 366 km) | 1 | 0 / 0 | 1-hr (no official 24-hr row) | ISPU on the 1-hr value |
| **Denpasar** | Community sensors only (while ISPU Sempidi is offline) | AirGradient + KLH ISPU | ISPU Badung Sempidi 8.3 km, offline since 29 Sep 10:00 WITA (no BMKG within 500 km) | 0 live | 14 / 36 | 1-hr est. | ISPU on the 1-hr estimate |
| **Batam** | Needs proxy | BMKG | BMKG Batam 13.7 km (nearest ISPU 179 km) | 1 | 0 / 0 | 1-hr (no official 24-hr row) | ISPU on the 1-hr value |
| **Bangkok** | Live now (direct) | PCD Air4Thai (incl. 68 BMA stations) | Phra Nakhon 0.9 km | 78 | 20 / 42 | 1-hr | PCD Thai AQI, from the 24-hr index |
| **Chiang Mai** | Live now (direct) | PCD Air4Thai | Yupparaj School 0.6 km | 2 | 4 / 20 | 1-hr | PCD Thai AQI |
| **Chiang Rai** | Live now (direct) | PCD Air4Thai | Chiangrai NRE Office 1.8 km | 1 | 2 / 2 | 1-hr | PCD Thai AQI |
| **Phuket** | Live now (direct) | PCD Air4Thai | Municipal Health Center 0.5 km | 1 | 1 / 2 | 1-hr | PCD Thai AQI |
| **Hat Yai** | Live now (direct) | PCD Air4Thai | Hat Yai Municipality 1.7 km | 1 | 0 / 2 | 1-hr | PCD Thai AQI |
| **Khon Kaen** | Live now (direct) | PCD Air4Thai | Water Resources Office 4 1.9 km | 1 | 0 / 0 | 1-hr | PCD Thai AQI |
| **Pattaya** | Live now (direct) | PCD Air4Thai | Laem Chabang Stadium 22.1 km | 1 | 0 / 1 | 1-hr (with a range) | PCD Thai AQI |
| **Nakhon Ratchasima** | Live now (direct) | PCD Air4Thai | Waste Water Pumping Station 0.1 km | 1 | 0 / 0 | 1-hr | PCD Thai AQI |
| **Udon Thani** | Live now (direct) | PCD Air4Thai | Nong Prajak Park 0.6 km | 1 | 0 / 0 | 1-hr | PCD Thai AQI |
| **Metro Manila** | Needs proxy | AirGradient (crowd only) | none (EMB blocked) | 0 | 1 / 7 (≈ 8 across NCR) | 1-hr est. | DENR DAO 2020-14 categories on the estimate |
| **Cebu** | Needs permission | none readable (EMB behind WAF) | none | 0 | 0 / 0 (nearest 110 km) | none | DENR DAO 2020-14 |
| **Davao** | Needs permission | none readable (EMB) | none | 0 | 0 / 1 (19 km) | none | DENR DAO 2020-14 |
| **Hanoi** | Needs proxy | moitruongthudo.vn (CEM stations) + AirGradient | Nhân Chính 6.5 km (Giải Phóng 2.9 km, PM2.5 3 h stale) | 1 live of 2 | 0 / 1 | 1-hr (mean of 5-min) | VN_AQI, from the published hourly index |
| **Ho Chi Minh City** | Needs permission | CEM (CAPTCHA-walled); AirGradient 2 | none readable | 0 | 1 / 2 | 1-hr est., no band | VN_AQI (no official value to band) |
| **Da Nang** | Needs permission | CEM (CAPTCHA-walled) | none readable | 0 | 0 / 0 | none | VN_AQI |
| **Phnom Penh** | Not feasible | AirGradient 2 (14 km+) | none (MoE publishes nothing) | 0 | 0 / 2 | none | none (no national scale) |
| **Siem Reap** | Needs proxy (community sensors only) | AirGradient + Sensor.Community | none | 0 | 2 / 2 (Mondul 2 1.6 km, S.C. 2.7 km) | 1-hr est. | none: number + WHO line |
| **Vientiane** | Needs proxy | AirGradient (UNICEF schools network) | none (MONRE site suspended) | 0 | 5 / 7 | 1-hr est. | none: number + WHO line, no chip |
| **Luang Prabang** | Needs proxy | AirGradient (UNICEF schools network) | none | 0 | 2 / 2 | 1-hr est. | none: number + WHO line |
| **Yangon** | Not feasible | AirGradient 1 (reads 0, suspect) | none | 0 | 1 / 1 | none | none |
| **Mandalay** | Not feasible | none | none | 0 | 0 / 0 | none | none |
| **Bandar Seri Begawan** | Not feasible | JASTRe PSI (JPEG image only) | none machine-readable | 0 | 0 / 0 (Belait sensor 85 km) | none | JASTRe PSI words, official row only |
| **Dili** | Not feasible | none | none | 0 | 0 / 0 | none | none |

**Totals (46 cities, 30 Sep):** Live now (direct): **10** (Singapore + 9 Thai cities). Needs proxy (built, not deployed):
**27** (7 MY, 15 ID incl. Pangkalan Bun, Metro Manila, Hanoi, Vientiane, Luang Prabang, Siem Reap); 5 of them are
community sensors only (Denpasar while Sempidi is offline, Metro Manila, Vientiane, Luang Prabang, Siem Reap). Of the 27,
1-hr official or estimate: 19. Needs permission: **4** (Cebu, Davao, HCMC, Da Nang). Not feasible: **5** (Phnom Penh,
Yangon, Mandalay, Bandar Seri Begawan, Dili).

### Notes that change the picture

- **Air4Thai serves an incomplete TLS chain** (verified 2026-09-28: a Let's Encrypt leaf signed by `YR1`, then an
  unrelated Sectigo chain). Google Chrome completes it via AIA (tested: a cross-origin `fetch` from another origin returned
  200 with 173 stations), and so does curl on macOS. **Node, Bun, Python and Android's OkHttp fail** with
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Thailand stays "Live now (direct)" for the web and Apple clients. The Android app must
  either pin the two public certs for `air4thai.pcd.go.th` (they are in `services/proxy/src/certs.ts`) or use the proxy.
  The proxy already adds them, for those hosts only.
- **Malaysia has no 1-hr PM2.5 at all.** In six of the seven MY cities the honest product today is the DOE API (24-hr based)
  plus its band. Only the Klang Valley has enough community sensors for a "now" estimate.
- **Indonesia's "now" is BMKG's hourly PM2.5**, which is scraped from HTML. It covers the fire belt well (Palembang, Jambi,
  Pekanbaru, Pontianak, Palangka Raya, Samarinda), but not Java's big cities outside Jakarta (Surabaya, Bandung).
- The **cross-border rule** holds in the data: Johor Bahru's nearest station is DOE Larkin (0.6 km). The proxy returns 409
  if a client asks for `sg` at a Johor point, and `locate()` never returns a station from the other side.

---

## Popular destinations

Tourist, weekend-trip and expat places, on top of the city table above. **Verified live on 2026-09-29 at 02:06–02:10 SGT
(2026-09-28 18:06–18:10 UTC; 01:06 WIB/ICT, 02:06 WITA/MYT)**. The payloads are recorded in `packages/core/fixtures/sea/`
with those timestamps, and `packages/core/test/destinations.test.ts` re-derives every status below from them.

**74 destinations** in the picker's "Popular" subgroup: **52 new places** plus 22 cities from the table above that are also
destinations (Bangkok, Phuket, Penang, Denpasar, Batam, JB, …).

| status (30 Sep) | all 74 | the 52 new |
|---|---|---|
| Live now (direct) | 11 | 6 |
| Needs proxy | 16 | 6 |
| Community sensors only | 11 | 8 |
| Not available yet | 36 | 32 |

(29 Sep: 11 / 24 / 2 / 37. Pai and Siem Reap became community-only, Nusa Dua lost its only official station, and six
Bali places are community-only while Sempidi is offline. Cameron Highlands is "needs permission", which the picker still
shows as "Not available yet".)

### Rules (the same ones the app applies)

- **Same country only.** Every point was checked with `countryAt()`; no station or sensor from another country counts
  (Bintan's nearest data is BMKG Batam, same country; JB never uses NEA; Desaru uses DOE Kota Tinggi, not Singapore).
- **Live now (direct)**: Thailand, a PCD Air4Thai station **≤ 25 km** that reported PM2.5 in the last 24 h. Since 30 Sep
  the Thai feed also reads community sensors through the proxy, but only where no PCD station is within 25 km (Pai).
- **Needs proxy**: MY/ID, an official station ≤ 25 km (DOE API, BMKG 1-hr or KLH ISPU 24-hr). The "now number" column
  says whether that gives a 1-hr number, a community estimate (sensors ≤ 10 km), or only the 24-hr index.
- **Community sensors only**: no official station ≤ 25 km, but **at least two** live outdoor AirGradient sensors ≤ 10 km
  (one sensor can't be cross-checked, so it isn't enough on its own), in a country the proxy serves (TH, MY, ID, VN, PH,
  LA, KH). Since 30 Sep a Sensor.Community sensor counts too (Siem Reap: one of each network, agreeing).
- **Offline**: a station with no data for more than 24 h doesn't count (the builder drops it too).
- **Not available yet**: none of the above. The place shows a calm "Not available yet" with the reason and **what would
  fix it**. Cambodia has no government feed; only Siem Reap has enough community sensors.
- **No stretching.** A picked destination is built with `withinKm: 25` (`placeQuery()`), so the snapshot builder can't
  fall back to its 60 km "nearest_far" station, and freshness is judged inside that radius. Examples from this capture:
  left to the default rules, Koh Phi Phi would borrow Krabi town's station 38 km away; with the radius it says "Not
  available yet". Phuket's PCD station (0.5 km) had no PM2.5 since 17:00 ICT; the default rules drop it as stale and find
  nothing fresh within 60 km, so Phuket would show no number. With the radius, Phuket shows its own 17:00 reading, marked
  as delayed.
- Distances are from the place's point in `places.ts`. DOE: 8 of 68 stations (incl. Minden, Kuching, Cheras) returned no
  reading at 02:00 MYT, so their distance comes from the 28 Sep capture and they're marked as such.

### Evidence (the calls, and a short sample)

```
$ UA="HazeNow-proxy/0.1 (+https://github.com/yongquantan/hazenow; free, open-source haze app)"
$ curl -sS -A "$UA" "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=92&ymin=-11.2&xmax=141.2&ymax=28.6&zoom=12&measure=pm25"
200, 136 KB, 392 AirGradient rows in SEA (388 live and outdoor)
{"locationId":119810403,"locationName":"Jl. Abasan","longitude":115.14625,"latitude":-8.64585,"pm25":62.8,"rhum":59,"measuredAt":"2026-09-28T18:05:37.000Z","dataSource":"AirGradient"}   # Canggu, 0.9 km
{"locationId":81051517,"locationName":"zest ubud","longitude":115.25379,"latitude":-8.50498,"pm25":28.4,...,"measuredAt":"2026-09-28T18:05:31.000Z"}                                    # Ubud, 1.0 km

$ curl -sS -A "$UA" https://ispu.kemenlh.go.id/apimobile/v1/getStations
200, 136 KB, 115 stations with a reading
{"id_stasiun":"KABUPATEN_BADUNG","waktu":"2026-09-29 01:00:00","lat":"-8.6039","lon":"115.1780","a_pm25":"7.36","nama":"Kabupaten Badung Sempidi"}
{"id_stasiun":"KABUPATEN_MANGGARAI_BARAT","waktu":"2026-09-29 01:00:00","lat":"-8.4952","lon":"119.8940","a_pm25":"11.95","nama":"Kabupaten Manggarai Barat Wae Kalamb"}

$ curl -sS -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" \
    https://www.bmkg.go.id/kualitas-udara/pm25        # "-A Mozilla/5.0" alone → 403 (39 bytes), as indonesia.md warns
200, 200 KB, 26 stations, JAM 00 WIB (hour ending 01:00)
"Batam",130.7,"1.12400","104.12600"   … "Sleman" 35.1 (Yogyakarta, 7.4 km). No BMKG station on Bali, Lombok or Flores.

$ curl -sS -A "$UA" -H "Referer: https://eqms.doe.gov.my/" "https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=…&f=json"
200, 21 KB, 68 features, 60 with a reading at 02:00 MYT
{"STATION_ID":"CA02K","API":54,"CLASS":"Moderate","LATITUDE":6.331608,"LONGITUDE":99.858461,"STATION_LOCATION":"Langkawi, KEDAH"}
{"STATION_ID":"CA36J","API":153,"CLASS":"Unhealthy","LATITUDE":1.564027,"LONGITUDE":104.22533,"PLACE":"Sek. Men. Agama Bandar Penawar Kota Tinggi Johor"}   # Desaru, 3.9 km
{"STATION_ID":"CA08P","DATETIME":null,"API":null,"STATION_LOCATION":"Minden, PULAU PINANG"}                                                               # no reading this hour

$ curl -sS https://air4thai.pcd.go.th/forweb/getAQI_JSON.php                     # + getHistoryData.php for all 173 stations
200, 134 KB (history 252 KB), 173 stations, 141 with a 1-hr PM2.5 in the last 2 h 15 min
43t  Municipal Health Center (Phuket)  7.884488,98.391283  last PM2.5 hour 17:00 ICT (22:00–01:00 null)
119t Thara Public Park (Krabi)         8.0506237,98.9180489  00:00 ICT = 22.3 µg/m³
```

Distances: `haversineKm` from each place to every station/sensor in these payloads (`packages/core/test/destinations.test.ts`
reproduces them).

#### Indonesia (19)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Bandung** | Needs proxy | ISPU Kabupaten Bandung Barat Saguling 15 km | 1 | 0 / 0 (nearest 106 km) | 24-hr only | — |
| **Denpasar** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 8.3 km, offline since 29 Sep | 0 | 15 / 37 (nearest 3.5 km) | 1-hr est. | — |
| **Canggu** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 6.5 km, offline since 29 Sep | 0 | 22 / 37 (nearest 0.9 km) | 1-hr est. | — |
| **Seminyak** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 9.8 km, offline since 29 Sep | 0 | 15 / 37 (nearest 3.4 km) | 1-hr est. | — |
| **Kuta** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 13 km, offline since 29 Sep | 0 | 10 / 36 (nearest 6.4 km) | 1-hr est. | — |
| **Sanur** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 13 km, offline since 29 Sep | 0 | 3 / 37 (nearest 0.6 km) | 1-hr est. | — |
| **Ubud** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 14 km, offline since 29 Sep | 0 | 8 / 34 (nearest 1.0 km) | 1-hr est. | — |
| **Jimbaran** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 21 km, offline since 29 Sep | 0 | 3 / 28 (nearest 6.7 km) | 1-hr est. | — |
| **Nusa Dua** (Bali) | Not available yet | ISPU Kabupaten Badung Sempidi 23 km, offline since 29 Sep | 0 | 0 / 20 (nearest 10.4 km) | none | Sempidi coming back online, or one community sensor in Nusa Dua. |
| **Uluwatu** (Bali) | Community sensors only | ISPU Kabupaten Badung Sempidi 27 km | 0 | 3 / 20 (nearest 1.5 km) | 1-hr est. | — |
| **Batam** (Riau Islands) | Needs proxy | BMKG Batam 14 km | 1 | 0 / 0 (nearest 448 km) | 1-hr | — |
| **Bintan** (Riau Islands) | Not available yet | BMKG Batam 26 km | 0 | 0 / 0 (nearest 458 km) | none | Two community sensors at Lagoi would cover the resorts. |
| **Tanjung Pinang** (Riau Islands) | Not available yet | BMKG Batam 44 km | 0 | 0 / 0 (nearest 428 km) | none | Two community sensors in Tanjung Pinang. |
| **Yogyakarta** | Needs proxy | BMKG Sleman 7.4 km | 1 | 0 / 0 (nearest 252 km) | 1-hr | — |
| **Mataram** (Lombok) | Not available yet | ISPU Kabupaten Badung Sempidi 103 km | 0 | 0 / 0 (nearest 92 km) | none | Two community sensors in Mataram. |
| **Senggigi** (Lombok) | Not available yet | ISPU Kabupaten Badung Sempidi 96 km | 0 | 0 / 0 (nearest 84 km) | none | Two community sensors in Senggigi. |
| **Gili Trawangan** (Lombok) | Not available yet | ISPU Kabupaten Badung Sempidi 99 km | 0 | 0 / 0 (nearest 86 km) | none | Two community sensors on Gili Trawangan. |
| **Kuta (Lombok)** | Not available yet | ISPU Kabupaten Badung Sempidi 125 km | 0 | 0 / 0 (nearest 114 km) | none | Two community sensors in Kuta or Mandalika. |
| **Labuan Bajo** | Needs proxy | ISPU Kabupaten Manggarai Barat Wae Kalamb 0.7 km | 1 | 0 / 0 (nearest 507 km) | 24-hr only | One community sensor in town would add an hourly number (today it gets ISPU's 24-hr index only). |

#### Malaysia (14)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Kuala Lumpur** | Needs proxy | DOE Cheras 5.0 km (28 Sep; no reading at 02:00) | 5 | 4 / 6 (nearest 3.1 km) | 1-hr est. | — |
| **Johor Bahru** | Needs proxy | DOE Larkin 0.6 km | 2 | 1 / 2 (Iolite, Sensor.Community, 9.9 km; 30 Sep) | 1-hr est. + 24-hr API | — |
| **Penang** | Needs proxy | DOE Minden 6.8 km (28 Sep; no reading at 02:00) | 4 | 0 / 0 (nearest 113 km) | 24-hr only | — |
| **Batu Ferringhi** (Penang) | Needs proxy | DOE Minden 14 km (28 Sep; no reading at 02:00) | 3 | 0 / 0 (nearest 106 km) | 24-hr only | — |
| **Ipoh** | Needs proxy | DOE Tasek Ipoh 4.6 km | 2 | 0 / 0 (nearest 171 km) | 24-hr only | — |
| **Malacca** | Needs proxy | DOE Bandaraya Melaka 0.8 km | 3 | 0 / 0 (nearest 105 km) | 24-hr only | — |
| **Kuching** (Sarawak) | Needs proxy | DOE Kuching 3.4 km (28 Sep; no reading at 02:00) | 2 | 0 / 0 (nearest 750 km) | 24-hr only | — |
| **Kota Kinabalu** (Sabah) | Needs proxy | DOE Kota Kinabalu 11 km | 2 | 0 / 0 (nearest 50 km) | 24-hr only | — |
| **Langkawi** | Needs proxy | DOE Langkawi 6.8 km | 1 | 0 / 0 (nearest 47 km) | 24-hr only | — |
| **Cameron Highlands** | Not available yet | DOE Tasek Ipoh 34 km; MET Malaysia TEOM on site (week-old PDF only) | 0 | 0 / 0 (nearest 147 km) | none | Needs permission: a live feed from MET Malaysia's Cameron Highlands monitor (or two community sensors in Tanah Rata). |
| **Genting Highlands** | Not available yet | DOE Batu Muda 27 km | 0 | 0 / 0 (nearest 27 km) | none | Two community sensors at Genting. |
| **Desaru** | Needs proxy | DOE Kota Tinggi 3.9 km | 2 | 0 / 0 (nearest 73 km) | 24-hr only | — |
| **Tioman** | Not available yet | DOE Rompin 83 km | 0 | 0 / 0 (nearest 165 km) | none | Two community sensors at Tekek or ABC. |
| **Port Dickson** | Needs proxy | DOE Port Dickson 12 km | 1 | 0 / 0 (nearest 47 km) | 24-hr only | — |

#### Thailand (18)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Bangkok** | Live now (direct) | PCD Phra Nakhon District Office, Bangkok 0.9 km | 79 | 20 / 42 (nearest 2.8 km) | 1-hr | — |
| **Chiang Mai** | Live now (direct) | PCD Yupparaj Wittayalai School 0.6 km | 2 | 4 / 21 (nearest 1.1 km) | 1-hr | — |
| **Chiang Rai** | Live now (direct) | PCD Natural Resources and Environment Office, Chiangrai 1.8 km | 1 | 2 / 2 (nearest 3.9 km) | 1-hr | — |
| **Phuket** | Live now (direct) | PCD Municipal Health Center 0.5 km | 1 | 1 / 2 (nearest 9.9 km) | 1-hr | — |
| **Patong** (Phuket) | Live now (direct) | PCD Municipal Health Center 11 km | 1 | 0 / 2 (nearest 12 km) | 1-hr | — |
| **Pattaya** | Live now (direct) | PCD Laem Chabang Municipal Stadium 22 km | 1 | 0 / 1 (nearest 17 km) | 1-hr | — |
| **Krabi** | Live now (direct) | PCD Thara Public Park 4.2 km | 1 | 0 / 0 (nearest 60 km) | 1-hr | — |
| **Ao Nang** (Krabi) | Live now (direct) | PCD Thara Public Park 11 km | 1 | 0 / 0 (nearest 49 km) | 1-hr | — |
| **Koh Phi Phi** (Krabi) | Not available yet | PCD Thara Public Park 38 km | 0 | 0 / 0 (nearest 51 km) | none | A PCD station on Phi Phi Don (or two community sensors within 10 km). |
| **Koh Lanta** (Krabi) | Not available yet | PCD Thara Public Park 51 km | 0 | 0 / 0 (nearest 86 km) | none | A PCD station on Koh Lanta (or two community sensors within 10 km). |
| **Koh Samui** | Not available yet | PCD Environment Agency Section 14, Surat Thani 92 km | 0 | 0 / 0 (nearest 251 km) | none | A PCD station on Samui (or two community sensors within 10 km). |
| **Koh Phangan** | Not available yet | PCD Environment Agency Section 14, Surat Thani 102 km | 0 | 0 / 0 (nearest 263 km) | none | A PCD station on Koh Phangan (or two community sensors within 10 km). |
| **Koh Tao** | Not available yet | PCD Sports Stadium, Chumphon 84 km | 0 | 0 / 0 (nearest 249 km) | none | A PCD station on Koh Tao (or two community sensors within 10 km). |
| **Hua Hin** | Live now (direct) | PCD Hua Hin Weather Station Prachuap Khiri Khan Meteorological Station 1.1 km | 1 | 0 / 0 (nearest 26 km) | 1-hr | — |
| **Pai** | Community sensors only | PCD Natural Resources and Environment Office, Mae Hongson 50 km | 0 | 21 / 22 (nearest 0.3 km) | 1-hr est. (no official anchor) | — |
| **Ayutthaya** | Live now (direct) | PCD Ayutthaya Witthayalai School 0.4 km | 1 | 0 / 2 (nearest 21 km) | 1-hr | — |
| **Kanchanaburi** | Live now (direct) | PCD Kanchanaburi Meteorological Station 0.4 km | 1 | 0 / 0 (nearest 53 km) | 1-hr | — |
| **Koh Chang** | Not available yet | PCD Trat Provincial Central Stadium 29 km | 0 | 0 / 0 (nearest 30 km) | none | A PCD station on Koh Chang (or two community sensors within 10 km). |

#### Vietnam (10)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Hanoi** | Needs proxy | moitruongthudo Nhân Chính 6.5 km (28 Sep; not re-fetched) | 1 | 0 / 1 (nearest 10 km) | 1-hr | — |
| **Ho Chi Minh City** | Not available yet | none | 0 | 1 / 2 (nearest 6.1 km) | none | One more community sensor within 10 km (there's one 6 km out), or a CEM data agreement. |
| **Da Nang** | Not available yet | none | 0 | 0 / 0 (nearest 599 km) | none | Two community sensors in Da Nang, or a CEM data agreement. |
| **Hoi An** | Not available yet | none | 0 | 0 / 0 (nearest 595 km) | none | Two community sensors in Hoi An (or a CEM data agreement). |
| **Hue** | Not available yet | none | 0 | 0 / 0 (nearest 533 km) | none | Two community sensors in Hue (or a CEM data agreement). |
| **Nha Trang** | Not available yet | none | 0 | 0 / 0 (nearest 319 km) | none | Two community sensors in Nha Trang (or a CEM data agreement). |
| **Da Lat** | Not available yet | none | 0 | 0 / 0 (nearest 233 km) | none | Two community sensors in Da Lat (or a CEM data agreement). |
| **Ha Long** | Not available yet | none | 0 | 0 / 0 (nearest 118 km) | none | Two community sensors in Ha Long (or a CEM data agreement). |
| **Sapa** | Not available yet | none | 0 | 0 / 0 (nearest 263 km) | none | Two community sensors in Sapa (or a CEM data agreement). |
| **Phu Quoc** | Not available yet | none | 0 | 0 / 0 (nearest 303 km) | none | Two community sensors on Phu Quoc (or a CEM data agreement). |

#### Philippines (8)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Cebu** | Not available yet | none | 0 | 0 / 0 (nearest 110 km) | none | Two community sensors in Cebu City, or an EMB data feed. |
| **Davao** | Not available yet | none | 0 | 0 / 1 (nearest 19 km) | none | Two community sensors in Davao City, or an EMB data feed. |
| **Boracay** | Not available yet | none | 0 | 0 / 0 (nearest 124 km) | none | Two community sensors on Boracay. |
| **El Nido** (Palawan) | Not available yet | none | 0 | 0 / 0 (nearest 319 km) | none | Two community sensors in El Nido. |
| **Coron** (Palawan) | Not available yet | none | 0 | 0 / 0 (nearest 245 km) | none | Two community sensors in Coron. |
| **Puerto Princesa** (Palawan) | Not available yet | none | 0 | 0 / 0 (nearest 146 km) | none | Two community sensors in Puerto Princesa. |
| **Siargao** | Not available yet | none | 0 | 0 / 0 (nearest 299 km) | none | Two community sensors in General Luna. |
| **Panglao** (Bohol) | Not available yet | none | 0 | 0 / 0 (nearest 149 km) | none | Two community sensors on Panglao. |

#### Cambodia (3)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Siem Reap** | Community sensors only | none | 0 | 2 / 2 (AirGradient 1.6 km, Sensor.Community 2.7 km) | 1-hr est. | — |
| **Sihanoukville** | Not available yet | none | 0 | 0 / 0 (nearest 177 km) | none | Two community sensors in Sihanoukville. |
| **Kampot** | Not available yet | none | 0 | 0 / 0 (nearest 129 km) | none | Two community sensors in Kampot. |

#### Laos (2)

| place | status | nearest official station (29 Sep) | official ≤ 25 km | crowd ≤ 10 / ≤ 25 km | now number | what would fix it |
|---|---|---|---|---|---|---|
| **Luang Prabang** | Community sensors only | none | 0 | 2 / 2 (nearest 0.8 km) | 1-hr est. | — |
| **Vang Vieng** | Not available yet | none | 0 | 0 / 1 (nearest 11 km) | none | Two community sensors in Vang Vieng town. |

### Bali

**What drives Bali's air.** Short version: Bali is usually *not* where the Sumatra/Kalimantan haze goes, and on the night we
checked its air was local.

- **Transboundary haze rarely reaches it.** The fire belt (Riau, Jambi, South Sumatra, West/Central Kalimantan) sits 900–1,500 km
  north-west of Bali. The regional haze "regularly" hits Indonesia's fire provinces, Malaysia, Singapore and Brunei, and only
  reaches farther in severe years ([Wikipedia: Southeast Asian haze](https://en.wikipedia.org/wiki/Southeast_Asian_haze), which
  doesn't list Bali or Nusa Tenggara). In our 28 Sep SiPongi capture, **0 of 350 high-confidence hotspots were within 100 km of
  Denpasar**, and 1 within 300 km. On the same night BMKG read **172 µg/m³ in Kota Jambi**, while Bali's sensors read 15–74.
- **Local sources are the usual suspects**: open burning of household and farm waste (common across Indonesia, including Bali),
  traffic and scooters in the Denpasar–Kuta–Canggu belt, and dry-season dust (the dry season runs roughly May–October).
  *Uncertain:* we couldn't pull a primary source apportionment study for Bali in this pass (search budget ran out), so treat
  this as the typical picture, not a measured split.
- **What the sensors showed (02:05 WITA, 29 Sep):** a clear local gradient. The Canggu, Pererenan and Tabanan rice-field side read
  **46–74 µg/m³** (most of the 22 sensors within 10 km of Canggu), Ubud 28–46, and the Bukit/south coast (Uluwatu, Sanur, Nusa Dua
  edge) **15–22**. A gradient that sharp over 10–20 km, at night, points to nearby burning or smoke trapped under a night-time
  inversion, not regional haze. *Inference, not a measurement of sources.*
- **Caveat on the number itself.** KLH's ISPU station at Sempidi (Badung) reported a **24-hr mean of 7.4 µg/m³**, while sensors
  3–7 km away read 36–60 at night. Bali has no BMKG 1-hr station, so the sensors can't be calibrated against an official hourly
  anchor (`k` stays null, "uncalibrated"), and the app shows the value as a community estimate with a range. The two can both be
  right (a clean day and a smoky night average out), but we can't prove it from one capture.

**What Bali gets today** (once the proxy is deployed; in Preview until then, from the recorded 28 Sep set, which already holds
Bali's 37 sensors):

| place | big number | chip / official line | status |
|---|---|---|---|
| Canggu, Seminyak, Kuta, Denpasar, Sanur, Ubud, Jimbaran | 1-hr community estimate (AirGradient, EPA-corrected), with a range | ISPU category on the estimate; KLH ISPU Badung Sempidi 24-hr as the official line when it reports (offline since 29 Sep) | Community sensors only while Sempidi is offline, else Needs proxy |
| Nusa Dua | none (nearest sensor 10.4 km) | ISPU Badung Sempidi 24-hr only (23 km), offline since 29 Sep | Not available yet while Sempidi is offline |
| Uluwatu | 1-hr community estimate (3 sensors ≤ 10 km) | no official line (ISPU 27 km is past 25 km) | Community sensors only |

Honest gaps: **Nusa Dua** (one sensor adds an hourly number), and the rest of the island outside the south (no sensors in
Amed, Lovina or Nusa Penida; they aren't in the catalogue). Lombok and the Gilis have nothing yet.

### Sensor push: where one or two sensors would unlock a destination

Ranked by how many people go and how little it takes:

1. ~~**Pai** (TH)~~: done 30 Sep. The Thai feed reads community sensors now (21 live AirGradient sensors within 10 km).
2. **Bintan (Lagoi)** (ID): two sensors at the resorts. The closest Singapore weekend trip without data (BMKG Batam is 26 km
   away across the water).
3. **Nusa Dua** (ID) and **Labuan Bajo** (ID): **one** sensor each turns ISPU's 24-hr index into an hourly number (Nusa
   Dua also needs it while ISPU Sempidi is offline).
4. **Koh Samui / Phangan / Tao** (TH): a PCD station, or two community sensors each (the Thai feed reads them now).
5. **Genting / Cameron Highlands** (MY): two sensors each. DOE Batu Muda is 26.5 km from Genting, just past the limit, and a
   lowland station can't stand for a hilltop anyway. Cameron Highlands has a better route: MET Malaysia's own monitor.
6. **Lombok (Mataram, Senggigi, Gilis, Kuta)** (ID), **Boracay, El Nido, Siargao** (PH), **Hoi An, Nha Trang, Phu Quoc** (VN):
   two sensors each.
7. **Ho Chi Minh City** (VN): **one** more sensor within 10 km (one is 6 km out) makes it "Community sensors only".
8. **Vang Vieng** (LA): two sensors in town (the nearest is 11.5 km out).

---

## TODO: every uncovered or blocked city

Grouped by the action that unblocks them. "Needs proxy" cities also have the deploy step.

### 0. Engineering (ours)

- [ ] **Deploy `services/proxy` to Railway** (Singapore region, 1 replica, optional Redis). This turns on the 25
      "Needs proxy" cities. Set `NEA_API_KEY` if we have a data.gov.sg production key.
- [ ] **Android: bundle Let's Encrypt `YR1` + `Root YR` (X1 cross-sign) for `air4thai.pcd.go.th`** (or route TH through the
      proxy). Otherwise Thailand fails on Android only.
- [ ] Ask **AirGradient** for a stable, sanctioned endpoint and a courtesy rate for `map-data-int` (the MY, ID, PH, LA and
      VN crowd layer depends on it), and whether the Nafas-branded devices in Indonesia may be shown.

### 1. Permissions to ask for (data exists, redistribution not cleared)

| city / cities | action |
|---|---|
| All 9 Thai cities | **Email PCD for a licence** (Air Quality Data division): confirm redistribution of Air4Thai data in a free MIT app. The Envilink / data.go.th catalogue pages were geo-blocked from SG |
| KL, JB, Penang, Ipoh, Malacca, Kuching, Kota Kinabalu | **Ask DOE Malaysia (JAS) for written permission** to relay APIMS. The endpoint has no licence and a fixed CORS origin |
| Jakarta, Medan, Palembang, Jambi, Pekanbaru, Pontianak, Palangka Raya, Samarinda, Makassar, Batam | **BMKG permission** (Pusat Informasi Kualitas Udara): permission to use hourly PM2.5, ideally with an official JSON endpoint instead of the HTML scrape |
| All ID cities | **KLH (Direktorat Pengendalian Pencemaran Udara) permission** for the ISPU feed |
| Jakarta | **DLH DKI Jakarta**: written permission + access for `udara.jakarta.go.id` (~90 SPKU/LCS). ToS §6 forbids redistribution without it |
| Hanoi | **Hanoi Environment Technical Centre permission** for `moitruongthudo.vn` (no licence stated) |
| Ho Chi Minh City, Da Nang (and all non-Hanoi VN) | **CEM data agreement**: a station feed (hourly JSON) + written permission. `cem.gov.vn` is CAPTCHA-walled. Also get the verbatim VN_AQI Table 3 advice and the upper PM2.5 breakpoints |
| Ho Chi Minh City, Da Nang, Hanoi | **PAM Air partnership** (400+ devices claimed, partner-only API): a Worker-held key |
| Metro Manila | **Breathe Metro Manila / Clarity**: read key + data-sharing MoU (43 live Clarity nodes) |
| Metro Manila, Cebu, Davao | **DENR-EMB**: retry `air.emb.gov.ph` from a PH IP, then write to EMB-AQMS for a feed + permission. Also confirm the DAO 2020-14 averaging period |
| Vientiane, Luang Prabang | **UNICEF Laos / AirGradient courtesy agreement** (the school network), and how they want to be credited |
| Chiang Mai, Chiang Rai (density) | **CCDC DustBoy partnership** (CMU): 101 live sensors in Chiang Mai province, but public API keys are capped at 10 stations. Expanded access: `dustboy.3e@gmail.com` (coverage-hunt/th.md) |
| Cameron Highlands, Kuching | **MET Malaysia** (Jabatan Meteorologi): live access to its TEOM PM2.5 monitors (published only as week-old PDFs), and the Kuching station's fault |
| Balikpapan (and other Nafas devices) | **Nafas**: licence to show its AirGradient-hosted sensors. Two are within 8 km of Balikpapan |
| Bandung, Surabaya | **ITB and ITS**: data sharing for their campus sensors (listed on IQAir only) |
| Regional context (all) | **ASMC permission** (`ASMC_Enquiries@nea.gov.sg`) to show the alert level and hotspot counts. Until then: link only |

### 2. Wait for sensors / seed sensors (no official 1-hr, crowd too thin)

| city | today | action |
|---|---|---|
| Johor Bahru | 1 Sensor.Community sensor at 9.9 km (Iolite, ~2 days of history on 30 Sep), 1 AirGradient at 15 km | **Seed 2–3 AirGradient sensors in JB city** (DIY_SENSOR.md), so the hourly number doesn't rest on one sensor. Log Iolite for a week before a public launch |
| Penang, Ipoh, Malacca, Kuching, Kota Kinabalu | 0 sensors | Wait for sensors, or seed them (UKM/UMS school partnerships were suggested in malaysia.md). **Kuching first** (Sarawak had today's worst DOE readings) |
| Surabaya, Bandung, Balikpapan | no BMKG 1-hr station; readable sensors: 0 (university / Nafas sensors exist, see permissions) | Ask BMKG/KLH for a 1-hr concentration at these ISPU stations, or seed sensors |
| Makassar, Batam | 1-hr from BMKG, but no ISPU station within 60 km | Ask KLH whether a nearby ISPU station exists; the official 24-hr row stays empty until then |
| Cebu, Davao | 0 / 1 sensors | Wait for sensors (or EMB, above) |
| Phnom Penh | 2 sensors 14 km out, no government feed | One sensor within 10 km of the centre, or an MoE Cambodia feed (~59 sites reported in the press, none public). Siem Reap is covered since 30 Sep |
| Yangon, Mandalay | 1 suspect sensor | Not feasible. Tachileik can use Air4Thai 73t Mae Sai across the river (a Thai reading, labelled as such) |
| Bandar Seri Begawan | JASTRe PSI as a JPEG only; 0 sensors in BSB | **Email JASTRe** for the PSI methodology and a machine-readable feed (even a CSV). Seed sensors with UBD/UTB |
| Dili | nothing | Wait for sensors |
| Destinations (Bintan, Lombok, Samui, Genting, …) | see "Popular destinations" | Seed sensors per the ranked list there |

### 3. Product decisions still open (from the country docs)

- **MY:** keep the verdict on the DOE band while showing the crowd "now" number (implemented as REGIONAL option (a)), or
  add an attributed "by NEA's 1-hr guide" line. The current build uses (a) plus a "Nearby sensors read higher than the
  24-hour average" line.
- **LA / KH / MM:** no national scale. The current build shows the number + "N× the WHO daily guideline" and no chip or
  verdict (REGIONAL §3.3 rule 2). The alternative, borrowing Thailand's PCD bands for Laos, is not adopted.
- **Copy:** Thai verdict strings are drafts (need native review). MY/ID/VN/PH use the shared COPY.md matrix through the
  level-mapped band until `COPY.<cc>.md` files exist.
