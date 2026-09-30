# Community sensors: the trust report

For the founder. One question per place: **can we stand behind a number that comes from community sensors, and what does
HazeNow show there?** Built from the coverage hunt of **2026-09-30** (`coverage-hunt/{th,id,my-bn,vn-kh-la,ph-mm-tl}.md`
and `.json`), the recorded captures of **2026-09-28** (`packages/core/fixtures/sea/ag-map-sea-2026-09-28T1027Z.json` and
`…T1806Z.json`), [REGIONAL.md](REGIONAL.md) and [COVERAGE.md](COVERAGE.md).

**Honesty rule for this document.** Every number below comes from one of those sources. Where nobody measured something
(most often: uptime over 7–30 days, and agreement with an official station), the table says **"not measured"**. Items we
couldn't verify are marked **unverified**. "28 Sep" values are from the recorded captures (10:27 and 18:06 UTC);
"30 Sep" values are from the hunt's live calls (~08:00–08:20 UTC).

---

## 1. What a community sensor is, and why we trust some of them

**What it is.** A small box, about the size of a paperback, with a fan and a laser inside. Air is drawn past the laser and
the sensor counts the light scattered by particles, then converts the count into a PM2.5 concentration. A school, clinic,
temple, shop, guesthouse or household buys one (about US$100–250), mounts it outside, connects it to Wi-Fi, and it
publishes a reading every minute or so to a public map. HazeNow reads two networks:

| network | typical hardware | what arrives | licence |
|---|---|---|---|
| **AirGradient** | Plantower PMS5003 family (outdoor models `O-1P`, `O-1PS`, `O-1PST`, `O-1PP`; some have two sensors), plus a temperature/humidity sensor | AirGradient's map API already applies the US EPA "extended" correction (Barkjohn 2022), which uses humidity. The fallback world API gives raw values, and HazeNow applies the same correction itself | CC BY-SA 4.0, "AirGradient contributors" |
| **Sensor.Community** | Nova SDS011 (most units) or Sensirion SPS30 (a better laser counter), usually with a humidity sensor alongside | **Raw** PM2.5, no humidity correction. HazeNow reads these rows from the same AirGradient map feed, tagged with their real source | **ODbL 1.0** (share-alike on the database), per REGIONAL.md. The brief called it CC BY-SA; that is AirGradient's licence, not Sensor.Community's. HazeNow credits it as "Sensor.Community contributors, ODbL 1.0" |

**Why they are reasonably trustworthy outdoors.** These optical counters don't weigh particles the way an official
monitor does, so on their own they read high, especially in humid air. But the error is well studied. The EPA correction
was fitted on thousands of co-located hours against official monitors across the US, and with it low-cost Plantower
sensors typically land within roughly ±5 µg/m³ or ±20–30% of the reference at everyday levels. Put simply: after
correction, a working outdoor sensor tells you reliably whether the air is clean, moderate or bad, and roughly how bad.
It can't give you the official number to the microgram. Several agreeing sensors in one town are far more convincing than
one.

**The known limits.**

- **Humidity.** In fog, drizzle or very humid nights, water droplets and swollen particles scatter light too, and the
  sensor over-reads, sometimes several-fold. The EPA correction handles most of this for AirGradient. Sensor.Community
  rows arrive uncorrected, so **HazeNow drops any Sensor.Community reading taken at 90% relative humidity or more.**
  Example from 28 Sep 18:06 UTC: a Sensor.Community unit in Palembang read 329 µg/m³ at 99.9% RH. That's the kind of
  reading this rule leaves out.
- **Siting.** A sensor next to a grill, a busy road, a generator or a fuel-station forecourt measures that source, not the
  town. One tucked under eaves or on a sheltered rooftop can under-read. We can't see siting from the data. We only see
  its symptoms: a sensor that sits far above or below its neighbours.
- **Single-sensor risk.** One sensor can't be cross-checked. A failing fan, a spider in the inlet or a stuck reading
  (Yangon's sensor read a flat 0.0 for days) all look like real air. This is why a place with no official station needs
  **at least two** sensors within 10 km before we call it covered.
- **No calibration without an official anchor.** Where an official 1-hr station sits within 10 km, the proxy fits a local
  correction factor `k` against it. Where none does (Pai, Siem Reap, Laos, Cambodia, the Philippines), `k` stays empty
  ("uncalibrated"). The number is still shown, but always as an estimate with a range.
- **Short track records.** Most sensors below were seen in one or two snapshots. Only Singapore's, Davao's, Yangon's and
  JB's "Iolite" have any multi-hour or multi-day history measured. Uptime is the biggest gap in this report.

### How HazeNow uses them

| rule | what it means |
|---|---|
| **Official always wins** | If an official 1-hr station is within 25 km, its reading is the big number. Community sensors never override it |
| **Community fills gaps only** | With no official 1-hr station within 25 km, usable sensors **within 10 km** give a community estimate |
| **Same country only** | Never a sensor or station from across a border (JB never uses Singapore's Sembawang sensor, 9.3 km away) |
| **Fresh only** | A sensor reading older than 15 minutes is dropped. Indoor sensors are dropped |
| **Outlier rule (new)** | Take the sensor's **cluster**: every sensor within 10 km, including itself. If the cluster has **at least 4** sensors, a sensor reading **more than 3× the cluster median, and at least 10 µg/m³ above it**, is dropped. The 10 µg/m³ floor stops clean-air jitter (a 3 next to a median of 1) from counting as an outlier |
| **Sensor.Community humidity rule (new)** | Sensor.Community rows at RH ≥ 90% are dropped (they aren't humidity-corrected) |
| **Plausibility guard (new, official stations)** | A 1-hr PM2.5 outside 0–1000 µg/m³, or a jump of more than 400 in one hour, is left out. The app says calmly: "A station reading looked wrong and was left out." |
| **Offline rule (new)** | A station with no data for more than 24 hours counts as offline and is left out (Bali's Sempidi station today) |
| **Label** | "Community sensors · estimate", with a range, and never presented as a government reading |
| **Not shown** | **Nafas-operated devices** (Indonesia), until Nafas confirms a licence. IQAir, PurpleAir and Clarity networks (keyed APIs, no redistribution rights) |

**Trust ratings used below.** **High**: several agreeing outdoor sensors, sensible values, or a proven multi-day record.
**Medium**: good hardware and plausible values, but thin redundancy, no official anchor, or no uptime record.
**Low**: too little history, a fault, or nothing we can verify. **n/a**: nothing to rate.

---

## 2. City by city

### Pai (Thailand): 21 sensors, no official anchor

Nearest official station: PCD Air4Thai **58t Mae Hong Son, 49.5 km away, over a mountain ridge in a different valley**.
That's too far to calibrate against or to stand for Pai. On 30 Sep the hunt saw **21 outdoor AirGradient sensors within
10 km** (22 within 25 km), all online and about 1 minute old. Readings ranged **3.3–23.8 µg/m³, median about 6.8**.

The sensors, from the 28 Sep map capture (distance from Pai's point; the map API is EPA-corrected; 28 Sep was a very clean
day, so values sit near zero):

| # | sensor (map id) | owner type | dist. | 28 Sep 10:27Z | 28 Sep 18:06Z | notes |
|---:|---|---|---:|---:|---:|---|
| 1 | Pai Immigration (11154970) | government | 0.3 km | 2.7 | 0.3 | |
| 2 | Pai: NT/TOT office near Pai Hospital (257) | state telecom office | 0.5 km | 2.2 | 0 | **Read 23.8 on 30 Sep, 3.5× the cluster median of 6.8. Dropped by the outlier rule.** Next to a fuel-station forecourt (possible local dust, unverified) |
| 3 | Pai: Dr. Neung Clinic near PTT gas station (214927) | health | 0.5 km | 6.5 | 0 | Also near the forecourt |
| 4 | Pai: Wednesday Market (251) | public market | 0.8 km | 5.0 | 0.2 | |
| 5 | Mae Yen: Ing Doi Guesthouse (265) | tourism business | 1.0 km | 1.2 | 0 | |
| 6 | Wiang Nuea: Mon Far Pai Cottages (307) | tourism business | 1.6 km | 0.9 | 0.3 | |
| 7 | Vieng Nua, Pai (783054) | unknown | 1.9 km | 2.5 | 0 | **Model not reported** (`model: null` in the world API): hardware and outdoor status **unverified**. Values in range, so kept |
| 8 | Wiang Nuea Moat (260) | unknown / civic | 1.9 km | 1.3 | 0 | |
| 9 | Mae Hi: Pittalew Art Gallery (273) | business | 2.1 km | 0 | 0 | |
| 10 | Wiang Nuea Moo 8 Mayor (277) | local government | 2.4 km | 4.0 | 0.4 | |
| 11 | Paina Paita Home (near Coffee In Love) (274) | tourism business | 2.6 km | 0.6 | 0 | |
| 12 | Mae Khong Border Patrol (276) | government | 3.0 km | 1.2 | 0 | |
| 13 | Wiang Nuea Beverly Hills Goat Farm (250) | tourism business | 3.6 km | 0 | 0 | |
| 14 | Wiang Nuea Beverly Hills Hua Chang Dam (252) | unknown | 3.8 km | 0 | 0 | |
| 15 | Wiang Nuea: Wat Phra Phutthabat (254) | temple | 3.9 km | 2.0 | 0 | |
| 16 | Mae Na Toeng School (282) | school | 4.4 km | 1.7 | 1.0 | |
| 17 | Tin That (256) | unknown | 4.6 km | 0.8 | 0.1 | |
| 18 | Wat Mo Paeng (306) | temple | 5.1 km | 0 | 0 | |
| 19 | Tha Pai Hot Springs (26388479) | tourism | 6.7 km | 0 | 0 | |
| 20 | Pa Yang School (333) | school | 6.9 km | 0 | 0 | |
| 21 | Mae Ping Health Center (304) | health | 8.6 km | **37.9** | 0 | **37.9 against a cluster median of about 1 on 28 Sep. The outlier rule drops it.** Fine at 18:06Z |

Shared across all 21: **network** AirGradient; **hardware** outdoor `O-1PP` / `O-1PST` (Plantower PMS5003 family), except #7;
**outdoor** yes (none flagged indoor); **freshness** about 1 minute (30 Sep); **uptime (7–30 d)** **not measured**, single
snapshots only (all 21 were online on 28 Sep and on 30 Sep, which is encouraging but isn't a track record);
**agreement with an official station** **not computable** (nothing within 25 km, `k` stays null).

Per-sensor trust: **medium** for the 19 unremarkable units (right hardware, plausible, civic hosts, no history).
**Low** for NT/TOT (outlier on 30 Sep) and Mae Ping (outlier on 28 Sep), both handled automatically by the outlier rule
rather than a hard-coded ban. **Low–medium** for Vieng Nua (unknown hardware).

**Overall: medium.** It's one of the best-instrumented small towns in the region. The hosts are diverse (immigration,
border police, clinics, schools, temples, a market, guesthouses), so it isn't one household's cluster, and with 19+
agreeing sensors a single bad unit is caught. What holds it at medium: no official anchor within 50 km (so the number
can't be calibrated, only corrected), and no uptime record.

**What HazeNow shows:** Pai is a **"Community sensors only"** place. It needs the HazeNow server: the Thai adapter still
reads Air4Thai directly and adds AirGradient through the proxy. The big number is a community estimate with a range,
labelled "Community sensors · estimate", plus a line saying there's no official station within 25 km to check the sensors
against (the nearest PCD station is 50 km away in Mae Hong Son).

### Siem Reap (Cambodia): two networks agreeing

Cambodia has **no official feed at all** (the Ministry of Environment's last air-quality document is dated April 2019), so
no official anchor exists anywhere in the country.

| sensor | network | hardware | dist. | owner | out/in | uptime (7–30 d) | freshness | agreement | faults | trust |
|---|---|---|---:|---|---|---|---|---|---|---|
| Mondul 2 (map id 23403781) | AirGradient | Outdoor "Small Sensor" (O-1 series, PMS5003 family) | 1.6 km | not stated | outdoor | not measured | ~1 min (30 Sep) | No official station. **Agrees with the Sensor.Community unit:** 19.0 vs ~20.5 (30 Sep); 3.7 vs 4.7 (28 Sep 10:27Z); 2.1 vs 5.1 (28 Sep 18:06Z) | none seen | **Medium**: good hardware, corroborated by an independent network, but only one unit of its kind |
| Siem Reap, S.C. #98715 (map id 51718789) | Sensor.Community | SDS011-class (raw, no RH correction; exact model **unverified**) | 2.7 km | not stated (S.C. carries no owner field) | outdoor (**unverified**: the map feed has no indoor flag) | not measured | ~1 min (30 Sep); reported 18:00:03Z on 28 Sep | as left. RH 76% at 28 Sep 18:06Z, so below the 90% cut | reads slightly above AirGradient, as raw SDS011s do in humid air | **Medium**: independent confirmation, but uncorrected and one unit |

**Overall: medium.** It's the only place in the whole hunt where **two different networks**, set up by people who didn't
coordinate, agree within 3 km of town. That's real corroboration and it clears our "at least two sensors within 10 km"
bar. The catches: each network has one unit, there's nothing official to calibrate against, and the Sensor.Community unit
can drop out on humid nights (≥ 90% RH), leaving one sensor.

**What HazeNow shows:** Siem Reap is **"Community sensors only"**. Cambodia is now served by the proxy, community sensors
only. The app shows the number as a community estimate, with no chip (Cambodia has no national scale) and the "N× the WHO
daily guideline" line.

### Johor Bahru (Malaysia): one good sensor inside the radius

DOE Malaysia publishes **no 1-hr PM2.5**, only its 24-hr-based API index (Larkin 0.6 km, Pasir Gudang).

| sensor | network | hardware | dist. | owner | out/in | uptime | freshness | agreement with DOE | faults | trust |
|---|---|---|---:|---|---|---|---|---|---|---|
| "Iolite", S.C. #94332 (map id 121978516) | Sensor.Community | **Sensirion SPS30** + SHT30 humidity (better than SDS011) | 9.9 km | unknown | outdoor (`exact_location: 1`) | **42/42 hourly buckets = 100%, but over only ~42 h** (28 Sep 14:00Z – 30 Sep 07:00Z). 7–30 d **not measured** | current at capture (last bucket 07:00Z, polled 08:07Z) | 24-h mean **85.6** vs DOE Larkin (API 162) implied **~76.8** and Pasir Gudang (API 164) implied **~80.7**: within **6–11%** | none. A steep drop 89 → 20.6 on 30 Sep was mirrored by Eco Botanic, so most likely real (rain) | **Medium**: good hardware and a real cross-check, but ~2 days of history |
| Eco Botanic (119362966) | AirGradient | outdoor O-1 series | 14.9 km | not stated | outdoor | not measured | ~1 min | not measured | none | **Medium**, but **outside 10 km, not used** |
| Sembawang (569) | AirGradient | O-1PST-CE | 9.3 km | not stated | outdoor | ~99.7% over 14 d (SG table below) | — | — | — | **Never used for JB: it's in Singapore** (cross-border rule) |

**Overall: medium, resting on one sensor.** Iolite's agreement with DOE is genuinely good, but it's one box with about two
days of history.

**What HazeNow shows:** DOE's 24-hr API row and its band, plus an **hourly community estimate from Iolite** when it's live
and fresh (one sensor, so no range). If Iolite goes quiet or reads at ≥ 90% RH, JB falls back to the DOE index only.
**Before public launch, log Iolite hourly in the proxy for at least a week.** If its uptime or its agreement with DOE
slips, withdraw the estimate.

### Kuala Lumpur / Klang Valley (Malaysia): healthy cluster

| sensor | network | dist. (from KL point) | 28 Sep 10:27Z | 30 Sep | notes |
|---|---|---:|---:|---:|---|
| KLCC (110009290) | AirGradient | 3.1 km | 65.6 | 63.4 | |
| Mont Kiara (98500617) | AirGradient | 5.1 km | 63.6 | 59.6 | |
| Taman Tun Dr. Ismail (956) | AirGradient | 6.6 km | 65.6 | 57.4 | |
| Setapak (108254583) | AirGradient | 7.2 km | 54.0 | 45.2 | |
| Setia Eco Park, Enviro Exceltech, Sejati Residences Cyberjaya | AirGradient | beyond 10 km | — | 62.2 / 52.7 / 58.4 | corroborating, outside the 10 km radius |

All are outdoor AirGradient units, EPA-corrected, about 1 minute fresh. Uptime **not measured**. Agreement: DOE Batu Muda
read API 160, an implied 24-h PM2.5 of **~73 µg/m³**, in the same range as the cluster (45–64). No faults seen.
**Overall: high** (four agreeing sensors within 10 km, plausible against DOE). **Shows:** community estimate with a range,
plus DOE's API row.

### Bali (Indonesia): dense sensors, official anchor offline

No BMKG 1-hr station on Bali. The only official line, **KLH ISPU Badung Sempidi, has been offline since 29 Sep 10:00 WITA**
(on 30 Sep it returns hourly stamps with every value null). Under the new offline rule it's left out.

| place | sensors ≤ 10 km (28 Sep 18:06Z) | range 18:06Z (median) | notes |
|---|---:|---|---|
| Canggu | 23 | 20.5–74 (56.4) | |
| Seminyak | 17 | 18.2–74 (58.6) | |
| Denpasar | 15 | 18.2–74 (56.3) | |
| Kuta | 11 | 18.2–64.2 (55.4) | |
| Ubud | 8 | 28.4–45.9 (36.6) | |
| Sanur | 3 | Segara Ayu 19.5 (0.6 km), Cactus House 18.2, Shiva Industries 58.6 | |
| Jimbaran | 3 | Padang2 15.0, Madas 17.1, Kulat Black Palms 21.7 (6.7–7.9 km) | |
| Uluwatu | 3 | Kulat Black Palms 21.7 (1.5 km), Madas 17.1, Padang2 15.0 | agree within 7 µg/m³ |
| Nusa Dua | **0** | nearest: Cactus House (110114222), **10.4 km**, O-1PST, 40.5 raw on 30 Sep | just outside 10 km |

Hardware: AirGradient outdoor units, EPA-corrected on the map. Owners: villas, cafés, businesses, schools (not
individually checked). Uptime: **not measured**. Agreement with the official line: **poor and unexplained** when Sempidi
was live. Its 24-h mean was **7.4 µg/m³**, while sensors 3–7 km away read **36–60 at night** (COVERAGE.md). Both can be
right (a clean day plus a smoky night), but we can't prove it. Known fault: **Cactus House read 132.9 at 28 Sep 10:27Z**,
far above its neighbours (Segara Ayu 20.5, Shiva Industries 46.1), then 18.2 at 18:06Z. The outlier rule does **not**
catch it: only 3 sensors (itself included) sit within 10 km, below the 4-sensor minimum, and 132.9 is under 3× the
cluster median of 46.1. It would have entered a Sanur/Nusa Dua-side estimate as-is. Worth a sensor-side recheck.

**Overall: medium-high** for Canggu, Seminyak, Denpasar, Kuta and Ubud (many agreeing sensors). **Medium** for Sanur,
Jimbaran and Uluwatu (three sensors each). **Shows:** community estimates with a range. The ISPU row is gone while Sempidi
is offline. **Nusa Dua shows "Not available yet"** while Sempidi is offline (no sensor within 10 km).

### Vientiane and Luang Prabang (Laos): the strongest crowd-only story

UNICEF / Ministry of Education schools network on AirGradient hardware (O-1PP / O-1PST-CE family), CC BY-SA. No official
anchor (the MONRE site is down). No faults seen.

| place | sensor | dist. | 28 Sep 10:27Z | 28 Sep 18:06Z | owner |
|---|---|---:|---:|---:|---|
| Vientiane | Mahosot Hospital | 2.7 km | 2.0 | 1.1 | hospital |
| | Saphanthong Village | 3.0 km | 4.7 | 1.2 | community |
| | UNICEF Lao PDR CO | 4.6 km | 3.7 | 1.4 | UN office |
| | Sathit Secondary School | 6.7 km | 0.5 | 1.6 | school |
| | Chomphet Secondary School | 7.4 km | 3.8 | 1.4 | school |
| Luang Prabang | Santiphab Secondary School | 0.8 km | 11.0 | 0 | school |
| | Souphanouvong University | 6.8 km | 1.8 | 0.8 | university |

30 Sep (hunt): Vientiane read 6.6–16.1 across 4 sensors, and Luang Prabang 2.8 vs 3.0. Uptime **not measured**. Freshness
~1 min. **Overall: high** for Vientiane (5 agreeing sensors). **High** for Luang Prabang per the hunt, though only two
sensors, so I'd read it as **medium-high**. **Shows:** community estimate with a range, no chip, WHO line.

### Metro Manila (Philippines)

From Metro Manila's point, the 28 Sep capture has **4 outdoor AirGradient sensors within 10 km**: Manila Observatory
(0.0 km; 20.5 / 33.1), Tivoli (5.0 km; 49.1 / 36.3), Valle1 (6.6 km; 13.0 / 28.1) and "Sensor 1" (7.4 km; 44.1 / 28.6).
Robinson's Equitable Tower (5.5 km) is **indoor and dropped**. COVERAGE.md's table says "1 / 7". The two counts come from
different points and snapshots, so recount on the next capture. No official anchor (EMB is blocked), uptime **not
measured**. The Manila Observatory host is a research institute (a trust positive). **Overall: medium.** **Shows:**
community estimate with a range, DENR DAO categories. The denser Breathe Metro Manila network (43 Clarity nodes) needs a
data-sharing agreement.

### Balikpapan (Indonesia): sensors exist, licence pending

| sensor | network | hardware | dist. | owner | out/in | uptime | freshness | agreement | trust |
|---|---|---|---:|---|---|---|---|---|---|
| Gunung Sari Ilir – Nafas (77270) | AirGradient world API (Nafas-operated) | O-1PS, single PMS5003 | 3.7 km | Nafas (air-quality company) | outdoor | not measured | 2–3 min | raw 32.3 (RH 53%) vs ISPU Balikpapan Baru 24-h **29.45**: same range, but raw vs 24-h isn't like-for-like | **Medium** |
| Karang Joang – Nafas (77242) | same | O-1PS | 7.4 km | Nafas | outdoor | not measured | 2–3 min | raw 9.0 (RH 47%), much lower. Plausible for a quieter area, unconfirmed | **Medium** |

Neither is in AirGradient's EPA-corrected map feed, so we'd have to correct them ourselves. **Nafas's licence is
unverified.** **Overall: medium, not usable yet.** **Shows:** ISPU 24-hr only, plus a note that community sensors exist
and are waiting on Nafas's licence. **No data from these sensors is shown until Nafas confirms.**

### Makassar (Indonesia)

One Nafas sensor, "Antang – Nafas" (O-1PS, outdoor), **6.3 km** out, live, raw only. It's alone and under the same
licence question. **Trust: low (single, unlicensed).** **Shows:** BMKG Maros 1-hr (22.6 km). Makassar is already hourly.
The sensor isn't used.

### Bandung and Surabaya (Indonesia): university sensors, unreadable

Both cities' community stations are visible only on **IQAir's public web page**. IQAir's API needs a paid key and its terms
forbid redistribution, so hardware, outdoor status, coordinates, uptime and freshness are all **unverified**.

| city | stations listed by IQAir | notable |
|---|---|---|
| Bandung | 6 from 5 contributors: Jl. Ganesha No.10, Setra Duta, Setra Duta 2, Ateson Home Bandung, idsMED – BDG – Setrasari, VALUESTREAM-SS22-MASAGO | **Jl. Ganesha 10 is ITB's campus address** (likely university-run, unverified) |
| Surabaya | 5 from 4 contributors: ITS Geomatics, ITS Teknik Lingkungan, SAQI Keputih Permai, Graha Surabaya Barat, idsMED – SBY – Pucang | **Two are named for ITS departments** (a public university) |

**Trust: low, because unverifiable** (not because the stations look bad). **Shows:** Bandung gets ISPU 24-hr (Saguling
14.8 km). Surabaya has no official station within 25 km (Mojokerto 35 km). Both carry a note that university sensors exist.
**Route:** email ITB and the ITS Geomatics / Environmental Engineering departments directly, not IQAir.

### Ho Chi Minh City (Vietnam)

| sensor | network | dist. | value (30 Sep) | notes |
|---|---|---:|---:|---|
| CMT8 (860) | AirGradient, O-1 series | 6.1 km | 26.5 (28 Sep: 24.5 / 21.4) | owner unlabelled |
| SSIS (11611954) | AirGradient | 14.1 km | 16.6 | international school. Outside 10 km |
| S.C. #20419 | Sensor.Community, SDS011 | 21.1 km | 4.65–5.2 raw | too far, and the gap with AirGradient is unexplained |

No official anchor (CEM is CAPTCHA-walled, the US consulate monitor is dead). Uptime **not measured**. **Trust:
low-medium.** Only one sensor inside 10 km. **Shows:** "Not available yet" (needs CEM permission, or one more sensor within
10 km).

### Hanoi (Vietnam)

Official Hanoi stations (moitruongthudo.vn) give the number. Sensor.Community adds **2 PM locations 5.6–7.6 km out**
(Hà Nội 16009215: 10.4 at 99.9% RH on 28 Sep, now dropped by the humidity rule; Quang Ba 71747021: 7.2). They corroborate
but aren't needed. **Shows:** official 1-hr.

### Phnom Penh (Cambodia)

Kok Roka (1778385) **14.3 km**, 14.1 µg/m³, and Civil Engineering NPIC (1784835) **14.7 km**, 13.4. Both O-1PST, about
0.4 km apart, agreeing. **Trust: low-medium** (agreeing pair, but both outside 10 km). **Shows:** "Not available yet". Fix:
one sensor nearer the centre.

### Davao (Philippines)

"Illumina" (ag:16313337), outdoor, **19.4 km** from the city point. **344/336 hourly buckets over 14 days** (no downtime),
1 zero hour of 336, ~10 min fresh. No official anchor. **Trust: medium-high as a sensor, but unusable**: alone, and
outside 10 km. **Shows:** "Not available yet".

### Yangon (Myanmar)

ag:11907081, O-1PST, firmware 3.7.0, outdoor, **4.1 km**. **176/168 buckets over 7 days**, 2 zero hours. It **recovered
from the flat 0.0 fault seen on 28 Sep** and now shows a believable night-time rise (23.5 → 41.5). No official anchor.
**Trust: medium, but single.** **Shows:** "Not available yet" (needs a second sensor).

### Near-misses: Vang Vieng (Laos) and Koh Chang (Thailand)

| place | sensor | dist. | value | trust | why not covered |
|---|---|---:|---:|---|---|
| Vang Vieng | "Vangvieng – Vientiane" (1135) | 11.5 km | 2.4 (30 Sep) | plausible, single | 1.5 km past the 10 km line, and alone |
| Koh Chang | "Trat" (AirGradient) | 30.1 km | not recorded | n/a | 30 km off the island, and alone |

---

## 3. Future hyperlocal: Singapore's 14 sensors

**Not used today.** Singapore's number is NEA's official 1-hr reading, and that won't change. This section rates the 14
outdoor AirGradient sensors for a possible future street-level layer. Captured 30 Sep, ~08:04 UTC. "Eco Botanic" is in
Johor and is excluded (cross-border). All are AirGradient "Open Air" family (O-1P / O-1PS / O-1PST / O-1PST-CE). Agreement
is coarse: NEA has 5 regional stations, so this is "same order as the region", not a point-to-point check.

| sensor | model | 14-day uptime (hourly buckets) | zero/stuck | 04–06 UTC trend (µg/m³) | vs NEA region | trust |
|---|---|---|---|---|---|---|
| Midwood | O-1PS | 344/336 (~100%) | 0 | 45.5 → 45.4 → 55.1 | central, plausible | **High** |
| Potong Pasir | O-1PST | 344/336 | 0 | not sampled | central | **High** (uptime) |
| Shelford | O-1PST | 344/336 | 0 | not sampled | south/central | **High** |
| CGB | O-1P | 344/336 | 0 | 30.7 → 29.4 → 28.0 | south, in range | **High** |
| Alexandra Canal | O-1PST | 344/336 | 0 | 52.5 → 58.0 → 52.4 | south, a slightly hot pocket | **High** |
| Marine Terrace | O-1PST | 344/336 | 0 | steady | east | **High, with a flag**: one **464.7 µg/m³ spike on 18 Sep 14:00 UTC**. The new plausibility guard's ">400 jump in an hour" rule would catch this if applied to crowd history |
| Sembawang | O-1PST-CE | 335/336 (~99.7%) | 0 | 43.3 → 42.1 → 46.0 | north (NEA 30), same order | **High** |
| Joo Chiat Place | O-1PST | 340/336 | 0 | 56.3 → 52.4 → 30.8 | east, converging on NEA's 39 | **High** |
| Marina Bay | O-1PST | 284/336 (~85%) | 0 | 59.9 → 60.8 → 31.1 | south, runs hot | **Medium-high** |
| "Singapore" (Bugis area) | O-1PST | 265/336 (~79%) | 0 | not sampled | central | **Medium-high** |
| Jalan Tembusu | O-1PST | 138/336 (~41%) | 0 | 75.4 → 63.3 → 32.3 | east, runs hot | **Medium**: frequent gaps |
| Nathan Rd | O-1PST | 25/336 (~7%) | 0 | 42.9 → 33.4 → 43.4 | central/south | **Low**: too little history |
| NUS Science A | not resolved | 13/336 (~4%) | effectively offline | 0.7 → 0 → 1.4 → 2.3 | south | **Low** |
| NUS Science B | not resolved | 4/336 (~1%) | n=4 | 17.3 → 16.6 → 16.6 (flat) | south | **Low** |

**The NUS pair disagree.** NUS Science A and B sit about 10 m apart, yet when both report they differ by about **10×**
(1.4–1.8 vs 16.6–17.3 µg/m³). Distance can't explain that. It points to siting (one sheltered, or on a rooftop) or
calibration. Neither should be trusted alone until the NUS / AirGradient team checks them.

**Summary:** 8 of 14 are high-trust today, Marina Bay and "Singapore" are usable, Jalan Tembusu is usable but gappy, and
Nathan Rd and both NUS units aren't ready.

---

## 4. At a glance

| place | overall trust | what HazeNow shows | what would raise trust |
|---|---|---|---|
| **Pai** | Medium | Community sensors only: estimate with a range + "no official station within 25 km to check against" | Log a week of hourly uptime in the proxy before launch; a DustBoy/CCDC (Chiang Mai University) anchor via its sanctioned API; a PCD station in Pai |
| **Siem Reap** | Medium | Community sensors only: estimate, no chip, WHO line | A second AirGradient unit; a week of logged uptime; any Cambodian official feed |
| **Johor Bahru** | Medium (one sensor) | DOE 24-hr API row + hourly estimate from Iolite when fresh | A week of Iolite logging before public launch; 2–3 more JB sensors |
| **Kuala Lumpur** | High | Estimate with a range + DOE API row | Ongoing `k` fit against DOE's 24-h figure |
| **Bali (Canggu, Seminyak, Denpasar, Kuta, Ubud)** | Medium-high | Estimate with a range (no ISPU row while Sempidi is offline) | Sempidi back online; a BMKG 1-hr station on Bali |
| **Sanur, Jimbaran, Uluwatu** | Medium | Estimate with a range | More sensors; uptime logging |
| **Nusa Dua** | n/a | Not available yet (Sempidi offline, no sensor within 10 km) | Sempidi recovering, or one sensor in Nusa Dua |
| **Vientiane** | High | Estimate, no chip, WHO line | UNICEF / AirGradient courtesy agreement |
| **Luang Prabang** | Medium-high | Estimate, no chip, WHO line | A third sensor |
| **Metro Manila** | Medium | Estimate with a range, DENR categories | Breathe Metro Manila / Clarity agreement; EMB feed |
| **Balikpapan** | Medium, not shown | ISPU 24-hr only + note (Nafas licence pending) | Nafas licence; our own EPA correction on the raw feed |
| **Makassar** | Low (single, unlicensed) | BMKG 1-hr (sensor not used) | Nafas licence + a second sensor |
| **Bandung, Surabaya** | Low (unverifiable) | ISPU 24-hr (Surabaya: none within 25 km) + note about university sensors | Direct data agreements with ITB and ITS |
| **Ho Chi Minh City** | Low-medium | Not available yet | One more sensor within 10 km, or CEM permission |
| **Phnom Penh** | Low-medium | Not available yet | A sensor nearer the centre |
| **Davao** | Medium-high sensor, unusable | Not available yet | A second sensor within 10 km of the city |
| **Yangon** | Medium, single | Not available yet | A second sensor |
| **Vang Vieng, Koh Chang** | n/a | Not available yet | Sensors in town / on the island |
| **Cameron Highlands** | n/a (no sensors) | Needs permission (MET Malaysia's TEOM monitor) | A live feed from MET Malaysia |
| **Singapore (future hyperlocal)** | 8 high, 3 not ready | Not used (NEA only) | Fix or retire the NUS pair; bounds-check spikes like Marine Terrace's |

**The single most useful next step across all of this:** have the proxy log every sensor it uses, hourly, for at least a
week before public launch, and publish the uptime and the agreement with the nearest official station alongside this
report. That turns most of the "not measured" cells above into numbers.
