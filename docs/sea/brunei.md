# Brunei: air quality data for HazeNow

Research captured live on **2026-09-28, 17:15–17:30 SGT (= BNT, UTC+8)**. Brunei is **not** in haze today:
the 16:00 PSI was Brunei-Muara 30, Belait 50, Temburong 33 and Tutong 24 (all "Good"). Earlier this month it was
(Brunei-Muara 215 "Very Unhealthy" on 1 Sep, per the MoD press release below). Every `curl` below was run. Anything not
confirmed with a live call is marked **unverified**.

## TL;DR

- **Best authoritative source: JASTRe (Jabatan Alam Sekitar, Taman dan Rekreasi) PSI**, per district (4 districts).
  It is published **only as a JPEG infographic** on `www.env.gov.bn` (and Instagram @jastre.bn). There is **no JSON/API feed and no
  concentration values**, just one index number per district.
- Cadence: "five times daily at 7.00 AM, 9.00 AM, 11.00 AM, 2.00 PM and 4.00 PM **during the hazy period**". Today
  only the 11:00, 14:00 and 16:00 images appeared, each uploaded **~20 min after the reading time**. This is discoverable
  through the WordPress REST media API (JSON, with upload timestamps), but the numbers are pixels.
- PM2.5 was added to the PSI on **1 Sep 2026**. The **averaging period is not published (unverified)**. There is no 1-hr PM2.5.
- **Best crowd source: AirGradient, 1 sensor ("Belait", Kuala Belait)**, reading 1–7 µg/m³ over the last 26 h. PurpleAir, IQAir and OpenAQ need keys.
  Sensor.Community has 0. WAQI has **no** Brunei markers.
- **Verdict: not feasible as a live numeric feed.** At most, a v2 "JASTRe says" card that links to the image, or an OCR
  pipeline (fragile, and I would not recommend it without JASTRe's permission). Revisit if JASTRe publishes data.

---

## Authoritative (government) sources

| source | agency | what (PM2.5 1-hr? index?) | stations (count verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS for redistribution in a free MIT app | reliability notes |
|---|---|---|---|---|---|---|---|---|---|
| **JASTRe PSI infographic** | Dept. of Environment, Parks and Recreation, Ministry of Development | **PSI** per district (PM10 + PM2.5 since 1 Sep 2026). **No 1-hr PM2.5, no concentrations** | **4 district values** (Brunei-Muara, Belait, Temburong, Tutong). The underlying station count is **unverified**. A JASTRe tender names two stations: "Stesen Pemantauan Kualiti Udara **Rimba**" and "**Seria**" | Stated 5×/day (07, 09, 11, 14, 16) "during the hazy period". **Today: 11:00 → uploaded 11:22:09. 14:00 → 14:20:31 (re-uploaded 14:21:41, 14:21:49). 16:00 → 16:20:15.** No 07:00/09:00 today, and none after 16:00 (a ~15 h overnight gap) | Image: `https://www.env.gov.bn/wp-content/uploads/2026/09/PSI-Reading-update-for-Brunei-Darussalam-as-of-28-September-2026-4.jpeg` (filename suffix changes per upload). Discovery: `https://www.env.gov.bn/wp-json/wp/v2/media?search=PSI&orderby=date&order=desc&per_page=1` | no | REST API echoes any `Origin` (`access-control-allow-origin: https://example.com`). The JPEG has no ACAO, but `<img>` works | **None stated** (no open licence found. The site has no terms page with a data licence). Treat as all rights reserved. Linking is fine, re-hosting or OCR-redistributing is unverified | Values only as pixels. Website only holds **today's** 5 PSI images (`x-wp-total: 5`), so no history. Instagram is probably the primary channel (**unverified**: not fetched, needs login/scraping) |
| MoD/JASTRe joint press releases (PDF) | Ministry of Development, MOH, Fire & Rescue | PSI table + MOH advice (text PDF) | 4 districts | ad hoc: 30 Aug, 1 Sep (2 pm, 4 pm), earlier in Aug/Apr/Feb | `https://www.mod.gov.bn/wp-json/wp/v2/media?search=jerebu` → PDFs | no | – | none stated | Useful for index definitions and advice wording. Not a feed |
| data.gov.bn | Brunei open data | – | **0 AQ datasets** (search "PSI", "udara", "pollutant" → nothing relevant) | – | `https://www.data.gov.bn/wp-json/wp/v2/search?search=…` | – | – | – | Nothing to read |
| Brunei Darussalam Meteorological Department (`met.gov.bn`) | BDMD | weather. No PM or haze content on the homepage | – | – | `https://met.gov.bn/SitePages/Home.aspx` (200) | – | – | – | Not an AQ source. ASMC's regional haze products are in Singapore (covered elsewhere) |

### Evidence (times BNT = SGT)

```bash
# 17:17 homepage: the PSI is an <img>
$ curl -s -L https://www.env.gov.bn/ | grep -o 'src="[^"]*PSI[^"]*"'
src="/wp-content/uploads/2026/09/PSI-Reading-update-for-Brunei-Darussalam-as-of-28-September-2026-4.jpeg"

$ curl -s -I "https://www.env.gov.bn/wp-content/uploads/2026/09/PSI-Reading-update-for-Brunei-Darussalam-as-of-28-September-2026-4.jpeg"
HTTP/2 200
content-type: image/jpeg
last-modified: Mon, 28 Sep 2026 08:20:15 GMT        # = 16:20:15 BNT, for the "4:00 petang" reading
cache-control: max-age=315360000

# 17:18 WordPress REST: upload times of every PSI image (JSON, CORS echoes Origin)
$ curl -s -D- -H "Origin: https://example.com" "https://www.env.gov.bn/wp-json/wp/v2/media?search=PSI&per_page=30&_fields=id,date,title,source_url"
access-control-allow-origin: https://example.com
x-wp-total: 5
2026-09-28T16:20:15  ...-2026-4.jpeg   -> "Pada 28 September 2026, 4:00 petang": B&M 30 · Belait 50 · Temburong 33 · Tutong 24
2026-09-28T14:21:49  ...-2026-3.jpeg   -> "2:00 petang": 30 · 24 · 30 · 25
2026-09-28T14:21:41  ...-2026-1.jpeg   -> (same 2:00 pm image, re-upload)
2026-09-28T14:20:31  ...-2026.jpeg     -> (same 2:00 pm image)
2026-09-28T11:22:09  ...-2026-2.jpeg   -> "11:00 pagi": 30 · 29 · 26 · 16
```
(The values were read by eye from the images. There is no machine-readable copy.) Image footer: "NOTA: BACAAN PSI MENGAMBIL KIRA BAHAN
PARTIKULAT (PM10) DAN BAHAN PARTIKULAT 2.5 (PM2.5)".

```bash
# Press release, PDF (last-modified 2026-09-01 23:48 GMT)
$ curl -s -O "https://www.mod.gov.bn/wp-content/uploads/2026/09/PR-Situasi-Jerebu-di-Negara-Brunei-Darussalam-PM-2.5-4-petang.pdf"
"beginning 1 September 2026 at 2:00 PM, air quality reporting in Brunei Darussalam will be enhanced by incorporating
 PM2.5 concentrations into the reporting of the Pollutant Standards Index (PSI). ... provide PSI updates five times daily
 at 7.00 AM, 9.00 AM, 11.00 AM, 2.00 PM and 4.00 PM during the hazy period."
 4:00 PM, 1 Sep 2026: Brunei Muara 215 Very Unhealthy · Belait 211 Very Unhealthy · Temburong 164 Unhealthy · Tutong 168 Unhealthy

# Hosts that did not answer: www.jastre.gov.bn / jastre.gov.bn (connection failed, 000). Current site is www.env.gov.bn
```

---

## Crowd / low-cost sensor networks

| source | sensor type | what | stations in BN (verified today) | cadence & latency | endpoint | key? | CORS | licence | correction needed | coverage | reliability notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **AirGradient** | PMS5003T (O-1PST) | raw `pm02`, EPA-corrected `pm25`, RH, hourly history | **1** ("Belait", 4.5879, 114.2390, Kuala Belait) | ~1 min. `measuredAt` 09:14:24Z at 17:15 | map API bbox / world dump (same as SG) | no | **none** | CC BY-SA 4.0 | EPA-extended + `k` (no official 1-hr anchor) | Belait only. **None in Bandar Seri Begawan** | 26 h of hourly buckets: 6.8, 4.0, 5.1 … 0.0, 1.3, 1.8 µg/m³. That is *very* clean air while JASTRe Belait PSI = 50 at 16:00 (up from 24 at 14:00). The mismatch is unresolved: it could be PM10-driven PSI, a 24-h average, a local source near the Seria station, or siting |
| PurpleAir | PMS5003 ×2 | – | **unverified** (403 without key) | – | `api.purpleair.com` | yes | `*` | ToS | EPA | – | – |
| IQAir | – | US AQI | **unverified** (key required) | – | `api.airvisual.com` | yes | ? | no redistribution | – | – | – |
| OpenAQ | – | – | **unverified** (401) | – | `api.openaq.org/v3` | yes | – | – | – | – | – |
| Sensor.Community | – | – | **0** (`country=BN` → `[]`. 60 km around BSB and 40 km around Belait → `[]`) | – | `data.sensor.community/airrohr/v1/filter/country=BN` | no | `*` | ODbL | – | none | – |
| WAQI | – | – | **0 markers** inside Brunei (Borneo bbox query lists Miri, Limbang, Labuan etc. but nothing in BN) | – | undocumented | token | – | forbids redistribution | – | – | Confirms JASTRe isn't mirrored anywhere machine-readable |
| Local (UBD, UTB) | – | – | **unverified: none found** | – | – | – | – | – | – | – | – |

### Evidence
```bash
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin=109.5&ymin=0.8&xmax=119.5&ymax=7.5&zoom=12&measure=pm25"
{"data":[{"locationId":111346730,"locationName":"Belait","latitude":4.5879,"longitude":114.239,"sensorType":"Small Sensor",
  "pm25":2.7,"rhum":61,"measuredAt":"2026-09-28T09:14:24.000Z","dataSource":"AirGradient"},
 {"locationName":"Tambulaung", ... (Sabah, MY)}]}
$ curl -s "https://map-data-int.airgradient.com/map/api/v1/locations/111346730/measures/history?start=2026-09-27T08:00:00Z&end=2026-09-28T10:00:00Z&bucketSize=1h&measure=pm25"
26 buckets: [6.8, 4, 5.1, 6.2, 3.9, 2.7, 3.1, 2.6, 1.7, 1.4, 2.7, 3.3, 3.9, 3.5, 2.9, 3.1, 3.3, 3.3, 1.7, 1.7, 2.3, 2.9, 1.6, 0, 1.3, 1.8]
$ curl -s "https://data.sensor.community/airrohr/v1/filter/country=BN"   -> []
$ curl -s -i "https://api.purpleair.com/v1/sensors?...nwlng=99.6&nwlat=7.4&selng=119.3&selat=0.85"   -> HTTP/2 403 ApiKeyMissingError
```

---

## National index & bands

**Pollutant Standards Index (PSI)**, JASTRe. It includes PM10 and (since 1 Sep 2026) PM2.5. Other pollutants and the
**averaging period (24 h? 3 h? 1 h?) are unverified**: no methodology document was found on env.gov.bn or mod.gov.bn. One
observation argues against a pure 24-h PM average: Belait went **24 → 50 between 14:00 and 16:00** today. With a 24-h mean, that
would need a ~600 µg·h/m³ spike in 2 h, and the only crowd sensor in Belait saw ≤ 3 µg/m³. This is inconclusive, so ask JASTRe.

PM2.5 breakpoints: **unverified** (not published).

Bands (verbatim from the press release and infographic):

| PSI | BM | EN |
|---|---|---|
| 0–50 | Tahap Baik | Good |
| 51–100 | Tahap Sederhana | Moderate |
| 101–200 | Tahap Tidak Sihat | Unhealthy |
| 201–300 | Tahap Sangat Tidak Sihat | Very Unhealthy |
| >300 | Tahap Merbahaya | Hazardous |

Official health advice (MOH, joint press release 1 Sep 2026, verbatim) for **Very Unhealthy (201–300)**: "members of the public
are advised to avoid prolonged or strenuous outdoor physical activities and reduce unnecessary exposure to haze. Children,
older persons and pregnant women are advised to limit outdoor activities, while individuals with existing heart or
respiratory conditions are advised to avoid all outdoor activities. Those experiencing persistent or worsening symptoms …
are advised to seek medical attention …". Advice for the other bands: **unverified** (the MOH site was not fetched).
Hotlines in the release: Fire & Rescue **995**, Darussalam Hotline **123**.

**Mapping to HazeNow:** there is no 1-hr PM2.5 and no concentration, so HazeNow's model doesn't apply. The only honest
product is "JASTRe PSI for your district: <n> <band>, as of <time>", taken from JASTRe verbatim, plus MOH's wording. A crowd
1-hr number (1 sensor) can't carry a national product and currently disagrees with JASTRe.

## Language / localisation

- Official language **Bahasa Melayu** (the infographic is BM with EN band names, and press releases are BM + EN). English is widely used.
  The Jawi script appears in the JASTRe header. Jawi for copy is optional and **unverified** as expected by users.
- Use the JASTRe terms verbatim: "Bacaan PSI", "Tahap Baik/Sederhana/Tidak Sihat/Sangat Tidak Sihat/Merbahaya", "jerebu".
- Cultural framing: government communication is formal and joint (JASTRe + MOH + Bomba). Defer to it explicitly
  ("Refer to MOH advisories"). Friday prayer times and outdoor religious gatherings may matter for "reschedule outdoor"
  actions (**unverified**, a product idea only).

## Integration recipe

No numeric feed exists. If a "JASTRe says" card is wanted:
1. `GET https://www.env.gov.bn/wp-json/wp/v2/media?search=PSI&orderby=date&order=desc&per_page=1&_fields=id,date,source_url`
   (JSON, CORS OK). `date` is the local upload time (naive, BNT = UTC+8). `source_url` is relative.
2. Show the image (hot-link or link out) with "JASTRe · uploaded <date>". Don't extract numbers.
3. Poll at hh:25 after 07/09/11/14/16 only, and only when the last upload is from today. Otherwise poll once per hour at most.
4. Gotchas: filenames get `-1…-4` suffixes on re-upload. Several uploads can be the same reading. The reading time is only
   inside the image ("Pada 28 September 2026, 4:00 petang"). The media library keeps only today's images. `www.jastre.gov.bn` is dead, so use
   `www.env.gov.bn`.
5. OCR option (not recommended): the template is fixed (4 green/yellow circles, white digits), so Tesseract on fixed crops would
   work until the design changes. It risks misreading a health number, and there is no licence. Don't ship without JASTRe's consent.
6. Crowd: AirGradient "Belait" via the shared adapter, labelled "Community sensor, Kuala Belait". It is not representative of BSB.

## Verdict

**Not feasible for the HazeNow model (v2 at best, as a link-out card).**
- Blockers: (1) the official data is an **image only**, with no API and no concentrations. (2) **No 1-hr PM2.5**, and the PSI averaging is
  undisclosed. (3) Publication runs only in daytime during haze (5×/day at best, ~20 min lag, a ~15 h overnight gap). (4) There is no licence.
  (5) Crowd coverage is **1 sensor**, which disagrees with JASTRe today.
- Path forward: email JASTRe to ask for (a) the PSI methodology and (b) a machine-readable feed (even a CSV next to the image).
  Seed AirGradient sensors in BSB (a DIY_SENSOR.md partnership, e.g. with UBD/UTB).
