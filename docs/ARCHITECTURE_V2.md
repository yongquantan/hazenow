# HazeNow v2: data-fusion architecture

Status: proposal (research 2026-09-28). Evidence for every source is in
[DATA_SOURCES.md](DATA_SOURCES.md). Hardware is covered in [DIY_SENSOR.md](DIY_SENSOR.md).

## 0. Goals and principles

1. **NEA is the anchor.** It is the only reference-grade (FEM) data in Singapore. Every other source is
   calibrated *to* NEA and never shown *instead of* NEA without a label.
2. **Shortest honest delay.** Show the freshest number we can defend, and always show its age.
3. **Serverless by default.** Every client must work with zero HazeNow infrastructure, as in v1.
   Optional infrastructure only adds things.
4. **No keys in clients** for anything paid or rate-limited per key.
5. Calm tone. A crowd-sensor estimate is labelled "est." and never overrides an official band
   silently.

## 1. Layers (freshest wins, if it is trustworthy)

```
             latency                      density            trust
L0  NEA 1-hr PM2.5 (5 regions)   ~1 min after the hour (1-h avg)   5 pts          reference
L1  Crowd sensors, bias-corrected    1-3 min                      ~12 good pts   calibrated to L0
L2  Personal sensor (LAN)            2-120 s                      your balcony   calibrated to L0/L1
L-  Models (CAMS/Open-Meteo, Google) hourly, forecast             grid          display-only "forecast"
```

The output `Snapshot` (SPEC §7) gains these fields (additive, so v1 clients ignore them):

```ts
nowcast?: {
  pm25: number                 // best "right now" estimate at your spot, µg/m³
  band: Band
  instantPsi: number
  source: "personal" | "crowd" | "nea"
  asOf: ISO8601                // measurement time of the freshest input
  confidence: "high" | "medium" | "low"
  contributors: { id: string, kind: "nea"|"airgradient"|"purpleair"|"personal",
                  distanceKm: number, raw: number, corrected: number, weight: number }[]
}
personal?: { pm25: number, corrected: number, rh: number|null, indoor: boolean, asOf: ISO8601, deviceId: string }
```

The **big number** stays the NEA 1-hr PM2.5 at your spot, unless a nowcast with confidence ≥ medium
exists. Then the big number becomes the nowcast, labelled "Now · est. from N sensors". NEA's
number moves to line 2 as "NEA 1-hr (4pm)". A personal sensor always gets its own row: "Your
sensor: 132".

## 2. L0: NEA, fetched faster

**Poll at the right time.** Verified across the 17:00 publication today (DATA_SOURCES §1.1): both
`api.data.gov.sg/v1/environment/pm25` and `api-open.data.gov.sg/v2/real-time/api/pm25` served the
new hour at **17:00:56–17:00:59**. v2 then re-publishes the same hour at ~:30 and ~:45 and overwrites
`updatedTimestamp` (16:00 went `16:30:40` → `16:45:57`, same values). SPEC's "~30 min later" and its
":20–:50" poll window are an artefact of that re-stamping, and they cost ~20 min every hour.

- **Cadence:** every 1 min from :01 until the new `timestamp` appears (max :10), then every 5 min to
  :50 (back-fills), else every 15 min. Widgets: request a refresh at ~:03.
- **Second source:** v1 (NEA's own haze.gov.sg calls it) has a stable first-publish `update_timestamp`
  and no per-IP limit (15 rapid calls → 15 × 200. v2 returned `429` after 4). Use it to fill gaps when
  v2 is rate-limited, and for `publishedAt`. It is legacy, so never depend on it alone.
- **Merge rule:** per hour, prefer v2's value when present (back-filled: at 15:00 today v1 had no
  `south`, v2 later had `106`), else v1's. `publishedAt` = earliest stamp seen. Expose
  `revisedAt` = v2's `updatedTimestamp`.

Result: HazeNow's "now" becomes ~31–35 min old at best (the midpoint of the averaging hour plus ~1 min),
instead of ~50–75 min. Beating that needs L1/L2.

## 3. L1: crowd sensors, bias-corrected against NEA

### Sources (v2 scope)
- **AirGradient public map**: 14 live outdoor sensors in SG today, CC BY-SA 4.0, no key, ~1-min
  cadence, hourly history endpoint available, already EPA-corrected. **Primary.**
- **PurpleAir**: count in SG unverified (needs a key). Paid points. Only through the optional
  Worker (§5).
- WAQI crowd markers (6 live "A…" stations in SG). The public API needs a token, and the terms
  forbid redistribution. **Not used.**

### Algorithm (runs in the client, identical in TS/Swift/Kotlin)

For each crowd sensor *s* with coordinates, and each NEA region *r*:

1. **Physical correction.** `c = EPA(pa_cf1, rh)` (piecewise formula in DATA_SOURCES §2). Skip this if
   the source already corrects (the AirGradient map `pm25` is corrected. The world API `pm02` is raw).
2. **Hourly alignment.** From the source's hourly history, take `S_h` = mean corrected value over the
   hour ending *h* (NEA's `timestamp` is the *end* of the averaging hour: NEA "16:00" ↔ AG bucket
   `07:00Z`–`08:00Z`).
3. **Local bias factor** vs the nearest valid NEA region `r(s)` (IDW-interpolated NEA value at the
   sensor's location is better, and the same code as SPEC §1):
   `k_s = median over last 24 h of ( NEA_h(at s) / S_h )`, using only hours where both > 10 µg/m³.
   Require ≥ 6 hour-pairs. Clamp `k_s` to [0.5, 2.0].
4. **Quality gates** (drop the sensor if any fails):
   - offline, or last measurement > 15 min old
   - fewer than 6 hour-pairs, or the IQR of the ratio > 0.5 (erratic)
   - `k_s` outside [0.5, 2.0] before clamping (probably indoor, sheltered, or broken. Today:
     CGB 0.43 → k 2.3, NUS Science 0.16–0.48, Sembawang 1.54 → k 0.65 (kept))
   - co-located duplicates (same coordinates to 4 d.p.): keep the one with the lowest ratio IQR
   - model string starting with `I-` (indoor)
5. **Nowcast value per sensor:** `n_s = k_s × c_now`.
6. **Blend at the user's location** (IDW, power 2, haversine), over crowd sensors within 8 km plus
   the NEA regions as pseudo-sensors, with weights:
   `w = (1/d²) × q`, where `q = 1.0` for crowd sensors < 10 min old, `q_NEA = 0.5 × exp(-age_min/60)`.
   So when crowd data is fresh, it dominates. When the crowd is thin or stale, the NEA value carries it.
7. **Confidence:** high = ≥ 3 sensors within 5 km and their `n_s` agree within ±25 %. medium = ≥ 1
   sensor within 5 km. low = otherwise (low → don't replace the big number).
8. **Sanity clamp:** the nowcast may not differ from the latest NEA value at your spot by more than
   ×2.5 / ÷2.5 unless ≥ 3 sensors agree. Haze fronts move fast, but not that fast across 1 hour.

Today's evidence (DATA_SOURCES §3.2): after EPA correction, 7 of 14 SG AirGradient sensors had a
median hourly ratio vs the nearest NEA region of 0.97–1.07 over 16 hours. Three were clearly biased,
and the three NUS sensors were unusable. So step 3 is necessary, and step 4 matters.

### Why not just trust the crowd raw?
At 16:35 raw AirGradient `pm02` ranged from 25 to 178 µg/m³ across sensors 1–3 km apart, while NEA
regions read 83–117. Raw crowd data would make the headline jump by ±50 % every refresh.

## 4. L2: personal sensor overrides

- Discovery: mDNS `_airgradient._tcp` (native apps only), or the user types an IP/hostname, or
  picks their sensor from the AirGradient map by location ID (works on web too, through the map API).
- Value: `pm02Compensated`, else the EPA formula on `pm02Standard`/`pm02` with
  `rhumCompensated ?? rhum`.
- Personal calibration: the same `k` procedure as L1 (§3.3) against the IDW NEA value, shown to the
  user ("Your sensor reads 12 % high vs NEA over the last day; adjusted").
- If `model` starts with `I-` or the user flags it as indoor, show it as **"Indoor"** on a separate
  row and **never** as the outdoor headline. Indoor air during haze with windows shut and a purifier
  running is the whole point of the advice, so it is useful, but it is a different number.
- Outdoor personal sensor < 5 min old with ≥ 6 h of calibration → it becomes the big number
  (`source: "personal"`, confidence high). With < 6 h, use it with `k = 1` and confidence medium.

## 5. Optional Cloudflare Worker ("hazenow-edge")

Everything above runs fully client-side against NEA (CORS `*`) plus the AirGradient map API.
**Problem:** the AirGradient endpoints return **no `Access-Control-Allow-Origin`**, so the
**web/PWA cannot call them directly**. Native apps, widgets, CLI and HA can.

| Concern | Serverless only | With optional Worker |
|---|---|---|
| NEA data | direct, CORS `*` | Worker caches 60 s, so one upstream call serves everyone |
| data.gov.sg v2 per-IP limit (6 req/10 s, `429` code 24) | Risky behind CGNAT (SG mobile carriers) and office NAT: many users share one IP | Worker uses one **data.gov.sg API key** (production tier: 30 req/10 s) and caches. Clients never hit the limit |
| AirGradient crowd layer on **web** | impossible (no CORS) | Worker proxies `/crowd?bbox=` plus hourly history, adds CORS, caches 60 s |
| AirGradient on native | direct | direct or Worker (Worker reduces 14 history calls to 1) |
| PurpleAir | impossible without shipping a paid key in the client | Worker holds the single key, queries the SG bbox every 2–10 min, caches. Cost scales with the refresh rate, **not** with users |
| Bias factors `k_s` | each client computes them (needs 24 h history, ~15 extra requests on cold start) | Worker computes once per hour, serves `/crowd` with `k_s` and QC flags precomputed |
| **Push alerts** ("PM2.5 at your spot crossed 150") | impossible to do reliably. iOS background fetch is at the OS's discretion. Android WorkManager ≥ 15 min | Worker Cron (every 1–5 min) + Durable Object/KV of subscriptions → Web Push (VAPID), APNs, FCM. The only way to alert within minutes |
| Telegram bot | needs its own host anyway | same Worker |
| Privacy | nothing leaves the device | push subscriptions store a coarse region (not GPS). No accounts |
| Cost | $0 | Workers free tier (100k req/day) covers ~thousands of users with 60 s caching. PurpleAir adds about US$ a few/month at a 5-min SG bbox refresh (verify with their points calculator) |
| Failure mode | none added | **clients must fall back to direct NEA** if the Worker is down. The Worker is never on the critical path |

**Recommendation:** ship v2 clients serverless-first (NEA v1+v2 plus AirGradient direct on native).
Add the Worker as an **optional accelerator** in this order: (1) CORS proxy + cache for AirGradient
so the web gets the crowd layer, (2) data.gov.sg API key + cache, (3) push alerts, (4) PurpleAir.
Configure it with one URL constant (`HAZENOW_EDGE=https://edge.hazenow.app`). If unset or failing,
clients behave exactly like v1.

Worker endpoints (sketch):
```
GET /v1/nea/pm25?date=      → merged v1+v2, cached 60 s
GET /v1/nea/psi             → cached 60 s
GET /v1/crowd?bbox=         → [{id, lat, lon, source, corrected, rh, asOf, k, qc:"ok"|"indoor"|"erratic"|"stale"}]
GET /v1/nowcast?lat=&lon=   → the Snapshot.nowcast object (for dumb clients: SwiftBar, Telegram, HA)
POST /v1/push/subscribe     → {region|geohash5, threshold, channel, token}
```
Attribution passthrough: the Worker must return `attribution` strings ("Data: NEA via data.gov.sg",
"AirGradient contributors, CC BY-SA 4.0", "PurpleAir") and clients must display them.

## 6. What we explicitly do NOT use as "now"

- **Models** (Open-Meteo/CAMS, Google AQ): at 16:00 today Open-Meteo said 32.6 µg/m³ and
  *falling*, while NEA measured 105–117 and rising. Use them only for an optional "forecast trend"
  line, labelled as a model.
- **Himawari AOD**: column aerosol, not surface PM2.5. Clouds blind it (NEA's own update says the
  extent "could not be determined due to extensive cloud cover"). Useful as a "smoke plume nearby"
  map layer at most.
- **WAQI/IQAir**: they re-publish NEA (WAQI's SG stations were still at the 14:00/15:00 hour at 16:40)
  plus crowd sensors we can get first-hand. Their licences don't allow redistribution.

## 7. Rollout

| Step | Change | Clients | Infra |
|---|---|---|---|
| v1.1 | Poll from :01 (not :20). Merge v1 as a secondary source. Handle 429. Fix advice wording (DATA_SOURCES §5) | all | none |
| v2.0 | AirGradient crowd layer + nowcast (native, CLI, HA). Personal AirGradient via LAN | native | none |
| v2.1 | Worker: CORS/cache proxy, so the web gets the crowd layer | web | Worker (free) |
| v2.2 | Push alerts | all | Worker Cron + DO |
| v2.3 | PurpleAir via Worker key | all | Worker + ~US$/month |

## 8. Test vectors to add to SPEC (v2)

- EPA(pa=140, rh=58) = 0.786·140 − 0.0862·58 + 5.75 = **110.8**
- EPA(pa=25, rh=80) = 0.524·25 − 6.896 + 5.75 = **11.95**
- EPA(pa=300, rh=any) = 2.966 + 207 + 79.56 = **289.5**
- Bias: NEA series [100, 110, 90] vs sensor [80, 88, 72] → k = 1.25. Sensor now 120 → nowcast 150.
- Personal sensor with model "I-9PSL" never sets `nowcast.source = "personal"`.
