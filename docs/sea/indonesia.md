# Indonesia: air quality data for HazeNow

Research notes captured live on **2026-09-28, 17:11–18:18 SGT (16:11–17:18 WIB)**, during an active
fire and haze episode in South Sumatra and Central, South and East Kalimantan. SGT = WIB + 1 = WITA = WIT − 1.
Every `curl` below was actually run. Outputs are trimmed. "Unverified" means I could not confirm it with a live call today.

Related: [../DATA_SOURCES.md](../DATA_SOURCES.md) (Singapore baseline and evidence standard) · [malaysia.md](malaysia.md)

---

## TL;DR

- **Best authoritative "now" source: BMKG's hourly PM2.5 (23–25 stations), and 17 of them are on Sumatra or Kalimantan**
  (Palembang ×2, Jambi ×2, Pekanbaru, Palangkaraya, Sintang, Kubu Raya, Mempawah, Banjarbaru, Samarinda, Batam and others).
  These are true 1-hr concentrations: Musi 2 Palembang read 52.6 → 223.6 → 201.1 µg/m³ between 08:00 and 14:00 WIB.
  The catch is that **no public API exists**. The data sits only in the server-rendered HTML of `bmkg.go.id/kualitas-udara/pm25`,
  the JSON route behind it returns **401**, and BMKG's open-data portal does not cover air quality.
  Reading it means scraping HTML through a proxy.
- **KLH's ISPU feed (`ispu.kemenlh.go.id/apimobile/v1/getStations`) is the cleanest API in the region**: 117 stations, no key,
  CORS `*`, no rate limit seen, and each new hour goes live 30–90 s after the hour. But **it is a rolling 24-hr index**, the same lag
  problem as Singapore's PSI. Palembang's ISPU concentration was 94 µg/m³ while BMKG's 1-hr reading was 201.
  It is useful as the "official number" line, not as the "now" number. The old host `ispu.menlhk.go.id` now returns **NXDOMAIN**.
- **Best crowd source: AirGradient.** It has 12 EPA-corrected sensors in Palembang (150–270 µg/m³ at 17:18 SGT) and
  about 62 **Nafas**-operated monitors (Jabodetabek, Malang, Balikpapan, Semarang, Makassar, Bali) in the world API. There are
  **none in Riau, Jambi, or West, Central or South Kalimantan**. It has no CORS header. Nafas has no public API of its own.
- **Fire context: SiPongi's hotspot GeoJSON** (Ministry of Forestry, now `sipongi.gakkum.kehutanan.go.id`) needs no key and sends CORS `*`.
  It returned 9,029 hotspots in 24 h (296 high-confidence). Latency is about 2 h behind satellite overpass.
- **Index:** ISPU (P.14/2020). PM2.5 breakpoints of 15.5 / 55.4 / 150.4 / 250.4 µg/m³ apply to a **24-hr** average. BMKG already applies the **same
  breakpoints and ISPU category names to its 1-hr values**, and that gives us an official precedent for "1-hr PM2.5 + band".
- **Verdict: needs a proxy, so v2.** Ship Indonesia with a Worker that scrapes BMKG hourly and caches ISPU and SiPongi. Add AirGradient
  as the crowd layer. Get written permission from BMKG, and from DLH before touching Jakarta's data.

---

## Authoritative (government) sources

| source | agency | what (PM2.5 1-hr? index?) | stations (count verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS for redistribution in a free MIT app | reliability notes |
|---|---|---|---|---|---|---|---|---|---|
| **BMKG PM2.5** (`www.bmkg.go.id/kualitas-udara/pm25`) | BMKG (Meteorology, Climatology & Geophysics Agency) | **1-hr PM2.5 µg/m³** + ISPU category word (`KONDISI`). Instrument type is unverified | **23** at 17:13 SGT, **25** at 17:22 SGT (national). Sumatra: Musi 2 Palembang, Talang Betutu Palembang, Muaro Jambi, Kota Jambi, Pekanbaru, Batam, Bengkulu, Pesawaran, Medan. Kalimantan: Palangkaraya, Sintang, Kubu Raya, Mempawah, Banjarbaru, Samarinda, Kotabaru, Tanjung Harapan. Jakarta: Kemayoran | hourly. **`JAM N` appears at about (N+1):17 WIB** (JAM 16 went live between 17:17:08 and 17:18:08 WIB, polled every minute). Hour-label convention (start or end of hour) is **unverified** | **HTML only**: `__NUXT_DATA__` JSON inside `https://www.bmkg.go.id/kualitas-udara/pm25` (list) and `/kualitas-udara/pm25/<file>` (today's hourly series). The internal `/api/kualitas-udara/pm25` returns **401** | n/a (the internal API needs a server-set header) | HTML page: no ACAO, behind Cloudflare | No licence published for PM2.5. BMKG's open-data terms (weather/quake only) say "Wajib mencantumkan BMKG … sebagai sumber data". **Ask BMKG for permission** before scraping | Scraping the Nuxt payload is brittle (index-based array). The site was rebuilt and the old `/kualitas-udara/informasi-partikulat-pm25` now returns **404**. WAQI mirrors these stations (see crowd table) |
| **KLH ISPU** (`ispu.kemenlh.go.id`) | Kementerian Lingkungan Hidup / BPLH (was KLHK, split in 2024) | ISPU per pollutant. `a_pm25` = PM2.5 concentration µg/m³, **24-hr rolling average** (see §Evidence 1). `t_pm25` = ISPU sub-index. `val` = overall ISPU | **117** listed (93 KLH/BPLH + 24 "INTEGRASI" regional/partner). 109 had a non-zero `a_pm25`. Fire belt: Riau 8, Jambi 4, Sumsel 7, Kalbar 6, Kalteng 6, Kalsel 5, Kaltim 11, Kaltara 1. DKI Jakarta 7 | hourly. **New hour served 30–90 s after the hour**: "17:00 WIB" rows went from 2 → 21 at 17:00:34 WIB and → 86 at 17:01:34 WIB (polled every minute from 16:13 to 17:13 WIB). DKI "INTEGRASI" rows lag by 1 h | `GET https://ispu.kemenlh.go.id/apimobile/v1/getStations` (all, latest). `GET …/apimobile/v1/getDetail/stasiun/<id_stasiun>` (last 24 h of ISPU per pollutant) | **no** | **`*`** (GET and preflight) | **None published** (no terms page found on the site). Government public information. **Unverified**: ask KLH before redistributing | Undocumented mobile API (used by the ISPUnet app and the website). 10 back-to-back calls all returned 200 in about 0.3 s. Not gzipped (138 KB). The old `ispu.menlhk.go.id` gives NXDOMAIN, so pin the host in config |
| **DKI Jakarta DLH** (`udara.jakarta.go.id`) | Dinas Lingkungan Hidup DKI Jakarta | ISPU + "PM 2.5 µg/m³" per SPKU (reference stations and LCS). The label/value pairing looked inconsistent today (see Evidence 3) | about **90** station IDs (`DKI01`…`DKI105`) in the homepage HTML. The 5 reference DKI1–DKI5 also appear in KLH ISPU | "Terakhir Diperbarui: 15.30 WIB" at 16:16 WIB | `/api/spku/nearest?lat=&lng=` needs an `X-Defense-Token` cookie **and** passes an F5 WAF check. From curl, the WAF returned "URL YANG DIMINTA DI TOLAK" even with the token | cookie token | not applicable (blocked) | **ToS §6: personal non-commercial use only. Reproduction or distribution needs written permission.** Data requests go through PPID | Not usable without an agreement. DKI1–DKI5 ISPU are available through KLH anyway |
| **SiPongi hotspots** (`sipongi.gakkum.kehutanan.go.id`) | Kementerian Kehutanan (Gakkum) | satellite hotspots (NASA MODIS, SNPP, NOAA-20, or LAPAN/BRIN copies), confidence level | 9,029 hotspots in 24 h (296 high). Kaltim 859, Kalsel 545, Kalteng 484, Sumsel 244, Jambi 78, Kaltara 52, Riau 10, Kalbar 3 | newest detection 07:22 UTC (15:22 SGT) at 17:18 SGT, so about 2 h | `GET https://opsroom-sipongi.gakkum.kehutanan.go.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&late=24&satelit[]=…&confidence[]=…` (GeoJSON). Mirror: `opsroom.sipongidata.my.id` | no | **`*`** | none published. **Unverified**. Raw NASA FIRMS data is public domain, and SiPongi adds admin-area tags | Old hosts `sipongi.menlhk.go.id` and `sipongi.kemenlh.go.id` give **NXDOMAIN**. Its `/api/aqms` layer re-serves the KLH ISPU list (117 features) |
| US Embassy Jakarta (AirNow) | US Dept of State | 1-hr PM2.5 | 2 listed as "Active" (Jakarta Central, Jakarta South) in `Monitoring_Site_Locations_V2.dat` | **no rows** for either site in `HourlyData_2026092805…08.dat` | `files.airnowtech.org/airnow/YYYY/YYYYMMDD/HourlyData_YYYYMMDDHH.dat` | no | not checked | US public domain | **Unverified / not reporting today** |

### Evidence

**1. KLH ISPU: shape, freshness, and why it's a 24-hr number**

```bash
# 17:11:54 SGT
$ curl -s -i -H "Origin: https://example.com" https://ispu.kemenlh.go.id/apimobile/v1/getStations
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Content-Type: application/json; charset=UTF-8
{"rows":[ … 117 rows … ],"status":{…},"total":117}
```

One row, trimmed:

```json
{"id_stasiun":"PALEMBANG","waktu":"2026-09-28 16:00:00","lat":"-2.98039","lon":"104.74700",
 "a_pm25":"94.01","t_pm25":"142","c_pm25":"3","val":"141","param":"PM<sub>2.5</sub>","cat":"TIDAK SEHAT",
 "kategori":{"nilai_uid":"3","nilai":"TIDAK SEHAT","color":"#cccc00", "keterangan":"Tingkat kualitas udara yang bersifat merugikan …"},
 "nama":"Palembang Bukit Kecil","provinsi":"Sumatera Selatan","time_z":"WIB","time_offset":"0",
 "is_maintenance":"0","tipe":"0","tipe_text":"KLH/BPLH"}
```

`waktu` distribution at 17:11 SGT: `16:00 WIB` ×87, `16:00 WITA` ×11 (= 15:00 WIB), `17:00 WITA` ×7, `18:00 WIT` ×4, `16:00 WIT` ×1, `15:00 WIB` ×5 (the DKI "INTEGRASI" stations),
and `17:00 WIB` ×2. **The two "17:00 WIB" rows (Balikpapan Sepinggan, Kutai Barat) are East Kalimantan stations, which are really WITA but tagged WIB.**
So `waktu` is local wall time and `time_z` cannot always be trusted. Convert to UTC with the province's zone, and treat any `waktu` later than now as mis-tagged.

**`a_pm25` is a 24-hr average concentration, not 1-hr.** The detail endpoint returns the last 24 hours of the PM2.5 ISPU:

```bash
$ curl -s https://ispu.kemenlh.go.id/apimobile/v1/getDetail/stasiun/PALEMBANG
waktu_24    27-09 17:00 … 28-09 16:00 (24 hourly stamps)
pm25_24_rev 269 267 259 249 245 240 232 219 216 205 192 188 184 172 158 151 151 150 148 143 139 139 140 141
a_pm25 94.01  t_pm25 142
```

The series is monotonic and smooth, with steps of ≤13 index points an hour. That is what a 24-hr rolling mean looks like. The 1-hr series is jumpy, as BMKG's 1-hr series for Palembang shows over the same
morning (52.6 → 74.4 → 81 → 94.6 → 77.4 → **223.6** → 201.1). P.14/2020's conversion table is defined for "PM2.5 … pengukuran 24 jam"
(the regulation's table header, confirmed via peraturan.bpk.go.id / jdih). Plugging `a_pm25` into the P.14/2020 breakpoints reproduces `t_pm25`
within ±1 (94.01 → 141.6 → 142. 42.14 → 83.7 → 84. 19.71 → 56 → 56), so `a_pm25` is the concentration that feeds the 24-hr ISPU.
The KLH portal says "Hasil perhitungan ISPU parameter PM2.5 disampaikan kepada publik tiap jam selama 24 jam", which means it is published hourly and averaged over 24 h.
**You cannot recover the 1-hr value from it.** Differencing consecutive 24-hr means only gives you C(t) − C(t−24).

Other gotchas seen today:
- **"INTEGRASI" stations (tipe 1, e.g. DKI1–DKI5) send `a_pm25: "0"` with a real `t_pm25`**, so there is an index but no concentration. Treat `0` as missing.
  8 of 117 rows had `a_pm25` of 0 or null.
- `val`/`cat`/`param` describe the **dominant pollutant**, not always PM2.5 (for example Muaro Jambi `param` = O₃, `val` = 5 while `t_pm25` = 233).
  Always read `a_pm25`/`t_pm25` explicitly.
- Absurd `t_pm10` values (Pontianak 809, Tabalong 1915) show the sub-index is **not capped at 500**.
- Numbers are strings. `lat`/`lon` are strings.

New-hour poll (every 60 s, 17:13–18:13 SGT, summarised):

```
17:59:34 SGT  {'16:00WIB': 87, '17:00WIB': 2, ...}  PALEMBANG ('16:00','94.01','142')  PEKANBARU ('16:00','42.14','84')
18:00:34 SGT  {'16:00WIB': 69, '17:00WIB': 21, ...}
18:01:34 SGT  {'16:00WIB': 6, '17:00WIB': 86, ...}  PALEMBANG ('17:00','94.27','142')  PEKANBARU ('17:00','46.37','89')  DKI1 ('16:00','0','113')
```

Palembang's `a_pm25` moved only 94.01 → 94.27 in that hour, while BMKG's 1-hr Palembang value moved 170.3 → 109.6. That is more evidence that `a_pm25` is a 24-hr mean.
The value stamped "17:00" is live at 17:00:34, so the stamp marks the end of the averaging window (the average up to that time).

Rate limit: `for i in 1..10: curl getStations` returned `200` ten times at 0.25–0.34 s each. The response is not compressed (138 KB).

**2. BMKG hourly PM2.5 (HTML-embedded)**

```bash
# 17:13 SGT
$ curl -s -A "Mozilla/5.0 …" https://www.bmkg.go.id/kualitas-udara/pm25 | extract __NUXT_DATA__
{"nama_file":"pm25_plb4.xml","LOKASI":"Musi 2 Palembang","JAM":14,"PM25":201.1,"KONDISI":"Sangat Tidak Sehat","LAT":"-3.03100","LON":"104.72000"}
{"nama_file":"pm25_pl3.xml","LOKASI":"Talang Betutu Palembang","JAM":14,"PM25":186.5,"KONDISI":"Sangat Tidak Sehat",…}
{"nama_file":"pm25_pr2.xml","LOKASI":"Palangkaraya","JAM":14,"PM25":163.2,"KONDISI":"Sangat Tidak Sehat",…}
{"nama_file":"pm25_jm4.xml","LOKASI":"Muaro Jambi","JAM":14,"PM25":133.7,"KONDISI":"Tidak Sehat",…}
{"nama_file":"pm25_btm2.xml","LOKASI":"Batam","JAM":14,"PM25":101.7,"KONDISI":"Tidak Sehat",…}
{"nama_file":"pm25_pk2.xml","LOKASI":"Pekanbaru","JAM":14,"PM25":82.9,"KONDISI":"Tidak Sehat",…}
{"nama_file":"pm25_sm2.xml","LOKASI":"Samarinda","JAM":14,"PM25":52.4,"KONDISI":"Sedang",…}
{"nama_file":"pm25_kmy3.xml","LOKASI":"Kemayoran","JAM":14,"PM25":24.8,"KONDISI":"Sedang",…}
{"nama_file":"pm25_mdn2.xml","LOKASI":"Medan","JAM":14,"PM25":12.2,"KONDISI":"Baik",…}   # 23 rows total

$ curl -s https://www.bmkg.go.id/kualitas-udara/pm25/pm25_plb4 | extract __NUXT_DATA__
{"nama_file":"pm25_plb4.xml","lokasi":"Musi 2 Palembang","tanggal":"28-09-2026",
 "data":[{"JAM":0,"PM25":66.7},{"JAM":1,"PM25":83.4}, … ,{"JAM":12,"PM25":77.4},{"JAM":13,"PM25":223.6},{"JAM":14,"PM25":201.1}]}

$ curl -s -i https://www.bmkg.go.id/api/kualitas-udara/pm25
HTTP/2 401   {"status":401,"text":"Unauthorized"}
```

- **`JAM` is WIB.** At 09:13 UTC the latest was `JAM 14`, which cannot be UTC. WAQI's copy of the same stations carried `utime 2026-09-28T15:00:00+08:00` = 14:00 WIB.
  `KONDISI` follows the ISPU concentration breakpoints applied to the 1-hr value: 56.7 → Tidak Sehat, 52.4 → Sedang, 163.2 → Sangat Tidak Sehat, 13.4 → Baik.
- Poll of `/kualitas-udara/pm25/pm25_plb4` every 3 minutes (the full log is in the "cadence" line below):
  `17:22:35 SGT n=25 JAM=[15] {Musi 2 Palembang 170.3, Palangkaraya 168.8, Pekanbaru 97.9, Kemayoran 40.3}`
  `17:25 … 18:17:08 SGT  JAM=[15]` (unchanged over 19 polls)
  `18:18:08 SGT n=25 JAM=[16] {Musi 2 Palembang 109.6, Pekanbaru 85.3}`, `cf-cache-status: MISS` on every poll.
  **Hour `JAM N` goes live at about (N+1):17 WIB**: JAM 15 between 16:13 and 16:22 WIB, JAM 16 between 17:17:08 and 17:18:08 WIB.
  If `JAM 16` is the 16:00–17:00 average, the latency is about 17 min after the hour closes. If it is hour-ending, the latency is about 1 h 17 min. **Which convention applies is unverified.**
  In either case, BMKG is the freshest authoritative 1-hr value in Indonesia.
- `data.bmkg.go.id` (the open-data portal) offers only weather forecasts, earthquakes and nowcast warnings. Its terms: attribution required, 60 req/min/IP. **No air quality.**

**3. DKI Jakarta (udara.jakarta.go.id)**

```bash
# 17:16 SGT
$ curl -s "https://udara.jakarta.go.id/api/spku/nearest?lat=-6.19&lng=106.82"
<h2>⚠ URL YANG DIMINTA DI TOLAK ⚠</h2> … Support ID Anda : 1363444668742974328     # F5 WAF, HTTP 200 HTML
# same result with the X-Defense-Token cookie + header from a fresh homepage visit
```

The homepage HTML (server-rendered) showed "DKI1 Bundaran HI · Terakhir Diperbarui: Senin, 28 September 2026 15.30 WIB · **114 ISPU · PM 2.5 : 41.15 µg/m³**".
The two figures come from different averaging periods (ISPU 114 implies a 24-hr mean of about 70 µg/m³), and the "worst today" card printed "135 ISPU · PM 2.5 | 135 µg/m³".
So the unit labelling on this site cannot be trusted. It had about 90 `DKI…` station IDs. ToS (`/ketentuan-layanan`, updated 19 Apr 2026): "Penggunaan komersial, reproduksi,
distribusi, atau pembuatan karya turunan memerlukan izin tertulis dari kami."

**4. SiPongi (Ministry of Forestry) hotspots**

```bash
# 17:18:03 SGT
$ curl -s -D - -H "Origin: https://example.com" --compressed -G \
  "https://opsroom-sipongi.gakkum.kehutanan.go.id/api/opsroom/indoHotspot" \
  --data-urlencode wilayah=IN --data-urlencode filterperiode=false --data-urlencode late=24 \
  --data-urlencode "satelit[]=NASA-MODIS" --data-urlencode "satelit[]=NASA-SNPP" --data-urlencode "satelit[]=NASA-NOAA20" \
  --data-urlencode "confidence[]=high" --data-urlencode "confidence[]=medium" --data-urlencode "confidence[]=low"
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[127.44083,-1.46343]},
 "properties":{"date_hotspot_ori":"2026-09-28T07:20:00.000000Z","sumber":"NASA-MODIS","confidence":0,"confidence_level":"low",
 "desa":"Kawasi","kecamatan":"Obi","kabkota":"Halmahera Selatan","nama_provinsi":"Maluku Utara", …}}, … 9,029 features]}
```

- Newest `date_hotspot_ori` was 07:22 UTC at 09:18 UTC. `confidence_level=high` only gave **308** features in a second call.
- `sipongi.menlhk.go.id`, `sipongi.kemenlh.go.id`, `sipongi.kemenhut.go.id`: NXDOMAIN at 8.8.8.8 and 1.1.1.1. `ispu.menlhk.go.id`: NXDOMAIN.
  The ISPU web bundle still references `sipongi.menlhk.go.id/api/gfs`. Expect more host churn after the 2024 ministry split.

**5. Model check (why not Open-Meteo/CAMS)**

At 16:00 WIB, Open-Meteo `current.pm2_5` gave Palembang **204**, Palangkaraya **724.6**, Pekanbaru 54.1 and Jakarta 44.0.
BMKG measured Palangkaraya **163–169** over the same hours, so near active fires the model is off by about 4× the other way from Singapore's under-read.
Models are not a "now" source here either.

---

## Crowd / low-cost sensor networks

| source | sensor type | what | stations (count verified today) | coverage by city (fire belt in bold) | cadence & latency | API/endpoint | key? | CORS | licence / ToS | correction needed | reliability notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **AirGradient** map API | PMS5003T ×2 (Open Air) | EPA-corrected PM2.5 | **55** in Indonesia (map API, Indonesia bbox minus MY/SG/BN/TL): 50 AirGradient, 3 Sensor.Community, 0 Reference | **Palembang 12** (kelurahan and Muhammadiyah school network) + 1 S.C. · Jakarta/Depok 2 · Bali 38 · Malang 1 · Banyuwangi 2 S.C. · **Riau, Jambi, all Kalimantan: 0** | ~1 min. Most `measuredAt` within 1 min of the call | `map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=&ymin=&xmax=&ymax=&zoom=&measure=pm25` | no | **none** | CC BY-SA 4.0 (AirGradient). Attribute contributors | already corrected (EPA) on this API | **Nafas-contributed monitors are missing from the map API** (0 in the Balikpapan bbox, 2 vs 9 in Jakarta) |
| **AirGradient** world API | same | raw `pm02`, `rhum`, `publicContributorName` | **97** in Indonesia (all fresh < 60 min). **62 have contributor "Nafas"** | Jabodetabek 9 (8 Nafas) · Malang 44 (Nafas) · **Balikpapan 2 (Nafas)** · Semarang 1 · Makassar 1 · Banyuwangi 1 · Bali 37 · **Palembang: not listed here** | ~1 min | `api.airgradient.com/public/api/v1/world/locations/measures/current` | no | **none** | CC BY-SA 4.0 for AirGradient. **Nafas devices: licence unverified** (their absence from the map API suggests a different sharing arrangement) | yes. Apply EPA correction with `rhum` | Palembang's school network is in the map API but not this list, so merge both by `locationId` |
| **Nafas** (own network) | Nafas-branded / AirGradient O-1PS/O-1PST | app plus monthly "Nafas Buka Data" reports | 62 visible via AirGradient (above). Nafas claims 160–200+ | Jabodetabek, Malang, Balikpapan, Bali, Semarang | ~1 min (via AirGradient) | **no public API found** (`api.nafas.co.id` doesn't resolve; `nafas.co.id` redirects to `nafas.com`, which is now an indoor-air subscription business) | n/a | n/a | Nafas T&C (not reviewed in depth). **Ask Nafas** | yes | Also on WAQI ("Nafas" network), which forbids redistribution |
| WAQI / aqicn | re-published BMKG (US AQI) + crowd | US AQI, not µg/m³ | 21 Indonesian points at zoom 5 (all BMKG sites, e.g. "Musi 2 Palembang" AQI 251) | national | BMKG copy stamped 15:00+08 (= JAM 14 WIB) at 17:21 SGT | `mapq.waqi.info/mapq2/bounds` (internal), `api.waqi.info` (token. `demo` returns Shanghai) | yes | `*` | Terms forbid redistribution/caching | n/a | **Don't use.** But it confirms the BMKG timing |
| PurpleAir | PMS5003 ×2 | `pm2.5_cf_1` | **unverified** (HTTP 403 `ApiKeyMissingError`) | unknown | 2 min | `api.purpleair.com/v1/sensors` | yes | `*` | paid points | yes | Same as SG: Worker only, if ever |
| IQAir / AirVisual | mixed | US AQI | **unverified** (`incorrect_api_key`) | city level | hourly | `api.airvisual.com/v2/nearest_city` | yes | ? | no redistribution | n/a | **Don't use** |
| OpenAQ v3 | aggregator | varies | **unverified** (HTTP 401) | — | lagged | `api.openaq.org/v3/locations?iso=ID` | yes | yes | per provider | varies | Redundant with AirGradient direct |
| Sensor.Community | SDS011/PMS | P2 | **1** near Palembang (50 km). **0** within 30–100 km of Jakarta, Bandung, Surabaya, Bali, Pekanbaru, Jambi, Pontianak, Palangkaraya, Banjarmasin | Palembang 1 (+2 Banyuwangi via AG map) | 2.5 min | `data.sensor.community/airrohr/v1/filter/area=lat,lon,km` | no | `*` | ODbL | yes | Negligible |
| Bicara Udara | — | advocacy (WordPress site) | **0 sensors / no data feed** | — | — | none | — | — | — | — | Campaign org, not a data source |
| Udara Kita | — | — | **unverified**: `udarakita.id` does not resolve | — | — | — | — | — | — | — | — |
| Clean Air Catalyst / WRI Indonesia | reference + LCS supplied **to DLH Jakarta** | — | no separate public feed found. `cleanaircatalyst.org` root 404, `wri-indonesia.org` 403 to curl | Jakarta | — | none | — | — | — | — | Their instruments feed DLH's network, so this reduces to udara.jakarta.go.id (blocked, ToS) |

### Evidence

```bash
# 17:18:59 SGT world dump (2,844 locations), filtered to an Indonesia polygon
$ curl -s https://api.airgradient.com/public/api/v1/world/locations/measures/current
Jakarta | Pakubuwono 3 - Nafas     -6.237 106.786 pm02 60.2 rh 52 09:18Z O-1PS  Nafas
Jakarta | BMKG 1                   -6.156 106.842 pm02 45.5 rh 42 09:18Z O-1PST Nafas   # co-located with BMKG Kemayoran (1-hr 40.3 @ JAM 15)
Kalimantan | Gunung Sari Ilir - Nafas -1.267 116.837 pm02 35.7 rh 58 09:18Z O-1PS  Nafas   # Balikpapan
Kalimantan | Karang Joang - Nafas     -1.186 116.895 pm02 12.0 rh 54 09:18Z O-1PS  Nafas
Java    | Malang 018               -8.247 112.541 pm02 360.8 …                       # outlier. Sibling sensors read 25–50
# note: the `timezone` field is unreliable (Qatar/Dubai/Bangkok sensors tagged Asia/Jakarta), so filter by coordinates

# 17:19:19 SGT map API (EPA-corrected), Indonesia bbox. No Access-Control-Allow-Origin in the response
$ curl -s -i -H "Origin: https://example.com" "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=94.5&ymin=-11.2&xmax=141.2&ymax=6.2&zoom=12&measure=pm25"
{"data":[ …79 incl. MY/SG… ],"total":79}
 -2.944 104.709 Kelurahan Karya Baru          175.2  09:18Z AirGradient
 -2.923 104.713 SD Muhammadiyah 18 Palembang  160.2  09:18Z AirGradient
 -2.989 104.749 SD Muhammadiyah 1 Palembang   218.8  09:19Z AirGradient
 -3.005 104.78  Kelurahan Silaberanti         220.1  09:18Z AirGradient
 -3.013 104.821 Kelurahan Talang Putri        270    09:18Z AirGradient
 -2.957 104.708 Palembang                     155.64 09:12Z SensorCommunity
 … 12 AirGradient in Palembang, range 151.9–270, median ≈ 175
```

**Cross-check, Palembang, around 16:00 WIB:** AirGradient corrected 152–270 (median about 175) · BMKG 1-hr Musi 2 201.1 (JAM 14), 170.3 (JAM 15), Talang Betutu 186.5 ·
KLH 24-hr `a_pm25` 94.0 (ISPU 142). The crowd network agrees with BMKG's 1-hr values, and both sit about 2× above the official 24-hr figure. **This is the Singapore lag story again, at a larger scale.**

The same "per-region bbox" query returned **0** AirGradient sensors for Pekanbaru, Balikpapan and all of Kalimantan (108.5–119.3 E, −4.3–1.0 N) at zoom 5, 12 and 16.

---

## National index & bands

**ISPU, Indeks Standar Pencemar Udara**, Permen LHK **P.14/MENLHK/SETJEN/KUM.1/7/2020**.
Parameters: PM10, PM2.5, CO, NO₂, SO₂, O₃, HC. **PM2.5 is published hourly around the clock. The others are published at least at 09:00 and 15:00** (KLH PPMU portal).

**Averaging: 24 hours for PM2.5.** This has the same lag problem as Singapore's 24-hr PSI, and today it was worse: Palembang's 24-hr ISPU was still falling (269 → 141)
when BMKG's 1-hr reading jumped from 77 to 224 within one hour.

| ISPU | category (Bahasa) | English gloss | PM2.5 24-hr µg/m³ | color (from live API `kategori.color`) |
|---|---|---|---|---|
| 0–50 | **Baik** | Good | 0 – 15.5 | `#00cc00` green |
| 51–100 | **Sedang** | Moderate | 15.6 – 55.4 | `#0000cc` **blue** |
| 101–200 | **Tidak Sehat** | Unhealthy | 55.5 – 150.4 | `#cccc00` yellow |
| 201–300 | **Sangat Tidak Sehat** | Very Unhealthy | 150.5 – 250.4 | `#cc0000` red |
| >300 | **Berbahaya** | Hazardous | > 250.4 | `#000000` black |

Sources: live `getStations` `kategori` objects. The P.14/2020 conversion table (peraturan.bpk.go.id/Details/163466; jdih P_14_2020_ISPU). The Jakarta FAQ uses the same ranges.
Note that "Sedang" is **blue**, not yellow. Reusing Singapore's amber for the second band would clash with every Indonesian map.

**Official health advice** (ISPU website bundle, verbatim, shown in the station popup):

- **Baik:** "Sangat baik melakukan kegiatan di luar."
- **Sedang:** Kelompok sensitif: "Kurangi aktivitas fisik yang terlalu lama atau berat." Setiap orang: "Masih dapat beraktivitas di luar."
- **Tidak Sehat:** Penderita asma: "Harus mengikuti petunjuk kesehatan untuk asma dan menyimpan obat asma." Penderita penyakit jantung: "Gejala seperti palpitasi/jantung berdetak lebih cepat, sesak nafas, atau kelelahan yang tidak biasa mungkin mengindikasikan masalah serius." Setiap orang: "Mengurangi aktivitas fisik yang terlalu lama di luar ruangan."
- **Sangat Tidak Sehat:** Kelompok sensitif: "Hindari semua aktivitas di luar. Perbanyak aktivitas di dalam ruangan atau lakukan penjadwalan ulang pada waktu dengan kualitas udara yang baik." Setiap orang: "Hindari aktivitas fisik yang terlalu lama di luar ruangan, pertimbangkan untuk melakukan aktivitas di dalam ruangan."
- **Berbahaya:** Kelompok sensitif: "Tetap di dalam ruangan dan hanya melakukan sedikit aktivitas." Setiap orang: "Hindari semua aktivitas di luar."

**Mapping to HazeNow's "1-hr PM2.5 + band + verdict" model without contradicting the authority**

- Unlike NEA (whose 1-hr bands are 0–55/56–150/151–250/≥251), **KLH has no separate 1-hr PM2.5 band scale**. But **BMKG, a national authority,
  already labels its hourly PM2.5 with the ISPU category names using the 24-hr breakpoints** (verified above: 56.7 → Tidak Sehat, 52.4 → Sedang).
  So for Indonesia: **band = ISPU category of the 1-hr concentration, attributed as "BMKG hourly PM2.5, ISPU category"**. This keeps five bands, the
  official names and the official colors, and it matches what BMKG itself shows. The first cut-off is much lower than NEA's (15.5 vs 55), so Indonesia will show
  "Sedang" most of the time. Keep verdict copy calm for Sedang.
- Five bands vs HazeNow's four: map Baik → normal. Sedang → normal (general) / elevated-lite (sensitive, per KLH's own Sedang advice). Tidak Sehat → elevated.
  Sangat Tidak Sehat → high. Berbahaya → very_high. The `band` enum needs an Indonesian 5-value variant, or a `nationalBand` field next to the shared 4-value one.
  **Unverified with any Indonesian authority. Treat this as a design proposal.**
- Show the **official ISPU (KLH, 24-hr)** as the secondary "official" line, in the same way we show NEA's 24-hr PSI, with the neutral explainer
  ("ISPU averages the last 24 hours; this is the last hour."). Never call ISPU "lagging" or "wrong".
- Do **not** convert 1-hr PM2.5 into an "instant ISPU" number. This is the same reasoning as SPEC v1.2 §1.

---

## Language / localisation

- **Bahasa Indonesia** is the only official language, and all government sources publish in it. English is secondary for expats (Jakarta, Bali, Batam).
  Ship `id` as the default for Indonesian locations and keep `en` available.
- Use the official category words verbatim (**Baik, Sedang, Tidak Sehat, Sangat Tidak Sehat, Berbahaya**). "Berbahaya" means "dangerous".
  COPY.md bans "danger/hazardous" except when quoting the national descriptor, and here it **is** the national descriptor, so quote it as the band name only and keep headlines calm.
- Official group words: **"Kelompok sensitif"**, **"Setiap orang"**, "Penderita asma", "Penderita penyakit jantung". Jakarta's site also uses "Ibu Hamil", "Anak", "Lansia",
  which map to HazeNow's pregnant/kids/elderly profiles.
- Haze framing: Indonesians call it **"kabut asap"** and fires **"karhutla"** (kebakaran hutan dan lahan). Fire context is sensitive and politically charged.
  State hotspot facts only ("SiPongi: 244 titik panas di Sumatera Selatan dalam 24 jam"), with no blame. The same tone rule applies as "never criticise NEA".
- Masks: Jakarta's official advice explicitly recommends **N95/KN95** at Tidak Sehat and above. That is stronger than MOH Singapore, so align Indonesian copy to it and keep the children caveat.
- Times: WIB/WITA/WIT. Always show the local zone suffix ("pukul 16.00 WIB"). Indonesians use a **dot** in times.

---

## Integration recipe

**Sources in priority order for a location in Indonesia:**

1. **BMKG 1-hr PM2.5** (primary "now"). Worker fetch of `https://www.bmkg.go.id/kualitas-udara/pm25` → parse `<script id="__NUXT_DATA__">` → de-reference the
   devalue-style index array → rows with keys `nama_file, LOKASI, JAM, PM25, KONDISI, LAT, LON`. For today's history, fetch `/kualitas-udara/pm25/<nama_file minus .xml>`
   and read the object with `tanggal` + `data[{JAM, PM25}]`. Send a full browser User-Agent. With `-A "Mozilla/5.0"` alone, `/kualitas-udara/…` returned **403** (39 bytes, Cloudflare). A full Chrome UA string returned 200.
2. **AirGradient** (crowd "now", and the only dense source in Palembang/Jabodetabek). Map API for EPA-corrected values, plus the world API for Nafas devices
   (apply the EPA correction yourself). Both need the Worker because there is no CORS.
3. **KLH ISPU** (official 24-hr line + fallback when BMKG is down). Direct from clients is possible (CORS `*`), but route it through the Worker too, to pin the host.
4. **SiPongi hotspots** (context layer: "N hotspots within 100 km in 24 h"). CORS `*`. Cache 30 min.

**Snapshot mapping**

| Snapshot field | Indonesia source |
|---|---|
| `pm25` | IDW over BMKG stations (valid rows, `PM25` > 0) + EPA-corrected AirGradient, weighted lower. Crowd only when no BMKG station is within 25 km |
| `band` | ISPU category of the 1-hr `pm25` (15.5/55.4/150.4/250.4). Keep `nationalBand` = Bahasa label |
| `officialPsi24h` → rename or alias `official24h` | KLH `t_pm25` of the nearest station (index), plus `a_pm25` (µg/m³) for the chart line |
| `history` | BMKG detail `data[]` (today, WIB hours) for the bars. KLH `getDetail` `pm25_24_rev` for the 24-hr line (index units. Convert to µg/m³ by inverting P.14 or read `a_pm25` hourly from our own cache) |
| `regions` | stations (BMKG `nama_file` / KLH `id_stasiun`), not 5 regions |
| `observedAt` | BMKG `tanggal` + `JAM` in **WIB** (UTC+7). KLH `waktu` in the station's **province** zone |
| `publishedAt` | first time the Worker saw the new `JAM` (no publish stamp exists in either feed) |
| `source` | "BMKG" / "KLH ISPU" / "AirGradient contributors (CC BY-SA)" |

**Polling:** BMKG every 1 min from :12 to :30 past the hour until a new `JAM` appears, then idle. KLH every 1 min from :00:30 until the new hour appears (stop at :10), and once more at :45 for late "INTEGRASI" rows.
AirGradient every 5 min. SiPongi every 30 min. Don't exceed 1 req/min per upstream from the Worker. Clients hit only the Worker.

**Gotchas**
- Three time zones. KLH `waktu` is local wall time and **`time_z` is sometimes wrong** (East Kalimantan rows tagged WIB). Reject any timestamp in the future.
- KLH `a_pm25` = `"0"` for INTEGRASI stations means **missing**, not clean air. `val`/`cat` can be driven by O₃/SO₂/NO₂.
- KLH values are strings. Coordinates are strings with float noise.
- BMKG's station set changes hour to hour (23 → 25 rows), so key by `nama_file`. The Nuxt payload is positional and will break on any front-end deploy, so add a schema check and alert.
- Host churn: `ispu.menlhk.go.id`, `sipongi.menlhk.go.id` and `sipongi.kemenlh.go.id` are all dead (NXDOMAIN). Keep hosts in remote config.
- AirGradient `timezone` is unreliable. Use coordinates. Drop single-sensor outliers (Malang 018 read 360 vs neighbours 25–50).
- Dry-season haze peaks Aug–Oct. Fire-belt coverage is thin: **Riau has 8 KLH (24-hr) stations but only 1 BMKG 1-hr station (Pekanbaru) and 0 crowd sensors.**
  West Kalimantan has BMKG Sintang/Kubu Raya/Mempawah only. Expect ranges, not points, and use the SPEC's ">5 km → show range" rule aggressively.

---

## Verdict

**v2, behind the Worker proxy. Not v1.x.**

- There is no public, documented, CORS-enabled **1-hr** PM2.5 feed. The only authoritative 1-hr data (BMKG) is inside HTML with no stated licence, so it needs a
  server-side scraper and **written permission from BMKG** before we redistribute it.
- The clean, open API (KLH ISPU) only carries the **24-hr** number. Shipping that alone would recreate the problem HazeNow exists to solve.
- The crowd layer is excellent in Palembang and Greater Jakarta and absent in Riau, Jambi and Kalimantan, which is where the smoke starts.
- Jakarta's own network (about 90 SPKU/LCS) is WAF-blocked and its ToS forbid redistribution without written permission.

**Suggested path:** (1) Email BMKG (Pusat Informasi Kualitas Udara) and KLH (Direktorat Pengendalian Pencemaran Udara) for a
data-sharing OK or an official 1-hr endpoint. (2) Build the Worker adapters (BMKG scrape, ISPU, AirGradient, SiPongi). (3) Launch Indonesia for Palembang, Jambi,
Pekanbaru, Palangkaraya, Pontianak, Banjarbaru, Samarinda, Batam and Jakarta with station-level provenance. (4) Ask Nafas whether its AirGradient-hosted devices can be shown.

**Summary**

- **Best authoritative:** BMKG hourly PM2.5, 23–25 stations, 17 of them on Sumatra or Kalimantan. It is true 1-hr data in WIB, and hour N goes live at about (N+1):17 WIB,
  but only inside `bmkg.go.id` HTML (the internal JSON returns 401) with no licence. KLH ISPU (`ispu.kemenlh.go.id/apimobile/v1/getStations`) has 117 stations, no key, CORS `*`
  and it goes live about 1 min after the hour, but its PM2.5 is a 24-hr rolling average (Palembang 94 vs BMKG 1-hr 201).
- **Best crowd:** AirGradient, with 12 EPA-corrected sensors in Palembang (152–270, matching BMKG) and about 62 Nafas monitors in Jabodetabek, Malang and Balikpapan. It has no CORS and
  nothing in Riau, Jambi or most of Kalimantan. Nafas has no public API.
- **Fire context:** SiPongi hotspot GeoJSON, open with CORS `*`, about 2 h behind overpass.
- **Feasibility:** v2 with a Worker proxy. Use BMKG's own practice of applying ISPU categories to 1-hr values as the band scale.
- **Blockers:** no licence or API for BMKG PM2.5, and permission is needed. The ISPU "now" number is 24-hr. Jakarta DLH is WAF-blocked and its ToS need written permission. Crowd coverage is thin where the fires are.
  Hosts keep moving after the ministry split.
