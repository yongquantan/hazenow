# HazeNow for Home Assistant

Singapore haze right now, as sensors: NEA's 1-hr PM2.5, band, a plain-words verdict, and NEA's 24-hr PSI.
There's one device per NEA region, plus **Home**, which is estimated for your Home Assistant location from all five stations (inverse-distance weighting).

| entity (per location: home, central, north, south, east, west) | state | useful attributes |
|---|---|---|
| `sensor.hazenow_<loc>_pm2_5_1_hr` | `137` µg/m³ (device class pm25) | `display` (`~137` when blended), `trend`, `trend_words`, `anchor`, `uncertainty`, `history` (24 h of `pm25` + NEA's `pm25_24h`, which is the chart), `provenance` |
| `sensor.hazenow_<loc>_haze_band` | `elevated` (enum) | `verdict`, `short_verdict`, `for`, `second_line`, `actions` (1–3, filtered by profile), `band_label`, `color`, `share_text` |
| `sensor.hazenow_<loc>_verdict` | `OK to be out. Go easy on hard exercise.` | same as band |
| `sensor.hazenow_<loc>_nea_24_hr_psi` | `86` (aqi) | `label` ("NEA 24-hr PSI: 86 (Moderate)"), `caption`, `why_two_numbers`, `forecast` |

There's no Instant PSI entity (SPEC v1.2: NEA doesn't publish an hourly PSI, so we don't show one). The copy is `docs/COPY.md` verbatim.
The options flow sets **Who are you checking for?** (the six profiles), whether to include Home, and an optional data.gov.sg API key.

## Install
**HACS (custom repository):** HACS wants the integration at a repo root, so publish this folder as its own repo
(`git subtree split --prefix integrations/home-assistant -b hacs && git push git@github.com:hazenow/hazenow-ha.git hacs:main`),
then in HACS go to ⋮ → Custom repositories → `hazenow/hazenow-ha` (Integration) → install → restart → Settings → Devices & services → Add → **HazeNow**.
**Manual:** copy `custom_components/hazenow` into `config/custom_components/` and restart.

**Icon and logo:** `brands/custom_integrations/hazenow/` holds `icon.png` (256×256), `icon@2x.png` (512), `logo.png` (256) and `logo@2x.png` (512), all from `brand/png/app-icon-512.png`.
That's the layout the [home-assistant/brands](https://github.com/home-assistant/brands) repo expects, and HACS and HA show icons from there. To publish, open a PR copying that folder into `brands/custom_integrations/hazenow/`.

Polling: every 2 min, NEA **v1** first (fresh about 1 minute after the hour, no observed rate limit), v2 only as fallback (it rate-limits after about 4 rapid calls). Yesterday's data is fetched once a day.

### Automation example: close-the-windows nudge
```yaml
automation:
  - alias: Haze rose near home
    trigger: [{ platform: state, entity_id: sensor.hazenow_home_haze_band, to: [high, very_high], for: "01:00:00" }]
    action:
      - service: notify.notify
        data:
          title: "Haze now {{ state_attr('sensor.hazenow_home_haze_band','band_label') }} near home"
          message: "{{ state_attr('sensor.hazenow_home_haze_band','verdict') }} {{ state_attr('sensor.hazenow_home_haze_band','actions')[0] }}"
```

## No-install alternative: REST sensors
`hazenow_rest_package.yaml` is a Home Assistant *package* with REST + template sensors (PM2.5 with offline fallback,
NEA 24-hr PSI, band and verdict for one region, from NEA v1). Its templates are validated with Jinja against live data.

## Tests
```sh
pytest -q                          # 17 maths/COPY tests (plain pytest, no HA needed)
LIVE=1 pytest -q -s                # + one live call to data.gov.sg
pip install pytest-homeassistant-custom-component && pytest -q
                                   # + 2 end-to-end tests: config entry set up in a real (test) HA core,
                                   #   24 entities, v1 primary, v2 fallback when v1 is down
```
Verified 28 Sep 2026 with Home Assistant 2025.1.4 (Python 3.12): 19 passed.
