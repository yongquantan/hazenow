# Vietnam, Cambodia, Laos coverage hunt: the "Not available yet" / "Needs permission" places

Countries: **Vietnam, Cambodia, Laos**. Scope: every VN/KH/LA place in `packages/core/src/countries/places.ts`
marked `needs_permission` or `not_feasible` — Ho Chi Minh City, Da Nang, Hoi An, Hue, Nha Trang, Da Lat, Ha Long,
Sapa, Phu Quoc (VN); Phnom Penh, Siem Reap, Sihanoukville, Kampot (KH); Vang Vieng (LA) — plus a sanity re-check
on the two LA places that already show `needs_proxy`/crowd-only (Vientiane, Luang Prabang) and on Hanoi (context
only, already covered). All live calls below were run **2026-09-30, ~08:00–08:20 UTC (15:00–15:20 ICT)**, one
polite client (`HazeNow-research/0.1 (+https://github.com/yongquantan/hazenow; free open-source haze app)`),
one request per endpoint, robots.txt checked first where it mattered. Output written only to this file and
`vn-kh-la.json`; no code touched.

**Hard rule respected: CEM (`cem.gov.vn`, `tedp.vn`, `envisoft.gov.vn`, `dubao.envisoft.gov.vn`) was not contacted
at all today.** That WAF flagged this IP on 2026-09-29 (vietnam.md round 2); its route is the permission request
already drafted there, not another probe. Every VN "needs_permission" verdict below inherits that finding as-is.

## TL;DR

- **CEM is the wall behind every Vietnamese "Not available yet" and "Needs permission" place**, and it stays
  that way today — untouched, per the hard rule. Nothing in the CEM story has changed since vietnam.md round 2:
  no open "now" endpoint, no licence, permission request already drafted (English + Vietnamese) but not yet sent
  by a human. **HCMC and Da Nang are the two CEM places with any crowd fallback at all; the other six Vietnamese
  destinations (Hoi An, Hue, Nha Trang, Da Lat, Ha Long, Sapa, Phu Quoc) have literally no community sensor
  within hundreds of kilometres**, so for them CEM permission (or a brand-new sensor deployment) is the *only*
  path — there is no interim crowd fix to recommend.
- **Ho Chi Minh City: still crowd-only, and still thin.** AirGradient has 2 outdoor sensors (CMT8 6.1 km, SSIS
  14.1 km from the picker's point) — only 1 inside the house 10 km rule, so it doesn't clear the "≥2 sensors"
  bar on its own. New today: Sensor.Community now has **1 PM sensor in HCMC** (21.1 km out, too far to help).
  **Verdict unchanged: community-only, trust low-medium, real fix is still CEM permission or one more sensor
  within 10 km.**
- **Phnom Penh is a genuine near-miss.** Its 2 AirGradient sensors (Kok Roka 14.3 km, Civil Engineering/NPIC
  14.7 km from the picker's point) both sit just past the 10 km cutoff, not the 25 km one — they're 4–5 km over.
  Cambodia's MoE still publishes nothing (its one air-quality document is dated **April 2019**, and no dashboard
  subdomain resolves), so the practical unlock isn't a government feed, it's either a slightly different city
  point (both sensors are ~4 km apart, near ITC/NPIC south of the river) or one more sensor closer to the
  centre.
- **Siem Reap is a candidate upgrade.** Two *independent* low-cost networks now agree there: AirGradient "Mondul
  2" (1.6 km, EPA-corrected, 19 µg/m³) and Sensor.Community 98715 (2.7 km, raw SDS011, ~20.5 µg/m³ P2). That's
  real cross-network corroboration, which is more than most crowd-only places in this region get — but it's
  still only one physical unit per network, so hardware-fault risk isn't retired. Recommend **trust: medium**,
  a genuine candidate for `community_only` rather than `not_feasible`, pending a instructions-level decision on
  whether a different-network sensor counts toward the "≥2 sensors" rule.
- **Vientiane and Luang Prabang remain the region's strongest crowd stories** — 5+ and 2 sensors respectively
  within 10 km today, all agreeing within a plausible range, UNICEF/AirGradient CC BY-SA. No change needed.
  **Vang Vieng stays just short**: its one sensor is 11.5 km out (unchanged from COVERAGE.md), 1.5 km past the
  10 km cutoff and still alone — Laos's MONRE site is now worse than "suspended", it resets the connection.
- **US Embassy/Consulate monitors (AirNow) are confirmed dead for this region today, not just historically.**
  `dosairnowdata.org` still doesn't resolve, and `airnow.gov` has **no** international/embassy page left (every
  guessed URL 404s). Don't build on this source for HCMC, Hanoi, Phnom Penh or Vientiane.
- **Da Nang and Quang Ninh (Ha Long) provincial portals could not be located.** No plausible subdomain resolved
  by DNS, `danang.gov.vn`'s root 403'd for both a declared research UA and a full browser UA, and
  `quangninh.gov.vn` timed out. This session's web-search tool had already exhausted its budget (used by other
  agents in the swarm) and a DuckDuckGo HTML fallback came back empty — so these two portals are **unverified**,
  not confirmed absent. Worth a retry with a working search tool or a human pointing at the right URL.
- **PurpleAir, IQAir, PAM Air: all still gated, no change.** PurpleAir's own `robots.txt` disallows all bots on
  `api.purpleair.com` (its data host) — respected, no attempt to extract the map's embedded key. IQAir returned
  429 (rate-limited) today; its no-redistribution terms stand regardless per REGIONAL.md's prior finding. PAM
  Air's API page is still explicitly partner-only, no public tier, no pricing.

## Method

1. Re-read `docs/sea/COVERAGE.md` (incl. "Popular destinations"), `docs/sea/vietnam.md` (incl. "HCMC / CEM
   access, round 2"), `docs/sea/cambodia-laos-myanmar.md`, and `packages/core/src/countries/places.ts`,
   `sources/hanoi.ts`, `sources/airgradient.ts` for the existing model and adapters.
2. Pulled the **AirGradient map API** for the full SEA bbox (`map-data-int.airgradient.com/map/api/v1/measurements/current/area`,
   608 rows today: 414 AirGradient, plus OpenAQ and Sensor.Community rows) and computed haversine distance from
   every target place to every live outdoor AirGradient row, same-country only (checked by station name/region,
   e.g. Lao school names in Houaphan/Sekong/Luangprabang provinces were excluded from Vietnam distances even when
   geometrically closer, per the cross-border rule).
3. Queried **Sensor.Community's** country filter for `VN`, `KH`, `LA`
   (`data.sensor.community/airrohr/v1/filter/country=XX`) — 9 VN rows (3 locations with PM values: 1 HCMC, 2
   Hanoi; 2 locations temp/humidity-only), 2 KH rows (1 Siem Reap location), 0 LA rows.
4. Re-pulled **`moitruongthudo.vn/api/site`** (Hanoi) to confirm it still only lists 4 Hanoi stations (no
   coverage elsewhere) — today all 4 show a fresh `aqi_time` of 30-09-2026, an improvement on COVERAGE.md's
   stale #14/#15.
5. Tried **`dosairnowdata.org`** (4 city RSS paths) and several **`airnow.gov`** international/embassy URLs —
   all failed (DNS or 404) — to confirm the US Embassy/Consulate AirNow story is still dead.
6. Checked **PAM Air**'s API page and (missing) `robots.txt`, **IQAir**'s terms/API pages, and
   **PurpleAir**'s `api.purpleair.com` + `map.purpleair.com` `robots.txt`, without logging in, paying, or
   extracting any embedded key.
7. Fetched **Cambodia's MoE homepage** (`moe.gov.kh`, 200, `robots.txt` allows all) directly and via WebFetch,
   and tried 5 plausible dashboard-subdomain guesses (`camaqm.info`, `airquality.gov.kh`, `aqm.moe.gov.kh`,
   `data.moe.gov.kh`, `doe.gov.kh`) — none resolved.
8. Re-tried **Laos's MONRE** (`monre.gov.la`) — today it doesn't even serve the "suspended page" cPanel notice
   from COVERAGE.md, the TLS connection resets.
9. Tried 8 plausible Da Nang / Quang Ninh environment-department subdomains (mirroring HCMC's
   `sonnmt.hochiminhcity.gov.vn` naming) — none resolved; tried the provincial portals directly — blocked/timeout;
   tried a DuckDuckGo HTML search as a fallback for the exhausted WebSearch budget — returned an empty page.

## Vietnam

### Ho Chi Minh City — needs_permission (unchanged)

| source | sensor | distance from picker point (10.8231, 106.6297) | value today | age |
|---|---|---:|---:|---|
| AirGradient | CMT8 (id 860) | 6.1 km | 26.5 µg/m³ (EPA-corrected) | ~1 min |
| AirGradient | SSIS (id 11611954) | 14.1 km | 16.6 µg/m³ (EPA-corrected) | ~1 min |
| Sensor.Community | 20419 (10.658, 106.724) | 21.1 km | P2 4.65–5.2 µg/m³ raw (SDS011, no RH correction) | ~1 min |
| AirNow US Consulate (HC1010001) | — | — | not reporting (confirmed again: `dosairnowdata.org` doesn't resolve) | — |
| CEM | — | — | **not contacted (hard rule)** | — |

**Trust: low-medium.** Only CMT8 clears the 10 km house rule; SSIS is corroboration, not a countable second
sensor. Both are AirGradient "Small Sensor" units (O-1 series, Plantower PMS5003-family per REGIONAL.md), outdoor,
EPA-corrected on the map API, ~1 min fresh. SSIS is an international-school-hosted unit (institutional owner,
plausible maintenance); CMT8's owner is unlabelled. The two disagree by ~10 µg/m³ over 8 km, which is a
plausible intra-city gradient in a city this size, not obviously a fault — but there's no official anchor
(CEM/AirNow both dark) to calibrate against, so `k` stays uncalibrated per `crowd.ts`'s own convention for
un-anchored countries. No 7–30 day uptime history was pulled this session (single live snapshot only).

**Verdict: community only (trust: low-medium).** What would unlock a real number: either one more live outdoor
sensor within 10 km of the picker point (SSIS already exists at 14.1 km — moving 4 km closer would do it), or
the CEM permission already requested (draft in `vietnam.md`). No new action taken toward CEM today, per the hard
rule.

### Da Nang, Hoi An, Hue, Nha Trang, Da Lat, Ha Long, Sapa, Phu Quoc — needs_permission / not_feasible (unchanged, no interim fix exists)

| place | nearest same-country crowd sensor | km | nearest official (any network) |
|---|---|---:|---|
| Da Nang | AirGradient OceanPark (Hanoi) | 598.5 | none (CEM only, blocked) |
| Hoi An | AirGradient CMT8 (HCMC) | 594.5 | none |
| Hue | AirGradient OceanPark (Hanoi) | 532.7 | none |
| Nha Trang | AirGradient CMT8 (HCMC) | 319.2 | none |
| Da Lat | AirGradient CMT8 (HCMC) | 233.4 | none |
| Ha Long | AirGradient OceanPark (Hanoi) | 118.0 | none (a Sensor.Community box 30.8 km out reports only temperature/humidity, no PM board active) |
| Sapa | Sensor.Community 92730 (Hanoi) | 248.4 | none |
| Phu Quoc | AirGradient CMT8 (HCMC) | 303.0 | none |

(Distances exclude Lao AirGradient sensors that are geometrically closer to Da Nang/Hoi An/Hue — e.g. Dakcheung
Secondary School, Sekong, ~119–169 km away — because they're a different country and the cross-border rule
forbids using them.)

**Trust: n/a — no candidate source found for any of these 8 places.** Every one is hundreds of kilometres from
the nearest same-country crowd sensor. **Verdict: authoritative permission is the only way — CEM (`cem.gov.vn`),
via the request already drafted in `docs/sea/vietnam.md`.** Even that comes with a caveat worth flagging to
`main`: CEM's known station list (≥20 automatic stations, round 1) has never been confirmed to include Sapa or
Phu Quoc specifically — permission might unlock HCMC/Hanoi/Da Nang but still leave these two with no physical
station to show, in which case the real fix is a new deployment, not just an agreement.

### Hanoi — needs_proxy (context only, not a target; re-verified fine)

`moitruongthudo.vn/api/site` still lists exactly 4 stations, all in Hanoi (no coverage anywhere else — this
was checked specifically because the brief asked "whether it covers other places"; it does not). All 4 show a
fresh reading today (30-09-2026), an improvement on COVERAGE.md's stale #14/#15. Sensor.Community adds 2 more
PM-bearing locations 5.6–7.6 km out, corroborating. No change to Hanoi's status.

## Cambodia

### Phnom Penh — not_feasible (near-miss, worth a second look)

| source | sensor | distance from picker point (11.5564, 104.9282) | value today |
|---|---|---:|---:|
| AirGradient | Kok Roka (id 1778385) | 14.3 km | 14.1 µg/m³ |
| AirGradient | Civil Engineering, NPIC (id 1784835) | 14.7 km | 13.4 µg/m³ |

**Trust: low-medium.** Two independent AirGradient units, both "Small Sensor" (O-1PST, EPA-corrected, per
cambodia-laos-myanmar.md), ~1 min fresh, and they agree closely (14.1 vs 13.4 µg/m³, 0.4 km apart from each
other near the Institute of Technology of Cambodia). That mutual agreement is a real trust signal — but both are
4–5 km outside the 10 km house rule from the specific point in `places.ts`, so today's status (`not_feasible`)
is correct under the current rule. Cambodia's MoE still has nothing live: its only air-quality document is dated
**1 April 2019** (checked again today via WebFetch), no dashboard link anywhere in the nav/footer, no plausible
subdomain resolves, and no email was found on the homepage (only a phone number).

**Verdict: community only, but blocked by geometry, not data.** Two things would each fix it: (a) one AirGradient
sensor closer to the centre (there's already a cluster near ITC/NPIC, so this is plausible), or (b) a product
decision to re-anchor the "Phnom Penh" point a few km south, since the current point is ~14 km from where the
2 sensors already are. Authoritative permission (MoE) is nominally the other route, but the Ministry shows no
sign of building a public feed — the 2019 document and 2018-era "not readily accessible" pattern from the
country doc both stand. **Recommend flagging (a)/(b) to whoever owns `places.ts`/the crowd-radius rule, since no
code was touched here.**

### Siem Reap — not_feasible (candidate upgrade)

| source | sensor | distance from picker point (13.3671, 103.8448) | value today |
|---|---|---:|---:|
| AirGradient | Mondul 2 (id 23403781) | 1.6 km | 19.0 µg/m³ (EPA-corrected) |
| Sensor.Community | 98715 (13.352, 103.864) | 2.7 km | ~20.5 µg/m³ P2 raw (SDS011, no RH correction) |

**Trust: medium.** This is the one place in the whole hunt with **two different crowd networks agreeing**,
both within 3 km of the centre. AirGradient's EPA-corrected 19.0 and Sensor.Community's uncorrected ~20.5 are
close enough to be mutually corroborating (SDS011 without RH correction typically reads a little high in humid
conditions, which is consistent with the small gap here, not contradictory). The catch: each network still has
only **one physical unit**, so a single hardware fault on either sensor wouldn't be caught by that network alone
— the cross-network agreement is the only redundancy there is, and it's incidental (nobody coordinated these two
deployments). No official anchor exists to calibrate against (Cambodia has none).

**Verdict: this is the strongest `not_feasible → community_only` candidate found in the whole hunt.** It doesn't
satisfy the letter of the "≥2 same-network AirGradient sensors within 10 km" rule (COVERAGE.md's rule was written
before Sensor.Community had a Siem Reap point), but it satisfies the spirit — two independent readings, close
together, agreeing. Recommend `main` consider whether cross-network corroboration should count; if not, the
fix-line "one more community sensor in Siem Reap" already in `places.ts` is still accurate and now half-true in a
different network.

### Sihanoukville, Kampot — not_feasible (unchanged, no interim fix exists)

| place | nearest crowd sensor (same country) | km |
|---|---|---:|
| Sihanoukville | AirGradient Civil Engineering, NPIC (Phnom Penh) | 176.9 |
| Kampot | AirGradient Civil Engineering, NPIC (Phnom Penh) | 128.9 |

**Trust: n/a — no candidate source found.** **Verdict: no coverage; would need a new sensor deployment or a
Cambodia government feed, neither of which shows any sign of arriving.** MoE's contact channel (phone only,
`(+855) 23 213 908` / `220 369`) is the only lever, and it's the same "not feasible" call as COVERAGE.md made.

## Laos

### Vientiane, Luang Prabang — needs_proxy / crowd-only (unchanged, re-confirmed strong)

| place | sensors within 10 km | nearest | agreement |
|---|---:|---:|---|
| Vientiane | 4+ (Mahosot Hospital 2.7 km, Saphanthong Village 3.0 km, UNICEF Lao PDR CO 4.6 km, Sathit Secondary 6.7 km) | 2.7 km | 6.6–16.1 µg/m³ across 4 sensors — plausible urban spread, no outliers |
| Luang Prabang | 2 (Santiphab Secondary 0.8 km, Souphanouvong University 6.8 km) | 0.8 km | 2.8 vs 3.0 µg/m³ — tight agreement |

**Trust: high (Vientiane), high (Luang Prabang).** Both are part of the UNICEF/MoES/MONRE Laos schools
network on AirGradient hardware (O-1PP/O-1PST-CE family per cambodia-laos-myanmar.md), CC BY-SA 4.0, no key,
~1 min fresh today. Vientiane in particular now has enough independent sensors (4+ within 10 km, all agreeing
within a believable range) that a single faulty unit would be caught by the others — this is the best-attested
crowd cluster in the whole VN/KH/LA scope. No change recommended; Laos's MONRE is still down (see below), so
this crowd layer remains the only path and it's a solid one.

### Vang Vieng — not_feasible (unchanged, still a 1.5 km miss)

| source | sensor | distance from picker point (18.9235, 102.4478) | value today |
|---|---|---:|---:|
| AirGradient | Vangvieng - Vientiane (id 1135) | 11.5 km | 2.4 µg/m³ |

**Trust: n/a for coverage purposes (only 1 sensor, and it's outside the radius anyway).** The reading itself
looks clean (2.4 µg/m³, consistent with the low regional baseline seen everywhere today), so the sensor is
plausibly healthy — the problem is purely distance, unchanged from COVERAGE.md's 11.5 km measurement.
**Verdict: no coverage; needs either one more sensor inside Vang Vieng town, or a product decision on whether
11.5 km (1.5 km past the 10 km line) is close enough to trust for a single town-sized place** — that's a policy
question, not a data one, and not something this doc resolves.

### MONRE — confirmed still down, worse than before

`https://www.monre.gov.la/` no longer even returns the cPanel "suspended page" HTTP 200 that COVERAGE.md
recorded; today the TLS connection resets outright. No change to the "no public authority" verdict for Laos.

## Sources checked with no usable result (for the record)

| source | what was checked today | result |
|---|---|---|
| US Embassy/Consulate AirNow | `dosairnowdata.org` (4 RSS paths), `airnow.gov` (4 URL guesses) | DNS failure / 404 everywhere. Confirmed dead, not just under-reporting. |
| PAM Air | API page, `robots.txt` | Still 200/partner-only ("Image API"/"Data API" for partners), `robots.txt` is a plain 404 (no file), no public tier or pricing found. |
| IQAir / AirVisual | terms page, API pricing page | 429 (rate-limited) both times — this session, not specific to VN/KH/LA. Policy conclusion (no redistribution rights) stands regardless, per REGIONAL.md's prior finding. |
| PurpleAir | `api.purpleair.com/robots.txt`, `map.purpleair.com/robots.txt` | The **data host disallows all bots** (`Disallow: /`); the map front-end allows crawling but needs a registered/embedded key for data. No key was extracted or used. Sensor count in VN/KH/LA: unverified, on purpose. |
| Cambodia MoE | homepage (curl + WebFetch), `robots.txt`, 5 subdomain guesses | Homepage 200, `robots.txt` allows all, but the only air-quality document is dated **1 April 2019**; no dashboard, no working subdomain guess. |
| Laos MONRE | `monre.gov.la` | Connection reset (worse than the "suspended page" seen 2026-09-28). |
| Da Nang env. dept. | 4 subdomain guesses, `danang.gov.vn` root, DuckDuckGo HTML fallback | All failed (DNS / 403 / empty search). **Unverified**, not confirmed absent — this session's WebSearch budget was already exhausted by other agents in the swarm. |
| Quang Ninh env. dept. (Ha Long) | 3 subdomain guesses, `quangninh.gov.vn` root | DNS failures / timeout. **Unverified** for the same reason. |

## Summary (≤200 words)

CEM was not contacted today, per the hard rule — every Vietnamese `needs_permission`/`not_feasible` verdict
carries over unchanged from `vietnam.md` round 2. Of the 8 Vietnamese destinations checked, only **Ho Chi Minh
City** has any crowd fallback (2 AirGradient sensors, only 1 within the 10 km rule — trust low-medium, verdict
unchanged: community-only); the other 7 (Da Nang, Hoi An, Hue, Nha Trang, Da Lat, Ha Long, Sapa, Phu Quoc) have
**no** same-country sensor within hundreds of km — CEM permission is the only path, with no interim fix to
propose. **Phnom Penh** is a genuine near-miss: 2 agreeing AirGradient sensors sit just 4–5 km past the 10 km
cutoff — geometry, not data, is the blocker. **Siem Reap** now has two independent networks (AirGradient +
Sensor.Community) agreeing within 3 km of town — the strongest upgrade candidate found, trust medium.
**Vientiane** and **Luang Prabang** remain solid (trust high, 2–4+ agreeing sensors each); **Vang Vieng** stays
a 1.5 km miss. AirNow/US Embassy monitors are confirmed dead across the region. PurpleAir, IQAir and PAM Air
remain gated by their own terms, respected without workaround. Da Nang and Quang Ninh's own portals could not be
located this session (search budget exhausted) — genuinely unverified, worth a retry.
