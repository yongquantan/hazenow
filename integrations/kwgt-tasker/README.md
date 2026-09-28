# HazeNow for Android power users: KWGT and Tasker

The native Android app with Glance widgets is in `apps/android`. These recipes are for people who want something on the home screen today.
Data: NEA via data.gov.sg. Use **v1** (`api.data.gov.sg/v1/environment/pm25`): it's fresh about 1 minute after the hour and has no observed rate limit.

## KWGT (Kustom widget)
(Formulas follow KWGT's documented `wg()`/`if()` syntax. They haven't been tested on a device.)
1. Add a KWGT widget → create a new one → **Globals**.
2. Add a Text global `pm` with this formula (swap `central` for north/south/east/west):
   `$wg("https://api.data.gov.sg/v1/environment/pm25", json, ".items[0].readings.pm25_one_hourly.central")$`
3. Big number text: `$gv(pm)$` · small label `PM2.5 · NEA $df(ha)$`
4. Verdict text (COPY.md short form):
   `$if(gv(pm) < 0, "Station offline", gv(pm) <= 55, "Fine to be out", gv(pm) <= 150, "Go easy outdoors", gv(pm) <= 250, "No outdoor exercise", "Stay indoors for now")$`
5. Band chip text: `$if(gv(pm) <= 55, "Normal", gv(pm) <= 150, "Elevated", gv(pm) <= 250, "High", "Very High")$`, with colour
   `$if(gv(pm) <= 55, #2E9E5B, gv(pm) <= 150, #E8A317, gv(pm) <= 250, #E4572E, #7B2D8E)$`. Always keep the word, not just the colour.
6. Settings → Advanced → **Update web content every 15 min** (KWGT caches `wg`). A tap action can open `https://hazenow.app`.
7. Footer text: `Data: NEA via data.gov.sg`.

## Tasker (hourly check + band-change notification)
- **Profile:** Time → every 1 hour from 00:02 to 23:02. (Add Time 22:00–07:00 → inverted in the profile if you want quiet hours.)
- **Task** (formula syntax not device-tested; check against your Tasker version):
  1. HTTP Request: GET `https://api.data.gov.sg/v1/environment/pm25` (timeout 15).
  2. Variable Set `%pm` to `%http_data.items.readings.pm25_one_hourly.central`.
  3. Variable Set `%band` to `normal`, then `elevated` if `%pm > 55`, `high` if `%pm > 150`, `very_high` if `%pm > 250` (use If actions).
  4. If `%band` != `%HAZE_BAND` and `%pm` >= 0:
     - Notify, title: `Haze now %band` (or `All clear` when normal), text: `PM2.5 %pm. Data: NEA via data.gov.sg`
     - Variable Set `%HAZE_BAND` to `%band`.
- Keep the SPEC's rules in mind: alert only on band changes, always send the all-clear, never at night, and at most 3 a day.
  For hysteresis, require the new band on two consecutive runs before you notify.
