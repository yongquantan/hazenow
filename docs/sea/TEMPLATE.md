# <Country> — air quality data for HazeNow

## TL;DR (≤6 bullets): best authoritative source, best crowd source, index used, feasibility verdict (ship now / needs proxy / blocked)

## Authoritative (government) sources
| source | agency | what (PM2.5 1-hr? index?) | stations (count verified today) | cadence & latency (verified) | API/endpoint | key? | CORS | licence / ToS for redistribution in a free MIT app | reliability notes |

Evidence: exact curl commands + trimmed sample responses + timestamps (SGT) of when you ran them.

## Crowd / low-cost sensor networks
same table columns + sensor type, correction needed, coverage by city.

## National index & bands
Name, pollutants, averaging period (the "lag" problem like SG's 24-hr PSI?), breakpoints for PM2.5, band names/colors, official health advice wording (source link). How to map to HazeNow's "1-hr PM2.5 + band + verdict" model without contradicting the national authority.

## Language / localisation
Official language(s) for verdict copy; any culturally specific framing.

## Integration recipe
Endpoint → fields → our Snapshot model mapping; polling cadence; fallbacks; gotchas (timezones, station IDs, units, -1/null conventions).

## Verdict
Ship in v1.x / v2 / not feasible, with reasons.
