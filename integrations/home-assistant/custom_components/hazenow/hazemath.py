"""HazeNow SPEC maths + docs/COPY.md strings. Pure Python, no Home Assistant imports (pytest-tested).

Self-contained re-implementation of SPEC.md (incl. v1.2 amendments). MIT licensed.
User-facing text never shows Instant PSI (SPEC v1.2 #1); `instantPsi` stays in the snapshot for data users only.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

SGT = timezone(timedelta(hours=8))
SOURCE = "NEA via data.gov.sg"
FORECAST_URL = "https://www.haze.gov.sg/"
REGIONS = ("central", "north", "south", "east", "west")
PROFILES = ("general", "kids", "elderly", "pregnant", "heart_lung", "exercising", "outdoor_worker")
SENSITIVE = ("kids", "elderly", "pregnant", "heart_lung")
FALLBACK_COORDS = {
    "north": (1.41803, 103.82),
    "south": (1.29587, 103.82),
    "east": (1.35735, 103.94),
    "west": (1.35735, 103.70),
    "central": (1.35735, 103.82),
}
BAND_ORDER = ("normal", "elevated", "high", "very_high")
BAND_LABEL = {"normal": "Normal", "elevated": "Elevated", "high": "High", "very_high": "Very High"}
BAND_COLOR = {"normal": "#2E9E5B", "elevated": "#E8A317", "high": "#E4572E", "very_high": "#7B2D8E"}
# COPY §3 shapes: filled circle, half gauge, triangle, octagon (never colour alone).
BAND_ICON = {
    "normal": "mdi:circle",
    "elevated": "mdi:circle-half-full",
    "high": "mdi:triangle",
    "very_high": "mdi:octagon",
}
_BP = [(0, 12, 0, 50), (12, 55, 50, 100), (55, 150, 100, 200), (150, 250, 200, 300), (250, 350, 300, 400), (350, 500, 400, 500)]

# ---------------------------------------------------------------- COPY.md strings (verbatim)
FOR_LABEL = {
    "general": "For you",
    "kids": "For kids",
    "elderly": "For older adults",
    "pregnant": "For pregnancy",
    "heart_lung": "For asthma, COPD & heart",
    "exercising": "For your workout",
    "outdoor_worker": "For outdoor work",  # COPY §17
}
VERDICTS = {  # band -> profile -> (long, short)
    "normal": {
        "general": ("Fine to be out.", "Fine to be out"),
        "kids": ("Fine for outdoor play.", "Fine for outdoor play"),
        "elderly": ("Fine to be out.", "Fine to be out"),
        "pregnant": ("Fine to be out.", "Fine to be out"),
        "heart_lung": ("Fine to be out.", "Fine to be out"),
        "exercising": ("Fine to exercise outside.", "Fine to exercise outside"),
        "outdoor_worker": ("Fine to be out.", "Fine to be out"),
    },
    "elevated": {
        "general": ("OK to be out. Go easy on hard exercise.", "Go easy outdoors"),
        "kids": ("Calm play outside is OK. Skip running games for now.", "Calm play only"),
        "elderly": ("A gentle walk is OK. Skip hard exercise for now.", "Gentle activity only"),
        "pregnant": ("Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only"),
        "heart_lung": ("Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only"),
        "exercising": ("Keep your workout light, or move it indoors.", "Light workout or go indoors"),
        "outdoor_worker": ("OK to work outside. Take breaks indoors if you can.", "Take breaks indoors"),
    },
    "high": {
        "general": ("Short trips out are OK. Exercise indoors.", "No outdoor exercise"),
        "kids": ("Indoor play for now. Keep trips out short.", "Indoor play for now"),
        "elderly": ("Stay indoors for now if you can.", "Stay indoors for now"),
        "pregnant": ("Stay indoors for now if you can.", "Stay indoors for now"),
        "heart_lung": ("Stay indoors for now if you can.", "Stay indoors for now"),
        "exercising": ("Move your workout indoors.", "Work out indoors"),
        "outdoor_worker": ("Take regular breaks indoors. Ask about lighter outdoor tasks.", "Take regular indoor breaks"),
    },
    "very_high": {
        "general": ("Stay indoors for now. Go out only if you need to.", "Stay indoors for now"),
        "kids": ("Keep kids indoors for now.", "Kids indoors for now"),
        "elderly": ("Stay indoors for now.", "Stay indoors for now"),
        "pregnant": ("Stay indoors for now.", "Stay indoors for now"),
        "heart_lung": ("Stay indoors for now.", "Stay indoors for now"),
        "exercising": ("Skip outdoor exercise for now.", "No outdoor exercise"),
        "outdoor_worker": ("Limit time outside for now. Ask about indoor work.", "Limit time outside"),
    },
}
ANCHOR = {
    "normal": "Normal is up to 55.",
    "elevated": "Elevated band (56–150). High starts at 151.",
    "high": "High band (151–250). Very High starts at 251.",
    "very_high": "Very High band (251 and above).",
}
OFFICIAL_CAPTION = "24-hour average"
WHY_SHORT = "Both are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour."
WHY_LONG = (
    "NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. "
    "The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now."
)
FORECAST_TIP = "Planning for tomorrow? Use NEA's 24-hr PSI forecast. Schools and events plan with it."
FOOTER = "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account"
REGIONS_HEADING = "Across Singapore"
CHART_TITLE = "Last 24 hours"
CHART_CAPTION = "The line moves slowly because it averages a whole day. The bars show each hour."


# ---------------------------------------------------------------- maths
def round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def is_valid(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v >= 0


def band_of(pm25: float) -> str:
    if pm25 <= 55:
        return "normal"
    if pm25 <= 150:
        return "elevated"
    if pm25 <= 250:
        return "high"
    return "very_high"


def instant_psi(c: float) -> int:
    """Data-model only (SPEC v1.2 #1). Never render in UI text."""
    if c >= 500:
        return 500
    for clo, chi, ilo, ihi in _BP:
        if c <= chi:
            return min(500, round_half_up(ilo + (c - clo) * (ihi - ilo) / (chi - clo)))
    return 500


def psi_descriptor(psi: float) -> str:
    """NEA's own 24-hr PSI descriptors."""
    if psi <= 50:
        return "Good"
    if psi <= 100:
        return "Moderate"
    if psi <= 200:
        return "Unhealthy"
    if psi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


def haversine_km(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def at_spot(readings: dict, coords: dict, region: str = "central", latlon=None) -> dict:
    """SPEC §1."""
    ok = {k: v for k, v in (readings or {}).items() if is_valid(v) and k in coords}
    if not ok:
        return {"value": None, "mode": "island", "nearest": None, "fell_back": True}
    if latlon is not None:
        dists = sorted((haversine_km(latlon, coords[k]), k) for k in ok)
        d0, nearest = dists[0]
        nearby = None
        if len(dists) >= 2:
            a, b = ok[dists[0][1]], ok[dists[1][1]]
            nearby = (min(a, b), max(a, b))
        base = {"mode": "gps", "nearest": nearest, "nearest_km": d0, "fell_back": False, "nearby": nearby}
        if d0 < 0.5:
            return {**base, "value": round_half_up(ok[nearest]), "blended": False}
        num = sum(ok[k] / d**2 for d, k in dists)
        den = sum(1 / d**2 for d, _ in dists)
        return {**base, "value": round_half_up(num / den), "blended": True}
    if region in ok:
        return {"value": round_half_up(ok[region]), "mode": "region", "nearest": region, "fell_back": False}
    mean = sum(ok.values()) / len(ok)
    return {
        "value": round_half_up(mean),
        "mode": "island",
        "nearest": None if region == "island" else region,
        "fell_back": region != "island",
    }


def trend_of(delta: float) -> str:
    if delta >= 5:
        return "up"
    if delta <= -5:
        return "down"
    return "steady"


def coords_from(meta) -> dict:
    c = dict(FALLBACK_COORDS)
    for m in meta or []:
        loc = m.get("labelLocation") or {}
        if "latitude" in loc and "longitude" in loc:
            c[m["name"]] = (float(loc["latitude"]), float(loc["longitude"]))
    return c


def from_v1(d: dict) -> dict:
    """NEA v1 (snake_case) payload → v2 shape (SPEC v1.3)."""
    return {
        "regionMetadata": [{"name": m["name"], "labelLocation": m.get("label_location") or {}} for m in d.get("region_metadata") or []],
        "items": [
            {"timestamp": it["timestamp"], "updatedTimestamp": it.get("update_timestamp", it["timestamp"]), "readings": it.get("readings") or {}}
            for it in d.get("items") or []
        ],
    }


def merge_items(lists: list) -> dict:
    """Same hour in several lists: earlier lists win per region when valid; later lists fill gaps (SPEC v1.3 #2)."""
    by_ts: dict = {}
    for d in lists:
        for it in (d or {}).get("items", []):
            have = by_ts.get(it["timestamp"])
            if have is None:
                by_ts[it["timestamp"]] = {**it, "readings": {f: dict(v or {}) for f, v in (it.get("readings") or {}).items()}}
                continue
            for field, vals in (it.get("readings") or {}).items():
                tgt = have["readings"].setdefault(field, {})
                for k, v in (vals or {}).items():
                    if not is_valid(tgt.get(k)) and is_valid(v):
                        tgt[k] = v
    return by_ts


def _pm(item) -> dict:
    return (item.get("readings") or {}).get("pm25_one_hourly") or {}


def build_snapshot(pm_days: list, psi_days: list, region="central", latlon=None, now: datetime | None = None) -> dict:
    """Snapshot from raw `data` payloads: pm_days = PM2.5 day lists (latest list first), psi_days = /psi day lists."""
    pm_days = [d for d in pm_days if d]
    psi_days = [d for d in psi_days if d]
    coords = coords_from(next((d["regionMetadata"] for d in pm_days if d.get("regionMetadata")), None))
    by_ts = merge_items(pm_days)
    psi_by_ts = {ts: it["readings"] for ts, it in merge_items(psi_days).items()}
    ordered = sorted(by_ts.values(), key=lambda it: datetime.fromisoformat(it["timestamp"]), reverse=True)
    idx = next((i for i, it in enumerate(ordered) if any(is_valid(v) for v in _pm(it).values())), None)
    if idx is None:
        raise ValueError("no valid PM2.5 readings")
    cur = ordered[idx]
    spot = at_spot(_pm(cur), coords, region, latlon)
    pm25 = spot["value"]
    key = None if spot["mode"] == "island" else spot["nearest"]

    def official_at(ts, field):
        r = (psi_by_ts.get(ts) or {}).get(field) or {}
        if not r:
            return None
        if key and is_valid(r.get(key)):
            return r[key]
        vs = [v for v in r.values() if is_valid(v)]
        return round_half_up(sum(vs) / len(vs)) if vs else None

    prev = at_spot(_pm(ordered[idx + 1]), coords, region, latlon)["value"] if idx + 1 < len(ordered) else None
    delta = pm25 - prev if prev is not None else 0
    history = []
    for it in reversed(ordered[idx : idx + 24]):
        v = at_spot(_pm(it), coords, region, latlon)["value"]
        if v is not None:
            history.append({
                "time": it["timestamp"],
                "pm25": v,
                "pm25_24h": official_at(it["timestamp"], "pm25_twenty_four_hourly"),
                "psi24h": official_at(it["timestamp"], "psi_twenty_four_hourly"),
            })
    latest_psi = {}
    if psi_by_ts:
        newest = max(psi_by_ts, key=datetime.fromisoformat)
        latest_psi = psi_by_ts[newest].get("psi_twenty_four_hourly") or {}
    official = official_at(cur["timestamp"], "psi_twenty_four_hourly")
    if official is None and latest_psi:
        vs = [v for v in latest_psi.values() if is_valid(v)]
        official = latest_psi[key] if key and is_valid(latest_psi.get(key)) else (round_half_up(sum(vs) / len(vs)) if vs else None)
    readings = _pm(cur)
    regions = {
        k: {
            "pm25": readings.get(k) if is_valid(readings.get(k)) else None,
            "psi24h": latest_psi.get(k) if is_valid(latest_psi.get(k)) else None,
            "lat": coords[k][0],
            "lon": coords[k][1],
        }
        for k in REGIONS
        if k in coords
    }
    observed = datetime.fromisoformat(cur["timestamp"])
    now = now or datetime.now(SGT)
    return {
        "pm25": pm25,
        "band": band_of(pm25),
        "instantPsi": instant_psi(pm25),
        "officialPsi24h": official,
        "trend": {"delta": delta, "direction": trend_of(delta)},
        "history": history,
        "regions": regions,
        "nearestRegion": spot["nearest"] or "island",
        "nearestKm": spot.get("nearest_km"),
        "blended": bool(spot.get("blended")),
        "fellBack": spot["fell_back"],
        "nearby": spot.get("nearby"),
        "locationMode": spot["mode"],
        "observedAt": cur["timestamp"],
        "publishedAt": cur.get("updatedTimestamp", cur["timestamp"]),
        "stale": now - observed > timedelta(hours=2, minutes=15),
        "source": SOURCE,
    }


# ---------------------------------------------------------------- COPY.md functions
def time_label(iso: str) -> str:
    d = datetime.fromisoformat(iso).astimezone(SGT)
    h12 = d.hour % 12 or 12
    return f"{h12}{':%02d' % d.minute if d.minute else ''}{'am' if d.hour < 12 else 'pm'}"


def age_text(iso: str, now: datetime | None = None) -> str:
    now = now or datetime.now(SGT)
    m = max(0, round((now - datetime.fromisoformat(iso)).total_seconds() / 60))
    if m < 5:
        return "just now"
    if m < 60:
        return f"{m} min ago"
    return f"{m // 60} h {m % 60} min ago"


def verdict_long(band: str, profile: str = "general") -> str:
    return VERDICTS[band][profile][0]


def verdict_short(band: str, profile: str = "general") -> str:
    return VERDICTS[band][profile][1]


def trend_phrase(history: list) -> tuple[str, str]:
    """COPY §4 → (words, accessibility word)."""
    n = len(history)
    if n < 2:
        return "Trend not available yet", ""
    d1 = history[-1]["pm25"] - history[-2]["pm25"]
    d2 = history[-1]["pm25"] - history[-3]["pm25"] if n >= 3 else d1
    word = "rising fast" if d1 >= 20 else "rising" if d1 >= 5 else "clearing fast" if d1 <= -20 else "easing" if d1 <= -5 else "steady"
    same = (d1 > 0 and d2 > 0) or (d1 < 0 and d2 < 0)
    if same and abs(d2) > abs(d1) and abs(d2) >= 20:
        return (f"Rising fast: up {d2} in 2 hours" if d2 > 0 else f"Clearing fast: down {-d2} in 2 hours"), word
    if d1 >= 20:
        return f"Rising fast: up {d1} in the last hour", word
    if d1 >= 5:
        return f"Rising: up {d1} in the last hour", word
    if d1 <= -20:
        return f"Clearing fast: down {-d1} in the last hour", word
    if d1 <= -5:
        return f"Easing: down {-d1} in the last hour", word
    return "Steady over the last hour", word


def second_line(s: dict) -> str | None:
    if s["stale"]:
        return f"Reading is from {time_label(s['observedAt'])}. It may not match the air now."
    d, h, elev = s["trend"]["delta"], s["history"], s["band"] != "normal"
    if d >= 20 and elev:
        return "Getting worse. Check again in an hour."
    if d >= 20:
        return "Rising quickly. Check again in an hour."
    if d <= -20 and elev:
        return "Getting better. Check again in an hour."
    n = len(h)
    if elev and n >= 3 and h[-1]["pm25"] < h[-2]["pm25"] < h[-3]["pm25"]:
        i = n - 3
        while i > 0 and h[i - 1]["pm25"] > h[i]["pm25"]:
            i -= 1
        return f"Easing since {time_label(h[i]['time'])}."
    return None


def actions_for(band: str, history: list, profile: str = "general") -> list[str]:
    """COPY §5: by band, filtered by profile; 1–3; masks never lead."""
    sensitive = profile in SENSITIVE
    if band == "normal":
        recent = history[-4:-1]
        return ["Air's cleared. Good time to open the windows."] if any(x["pm25"] > 55 for x in recent) else ["Enjoy the fresh air."]
    if profile == "outdoor_worker":  # COPY §17 (Elevated+); masks never lead
        work = ["Take breaks in the shade or indoors, and drink water.", "Ask your supervisor about indoor breaks and lighter tasks."]
        if band == "elevated":
            return work
        if band == "high":
            return work + ["Out for hours? An N95 mask helps. Not needed for short trips."]
        return work + ["Feeling unwell? See a doctor. Chest pain or can't breathe: call 995."]
    if band == "elevated":
        out = []
        if profile == "heart_lung":
            out.append("Asthma or COPD? Keep your inhaler with you.")
        if profile == "exercising":
            out.append("Shorten or slow your run, or move it indoors.")
        if profile == "kids":
            out.append("Swap running games for calm play for now.")
        if sensitive:
            out.append("At home? Close the windows. Use a fan or aircon to keep cool.")
        if profile == "general":
            out.append("Haze isn't always easy to see. Check here before a long run.")
        return out[:3]
    high = ["Close windows. Use aircon or a fan to keep cool.", "Run a purifier in the room you're in, if you have one."]
    if profile in ("exercising", "general"):
        high.append("Move exercise indoors, or try later.")
    if profile == "heart_lung":
        high.append("Keep your inhaler or medicine close. Follow your doctor's plan.")
    if profile == "kids":
        high.append("Plan indoor play. Keep trips out short.")
        high.append("N95 masks aren't made for children. Keeping kids indoors works better.")
    elif profile == "pregnant":
        high.append("Pregnant? Wear an N95 only for short periods, and take it off if it feels hard to breathe.")
    elif profile == "heart_lung":
        high.append("Heart or lung condition? Ask your doctor before using an N95.")
    else:
        high.append("Out for hours? An N95 mask helps. Not needed for short trips.")
    if band == "high":
        return high[:3]
    return [high[0], "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995.", "Check on older family and neighbours."]


def provenance(s: dict, now: datetime | None = None) -> str:
    """COPY §6 provenance line, always with the age suffix."""
    obs = time_label(s["observedAt"])
    age = f" · {age_text(s['observedAt'], now)}"
    name = s["nearestRegion"].title()
    if s["locationMode"] == "gps":
        km = f"{(s.get('nearestKm') or 0):.1f}"
        if not s.get("blended"):
            return f"NEA {name} station · {km} km away · measured {obs}{age}"
        return f"Estimated for your spot from NEA stations · nearest: {name}, {km} km · measured {obs}{age}"
    if s["locationMode"] == "island":
        if s.get("fellBack") and s["nearestRegion"] != "island":
            return f"{name} station is offline. Showing the average of NEA's other stations.{age}"
        return f"Average of NEA stations islandwide · measured {obs}{age}"
    return f"NEA {name} station · measured {obs}{age}"


def display_number(s: dict) -> str:
    return f"{'~' if s.get('blended') else ''}{s['pm25']}"


def uncertainty_line(s: dict) -> str | None:
    if s["locationMode"] != "gps" or not s.get("nearby"):
        return None
    lo, hi = s["nearby"]
    return f"Nearby stations read {lo}–{hi}." if (s.get("nearestKm") or 0) > 5 or hi - lo > 30 else None


def official_line(s: dict) -> str:
    p = s["officialPsi24h"]
    return "NEA 24-hr PSI: not available right now" if p is None else f"NEA 24-hr PSI: {p} ({psi_descriptor(p)})"


def region_row(s: dict, k: str) -> str:
    v = (s["regions"].get(k) or {}).get("pm25")
    return f"{k.title()} · offline" if v is None else f"{k.title()} · {v} · {BAND_LABEL[band_of(v)]}"


def share_text(s: dict, url: str = "https://hazenow.app") -> str:
    word = trend_phrase(s["history"])[1] or "steady"
    psi = s["officialPsi24h"] if s["officialPsi24h"] is not None else "not available"
    return f"Air near me right now: {BAND_LABEL[s['band']]} (PM2.5 {s['pm25']}), {word}. NEA 24-hr PSI: {psi}. Data: NEA via data.gov.sg. {url}"


_SPARK = "▁▂▃▄▅▆▇█"


def spark_pair(s: dict, n: int = 24) -> tuple[str, str]:
    """COPY §8 chart as text: hourly PM2.5 vs NEA 24-hr PM2.5 average, same µg/m³ scale."""
    h = s["history"][-n:]
    mx = max([1] + [x["pm25"] for x in h] + [x["pm25_24h"] or 0 for x in h])

    def g(v):
        return " " if v is None else _SPARK[min(7, int(v / mx * 7.999))]

    return "".join(g(x["pm25"]) for x in h), "".join(g(x["pm25_24h"]) for x in h)
