# Cambodia, Laos, Myanmar: air quality data for HazeNow

Research captured live on **2026-09-28, 17:13–17:30 SGT** (Cambodia/Laos = ICT UTC+7, Myanmar = MMT UTC+6:30).
Every `curl` below was actually run and outputs are trimmed. Anything not confirmed by a live call is marked **unverified**.
Country membership of sensors was decided by point-in-polygon on Natural Earth 1:50m borders. That resolution misplaces a few
Thai stations on the Mekong/Mae Sai border, and I removed them by hand.

The three countries share one story: **there is no public, machine-readable government PM2.5 feed** in any of them (none found, and each is
**unverified** beyond what is listed). The only live data is crowd data, and only Laos has meaningful coverage (because of a UNICEF school programme).

## TL;DR

| | best authoritative | best crowd | index | verdict |
|---|---|---|---|---|
| **Cambodia** | none public. MoE reportedly runs ~59 sites (press, **unverified**) but publishes no feed | AirGradient: **2 live** (both Phnom Penh) + 1 Sensor.Community (Siem Reap) | no official AQI found (**unverified**). Press cites a 24-h PM2.5 standard of 50 µg/m³ (**unverified**) | **not feasible** (v2 at best, crowd-only, 2–3 points) |
| **Laos** | none public. MONRE's website is **suspended** (verified). Its ~5–6 World-Bank-funded stations have no public platform | **AirGradient: 103 live outdoor**, mostly the UNICEF/MoES/MONRE schools network in all provinces | none verified | **v2, crowd-only**. It is the only one of the three worth building for |
| **Myanmar** | none public. DMH/ECD post daily numbers on Facebook (press, **unverified**). ECD website unreachable | AirGradient: **1 live (Yangon, reading 0.0, suspect)** | none verified | **not feasible**. Border towns can use Thai stations (Mae Sai ↔ Tachileik) |

- Global crowd networks: **Sensor.Community 1 location in KH, 0 in LA, 0 in MM** (verified). PurpleAir: **unverified** (key required).
  IQAir/WAQI need keys and forbid redistribution (same as SG). WAQI's Laos "MoNRE" station is actually a UNICEF AirGradient sensor and was a month stale.
- CCDC DustBoy (Thailand) has registry entries across the borders (4 KH, ~24 LA, a few MM) but **0 of its 546 live stations are outside Thailand**.
- US Embassy (State Dept AirNow) monitors: the data host `dosairnowdata.org` **does not resolve** today. Don't plan on it.

---

## Authoritative (government) sources

| country | source | agency | what | stations (verified today) | cadence & latency | API/endpoint | key? | CORS | licence / ToS | reliability notes |
|---|---|---|---|---|---|---|---|---|---|---|
| KH | MoE website | Ministry of Environment (ក្រសួងបរិស្ថាន) | news + legal texts only | **0 public**. Press: 12 sites in Phnom Penh + 47 provincial + mobile vans (**unverified**) | – | none found. `https://moe.gov.kh/` is up (200, 151 KB) and its only air link is a sub-decree on air pollution and noise control | – | – | – | Ministry publicly downplays pollution (press). A data release looks unlikely soon |
| LA | MONRE website | Ministry of Natural Resources and Environment | – | **0 public**. A World Bank/ICEM 2022 report analyses 5–6 AQM stations (LENS2 project) and *recommends* building a public platform with real-time early warning | – | `https://www.monre.gov.la/` → **`/cgi-sys/suspendedpage.cgi`** (hosting suspended) | – | – | – | – |
| MM | DMH website | Dept of Meteorology and Hydrology | weather | **0 public** AQ data. Press: DMH Kaba Aye (Yangon) posts daily PM2.5 on Facebook, and ECD runs Japanese-aided monitors in Yangon/Mandalay (**unverified**) | daily (FB) | none. `https://www.moezala.gov.mm/` is up (200) with no air-quality links | – | – | – | Post-2021 state bodies. Facebook-only. Not machine-readable |
| MM | ECD website | Environmental Conservation Dept | – | – | – | `https://www.ecd.gov.mm/` **connection failed** | – | – | – | – |
| all | US Embassy monitors | US State Dept AirNow | PM2.5 1-hr (historically) | – | – | `dosairnowdata.org` → **"Could not resolve host"** | – | – | – | Treat as gone |

### Evidence

```bash
# 17:24:25 SGT
$ curl -s -L -o /dev/null -w "%{http_code} %{url_effective}\n" https://www.monre.gov.la/
200 https://www.monre.gov.la/cgi-sys/suspendedpage.cgi
$ curl -s -L -o /dev/null -w "%{http_code}\n" https://www.moe.gov.kh/      # → 200, homepage; 326 links, 1 air-related (sub-decree /index/2315)
$ curl -s -L -o /dev/null -w "%{http_code}\n" https://www.moezala.gov.mm/  # → 200, 142 links, 0 air-related
$ curl -s https://www.ecd.gov.mm/                                            # → connection failed (000)
# 17:28 SGT
$ curl -s https://dosairnowdata.org/dos/RSS/Vientiane/Vientiane-PM2.5.xml  # → Could not resolve host
```

```bash
# WAQI's Lao "government" station is a crowd sensor (embedded JSON on aqicn.org/station/@559306/)
"name":"MoNRE - Ministry of Natural Resources and Environment, Pakthang, Laos",
"atrb":{"networkId":"unicef-laos","name":"UNICEF ","url":"https://www.unicef.org/laos/","via":"AirGradient.com","id":"168450"},
"utime":1787637525          # = 2026-08-25 13:58 SGT, i.e. a month stale
# WAQI "Phnom Penh CDB-01": "Air Quality Data provided by: CCDC - Climate Change Data Center (cmuccdc.org)", no current data.
```

---

## Crowd / low-cost sensor networks

| country | source | sensor type | live stations (verified 17:14–17:21 SGT) | cadence & latency | API | key? | CORS | licence | correction | coverage by city |
|---|---|---|---|---|---|---|---|---|---|---|
| KH | **AirGradient** | O-1PST (PMS5003T ×2) | **2** (map API bbox: 3) | ~1 min (median age 1.1 min) | same as SG: `api.airgradient.com/public/api/v1/world/locations/measures/current` | no | none | CC BY-SA 4.0 | EPA (as SG) | Phnom Penh 2 (Kok Roka 7.7, NPIC 27.8 raw) |
| KH | Sensor.Community | SEN5x | **1** | 5 min | `data.sensor.community/airrohr/v1/filter/country=KH` | no | `*` | ODbL | RH | Siem Reap 1 (P2 4.7) |
| KH | CCDC DustBoy | DustBoy | registry 4 (e.g. "Building A, St 253, Phnom Penh, Institute of Technology of Cambodia"), **0 live** | – | key (see thailand.md) | yes | – | CCDC terms | – | – |
| LA | **AirGradient (UNICEF Lao schools network)** | **O-1PP** 95, O-1PPT-CE 7, O-1PST-CE 1 | **103 live outdoor** (109 registered). Map API: 115 | ~1 min (median age 1.1 min) | same | no | none | CC BY-SA 4.0. The WAQI attribution names UNICEF as network owner. Confirm with UNICEF Laos whether they want to be credited as well | EPA. **The O-1PP has no T/RH sensor**, so the RH term needs RH from elsewhere (the world API still returned `rhum`, source **unverified**). QC needed: one sensor read **522 raw** while the median was 1.6 | Vientiane 9, Luang Prabang 3, Pakse 2, and schools in Savannakhet, Houaphan, Khammouan, Bokeo, Xaignabouly, Champasack provinces |
| LA | Sensor.Community | – | **0** | – | `…/filter/country=LA` → `[]` | – | – | – | – | – |
| LA | CCDC DustBoy | – | registry ~24 incl. "Paksan, Laos (purple air project)", "Huai Xai Meteorological Station, Bokeo", **0 live** | – | – | – | – | – | – | – |
| MM | **AirGradient** | O-1PST | **1** (Yangon, pm02 **0.0**, RH 63, suspect) | ~1 min | same | no | none | CC BY-SA 4.0 | – | Yangon 1 |
| MM | Sensor.Community | – | **0** | – | `…/filter/country=MM` → `[]` | – | – | – | – | – |
| all | PurpleAir | PMS5003 ×2 | **unverified** (`ApiKeyMissingError`) | – | – | yes | `*` | paid | EPA | CCDC registry names "purple air project" sites in Laos, so some likely exist |
| all | IQAir / WAQI / OpenAQ | aggregators | IQAir web: 429. WAQI demo token rejected. The AirGradient map (which ingests OpenAQ) shows **0 OpenAQ reference sites** in KH/LA/MM | – | – | yes | – | no redistribution (IQAir, WAQI) | – | – |

```bash
# 17:14:44 SGT. AirGradient world dump, point-in-polygon
Cambodia total 2 live<60 2 median age 1.1 min
    90582 Kok Roka 11.597 104.8038 pm02 7.7 rh 71 O-1PST
    151638 Civil Engineering, NPIC 11.5977 104.7999 pm02 27.8 rh 37 O-1PST
Laos total 109 live<60 103 median age 1.1 min
    90402 Sathit Secondary School - Xaythani, Vientiane Capital ມັດທະຍົມ ສາທິດ 18.035 102.640 pm02 5.9 rh 64 O-1PP
    90405 Mayparkngum - Vientiane Capital 18.185 103.057 pm02 4.0 rh 59 O-1PP
Myanmar total 1 live<60 1
    171532 Yangon 16.86421 96.14311 pm02 0.0 rh 63 O-1PST

# 17:15:30 SGT
$ curl -s "https://data.sensor.community/airrohr/v1/filter/country=KH"   # 1 PM location (SEN5x @ 13.352,103.864)
$ curl -s "https://data.sensor.community/airrohr/v1/filter/country=LA"   # []
$ curl -s "https://data.sensor.community/airrohr/v1/filter/country=MM"   # []

# 17:20:40 SGT. AirGradient map API, bbox 92–108E / 5.5–28.6N, by country
Laos     {AirGradient Small Sensor fresh<2h: 115}
Cambodia {AirGradient Small Sensor: 3, SensorCommunity Small Sensor: 1}
Myanmar  {AirGradient Small Sensor: 1}            # (one "OpenAQ Reference" hit was Thai 73t Mae Sai, a border artefact)
```

---

## National index & bands

- **Cambodia:** no public AQI or band scheme found. Press reports cite a national **24-h PM2.5 standard of 50 µg/m³** (**unverified**).
- **Laos:** no national AQI found (**unverified**).
- **Myanmar:** National Environmental Quality (Emission) Guidelines exist, but no public AQI band scheme was found (**unverified**).

**How to map to HazeNow:** there is no national authority number to "not contradict", so the SG principle "borrow the authority's bands"
can't be applied. Options, to decide at v2:
1. **WHO-anchored neutral bands** on 1-hr crowd PM2.5, with no national branding (safest).
2. Reuse **Thailand's PCD bands** for Laos (Lao media and the Mekong region widely consume Air4Thai/Thai AQI, **unverified** claim). This is culturally
   plausible but is borrowing another country's authority.
3. The **US AQI**, which IQAir/AirGradient/WAQI already show to these users. It is familiar, but its "Unhealthy" labels are the alarmist framing SPEC avoids.

In every case, the provenance line must say **"Community sensor (AirGradient / UNICEF), not a government reading"**, and verdicts
should be scoped "for now", with SPEC's range and uncertainty rules applied (these are single low-cost sensors).

---

## Language / localisation

- **Cambodia:** Khmer (ភាសាខ្មែរ). Khmer script needs a font with Khmer coverage (Noto Sans Khmer). Phnom Penh expat audience: English.
- **Laos:** Lao (ພາສາລາວ). AirGradient station names are already bilingual Lao/English. Many Lao users read Thai, so the Thai UI is a stop-gap.
- **Myanmar:** Burmese (မြန်မာ) in **Unicode, not Zawgyi**. Zawgyi legacy encoding is still around, so test rendering. Avoid attributing
  numbers to state bodies (post-2021 political sensitivity), and expect regional internet shutdowns, so offline or stale states matter.
- Seasonal framing: the same Feb–Apr Mekong burning season as northern Thailand. Laos and Shan State get the worst of it.

---

## Integration recipe

(Only relevant to Laos, and possibly Phnom Penh, in v2.)

- **Endpoint:** AirGradient map API bbox (EPA-corrected, hourly history) via the v2 Worker, exactly as in `docs/ARCHITECTURE_V2.md`. Laos bbox
  `xmin=100.0&ymin=13.9&xmax=107.7&ymax=22.5`. Filter by point-in-polygon, because the bbox also covers NE Thailand.
- **Snapshot:** `pm25` = median of the ≥2 nearest sensors within 10 km, after outlier rejection (drop >3× neighbour median, drop exact 0.0
  when RH is present and neighbours are >5). `source: "AirGradient community sensors"`, `nowcast.confidence ≤ "medium"`.
  There is no `officialPsi24h` equivalent, so leave it null and hide that UI row.
- **Polling:** same as SG crowd (5–10 min via the Worker).
- **Gotchas:** O-1PP units lack an on-board RH sensor (correction input **unverified**). Outliers exist (522 raw). Laos sensors are at
  schools, so school-hours power or Wi-Fi gaps are possible (**unverified**). The timezone is ICT (UTC+7) for LA/KH and **UTC+6:30** for MM.
- **Myanmar border towns:** users in Tachileik can be served by Air4Thai **73t Mae Sai** (~1 km across the river). Myawaddy ↔ **76t Mae Sot**
  was stale (last value 2026-09-17), so it can't be relied on.

---

## Verdict

- **Laos: v2, crowd-only.** Worth it: 103 live sensors across all regions, keyless, CC BY-SA. It needs outlier QC, a band decision (no
  national scheme) and a courtesy agreement with UNICEF Laos / AirGradient.
- **Cambodia: not feasible now.** Only 2–3 live points, and the MoE publishes nothing machine-readable. Revisit if MoE opens its ~59-site
  network, or if AirGradient/UNICEF-style deployments appear.
- **Myanmar: not feasible.** There is 1 suspect sensor and no government feed, and the political and connectivity risks are high. At most, a Thai-border fallback for Tachileik.

**Key blockers:** no government data anywhere. Advice would have to rest on non-national bands. Crowd coverage is Laos-only.
