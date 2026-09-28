# Southeast Asia: city coverage

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
| **Johor Bahru** | Needs proxy | DOE APIMS | Larkin 0.6 km | 2 | 0 / 1 (Eco Botanic, 15 km) | 24-hr only | DOE API |
| **Penang (George Town)** | Needs proxy | DOE APIMS | Minden 6.8 km | 4 | 0 / 0 | 24-hr only | DOE API |
| **Ipoh** | Needs proxy | DOE APIMS | Tasek 4.6 km | 2 | 0 / 0 | 24-hr only | DOE API |
| **Malacca** | Needs proxy | DOE APIMS | Bandaraya Melaka 0.8 km | 3 | 0 / 0 | 24-hr only | DOE API |
| **Kuching** | Needs proxy | DOE APIMS | Kuching 3.4 km | 2 | 0 / 0 | 24-hr only | DOE API |
| **Kota Kinabalu** | Needs proxy | DOE APIMS | Kota Kinabalu 11.4 km | 2 | 0 / 0 | 24-hr only | DOE API |
| **Jakarta** | Needs proxy | BMKG + KLH ISPU + AirGradient | BMKG Kemayoran 5.9 km (ISPU DKI1 2.9 km) | 1 BMKG + 12 ISPU | 1 / 2 | 1-hr | ISPU categories on the 1-hr value (BMKG practice) |
| **Surabaya** | Needs proxy | KLH ISPU | ISPU Mojokerto 35 km (no BMKG within 250 km) | 0 | 0 / 0 | 24-hr only | ISPU, from the index |
| **Bandung** | Needs proxy | KLH ISPU | ISPU Saguling 14.8 km (BMKG 120 km) | 1 ISPU | 0 / 0 | 24-hr only | ISPU, from the index |
| **Medan** | Needs proxy | BMKG + KLH ISPU | BMKG Medan 19.7 km (ISPU 5.9 km) | 1 + 2 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Palembang** | Needs proxy | BMKG + KLH ISPU + AirGradient | BMKG Musi 2 8.7 km (ISPU 3.2 km) | 2 + 1 | 11 / 11 | 1-hr | ISPU on the 1-hr value |
| **Jambi** | Needs proxy | BMKG + KLH ISPU | BMKG Kota Jambi 3.7 km | 2 + 2 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Pekanbaru** | Needs proxy | BMKG + KLH ISPU | BMKG Pekanbaru 5.0 km | 1 + 1 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Pontianak** | Needs proxy | BMKG + KLH ISPU | BMKG Kubu Raya 17.4 km (ISPU 2.3 km) | 1 + 2 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Palangka Raya** | Needs proxy | BMKG + KLH ISPU + SiPongi | BMKG Palangkaraya 3.7 km | 1 + 1 | 0 / 0 | 1-hr (166 µg/m³, Sangat Tidak Sehat, at verification) | ISPU on the 1-hr value |
| **Balikpapan** | Needs proxy | KLH ISPU | ISPU Balikpapan Baru 0.7 km (BMKG Samarinda 90 km) | 3 ISPU | 0 / 0 | 24-hr only | ISPU, from the index |
| **Samarinda** | Needs proxy | BMKG + KLH ISPU | BMKG Samarinda 2.2 km | 1 + 1 | 0 / 0 | 1-hr | ISPU on the 1-hr value |
| **Makassar** | Needs proxy | BMKG | BMKG Maros 22.6 km (nearest ISPU 366 km) | 1 | 0 / 0 | 1-hr (no official 24-hr row) | ISPU on the 1-hr value |
| **Denpasar** | Needs proxy | AirGradient + KLH ISPU | ISPU Badung Sempidi 8.3 km (no BMKG within 500 km) | 1 ISPU | 14 / 36 | 1-hr est. | ISPU on the 1-hr estimate |
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
| **Siem Reap** | Not feasible | AirGradient 1 | none | 0 | 1 / 1 | none | none |
| **Vientiane** | Needs proxy | AirGradient (UNICEF schools network) | none (MONRE site suspended) | 0 | 5 / 7 | 1-hr est. | none: number + WHO line, no chip |
| **Luang Prabang** | Needs proxy | AirGradient (UNICEF schools network) | none | 0 | 2 / 2 | 1-hr est. | none: number + WHO line |
| **Yangon** | Not feasible | AirGradient 1 (reads 0, suspect) | none | 0 | 1 / 1 | none | none |
| **Mandalay** | Not feasible | none | none | 0 | 0 / 0 | none | none |
| **Bandar Seri Begawan** | Not feasible | JASTRe PSI (JPEG image only) | none machine-readable | 0 | 0 / 0 (Belait sensor 85 km) | none | JASTRe PSI words, official row only |
| **Dili** | Not feasible | none | none | 0 | 0 / 0 | none | none |

**Totals (45 cities):** Live now (direct): **10** (Singapore + 9 Thai cities). Needs proxy (built, not deployed):
**25** (7 MY, 14 ID, Metro Manila, Hanoi, Vientiane, Luang Prabang). Of those, 1-hr official or estimate: 16. Needs
permission: **4** (Cebu, Davao, HCMC, Da Nang). Not feasible: **6** (Phnom Penh, Siem Reap, Yangon, Mandalay,
Bandar Seri Begawan, Dili).

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
| Chiang Mai, Chiang Rai (density) | **CCDC DustBoy partnership** (CMU): 101 live sensors in Chiang Mai province, but public API keys are capped at 10 stations |
| Regional context (all) | **ASMC permission** (`ASMC_Enquiries@nea.gov.sg`) to show the alert level and hotspot counts. Until then: link only |

### 2. Wait for sensors / seed sensors (no official 1-hr, crowd too thin)

| city | today | action |
|---|---|---|
| Johor Bahru | 1 sensor, 15 km out | **Seed 2–3 AirGradient sensors in JB city** (DIY_SENSOR.md). This is the highest-value MY city for SG commuters |
| Penang, Ipoh, Malacca, Kuching, Kota Kinabalu | 0 sensors | Wait for sensors, or seed them (UKM/UMS school partnerships were suggested in malaysia.md). **Kuching first** (Sarawak had today's worst DOE readings) |
| Surabaya, Bandung, Balikpapan | no BMKG 1-hr station, 0 sensors | Ask BMKG/KLH for a 1-hr concentration at these ISPU stations, or seed sensors |
| Makassar, Batam | 1-hr from BMKG, but no ISPU station within 60 km | Ask KLH whether a nearby ISPU station exists; the official 24-hr row stays empty until then |
| Cebu, Davao | 0 / 1 sensors | Wait for sensors (or EMB, above) |
| Phnom Penh, Siem Reap | 2 + 1 sensors, no government feed | Wait for sensors or an MoE Cambodia feed (~59 sites reported in the press, none public) |
| Yangon, Mandalay | 1 suspect sensor | Not feasible. Tachileik can use Air4Thai 73t Mae Sai across the river (a Thai reading, labelled as such) |
| Bandar Seri Begawan | JASTRe PSI as a JPEG only; 0 sensors in BSB | **Email JASTRe** for the PSI methodology and a machine-readable feed (even a CSV). Seed sensors with UBD/UTB |
| Dili | nothing | Wait for sensors |

### 3. Product decisions still open (from the country docs)

- **MY:** keep the verdict on the DOE band while showing the crowd "now" number (implemented as REGIONAL option (a)), or
  add an attributed "by NEA's 1-hr guide" line. The current build uses (a) plus a "Nearby sensors read higher than the
  24-hour average" line.
- **LA / KH / MM:** no national scale. The current build shows the number + "N× the WHO daily guideline" and no chip or
  verdict (REGIONAL §3.3 rule 2). The alternative, borrowing Thailand's PCD bands for Laos, is not adopted.
- **Copy:** Thai verdict strings are drafts (need native review). MY/ID/VN/PH use the shared COPY.md matrix through the
  level-mapped band until `COPY.<cc>.md` files exist.
