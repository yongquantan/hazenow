#!/usr/bin/env python3
# <xbar.title>HazeNow</xbar.title>
# <xbar.version>v0.3.0</xbar.version>
# <xbar.author>HazeNow contributors</xbar.author>
# <xbar.author.github>hazenow</xbar.author.github>
# <xbar.desc>Singapore haze right now: NEA's 1-hr PM2.5 with plain-words advice, next to NEA's 24-hr PSI. Data: NEA via data.gov.sg.</xbar.desc>
# <xbar.dependencies>python3 (stdlib only)</xbar.dependencies>
# <xbar.abouturl>https://github.com/hazenow/hazenow</xbar.abouturl>
# <xbar.var>select(HAZENOW_REGION="central"): Area [central, north, south, east, west, island]</xbar.var>
# <xbar.var>select(HAZENOW_PROFILE="general"): Who are you checking for? [general, kids, elderly, pregnant, heart_lung, exercising, outdoor_worker]</xbar.var>
# <xbar.var>string(HAZENOW_LAT=""): Optional home latitude (reading estimated for your spot)</xbar.var>
# <xbar.var>string(HAZENOW_LON=""): Optional home longitude</xbar.var>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.environment>[HAZENOW_REGION=central, HAZENOW_PROFILE=general, HAZENOW_LAT=, HAZENOW_LON=]</swiftbar.environment>
"""HazeNow SwiftBar / xbar plugin. MIT licensed. Python 3 stdlib only, one file.

Menu bar: `● 105 ▲` (dot in band colour, NEA 1-hr PM2.5, trend arrow).
Dropdown: verdict first, then number, trend, provenance, actions, NEA 24-hr PSI, a 24-hour chart
(hourly PM2.5 vs NEA's 24-hr PM2.5 average, same unit), regions. Copy is docs/COPY.md verbatim.
Area and profile picked in the dropdown are saved to ~/.config/hazenow/swiftbar.json.
HAZENOW_LAT/HAZENOW_LON estimate the reading for that spot from all NEA stations (stays on this Mac).

  python3 hazenow.2m.py --selftest   SPEC test vectors
  python3 hazenow.2m.py --json       snapshot as JSON (includes instantPsi for data users; never shown in the menu)
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

# ================================================================ SPEC maths + COPY.md strings
# (verbatim copy of integrations/home-assistant/custom_components/hazenow/hazemath.py — keep in sync)


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

# ================================================================ data
API = "https://api-open.data.gov.sg/v2/real-time/api"  # v2: fallback only (429 after ~4 rapid calls)
API_V1 = "https://api.data.gov.sg/v1/environment"  # v1: primary (SPEC v1.3), no observed rate limit
WEB_URL = "https://hazenow.app"
CONFIG = os.path.expanduser("~/.config/hazenow/swiftbar.json")
CACHE_DIR = os.path.expanduser("~/.cache/hazenow")
UA = {"User-Agent": "Mozilla/5.0 (compatible; HazeNow/0.1; +https://github.com/yongquantan/hazenow)"}  # Cloudflare 403s the default Python-urllib UA


def _get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
        return json.load(r)


def fetch(kind, day=None):
    """SPEC v1.3: NEA v1 first; v2 (rate-limited) only if v1 fails."""
    q = f"?date={day}" if day else ""
    try:
        data = from_v1(_get_json(f"{API_V1}/{kind}{q}"))
        if data["items"] or day:
            return data
    except Exception:
        pass
    for attempt in range(3):
        try:
            body = _get_json(f"{API}/{kind}{q}")
            if body.get("code") == 0 and body.get("data"):
                return body["data"]
            raise RuntimeError(body.get("errorMsg") or "bad response")
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 2:
                raise
            time.sleep(float(e.headers.get("Retry-After") or 10))
    raise RuntimeError("unreachable")


def fetch_past_day(kind, day):
    """Past days don't change: cache them on disk."""
    path = os.path.join(CACHE_DIR, f"v1-{kind}-{day}.json")
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        pass
    data = fetch(kind, day)
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f)
    except OSError:
        pass
    return data


RAW_CACHE = os.path.join(CACHE_DIR, "swiftbar-raw.json")


def need_fetch(now):
    """SPEC v1.3 polling: data lands ~hh:01. Fetch when the current hour isn't in the cache yet
    (SwiftBar runs us every 2 min → ~1 req/min/endpoint at most), else refresh every 20 min for back-fills."""
    try:
        with open(RAW_CACHE) as f:
            cached = json.load(f)
        age = time.time() - os.path.getmtime(RAW_CACHE)
    except Exception:
        return True, None
    stamps = [it["timestamp"] for d in cached.get("pm", []) for it in d.get("items", [])]
    newest = max((datetime.fromisoformat(t) for t in stamps), default=None)
    this_hour = now.replace(minute=0, second=0, microsecond=0)
    if newest is None or newest < this_hour:
        return True, cached
    return age > 20 * 60, cached


def load_raw():
    """Returns (raw, from_cache)."""
    now = datetime.now(SGT)
    need, cached = need_fetch(now)
    if not need:
        return cached, False
    today, yday = now.date().isoformat(), (now.date() - timedelta(days=1)).isoformat()
    try:
        pm_today = fetch("pm25", today)  # includes the latest hour
        if not pm_today.get("items"):
            pm_today = fetch("pm25")
    except Exception:
        if cached:
            return cached, True
        raise
    raw = {"pm": [pm_today], "psi": []}
    try:
        raw["psi"].append(fetch("psi", today))
    except Exception:
        pass
    for kind, lst in (("pm25", raw["pm"]), ("psi", raw["psi"])):
        try:
            lst.append(fetch_past_day(kind, yday))
        except Exception:
            pass
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(RAW_CACHE, "w") as f:
            json.dump(raw, f)
    except OSError:
        pass
    return raw, False


def load_config():
    try:
        with open(CONFIG) as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg):
    os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
    with open(CONFIG, "w") as f:
        json.dump(cfg, f)


# ================================================================ render
def ansi_dot(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return f"\033[38;2;{r};{g};{b}m●\033[0m"


GLYPH = {"normal": "●", "elevated": "◐", "high": "△", "very_high": "⬣"}  # COPY §3 shapes; never ▲/▼ in the chip
SF = {"normal": "circle.fill", "elevated": "circle.lefthalf.filled", "high": "triangle.fill", "very_high": "octagon.fill"}
ARROW = {"up": "▲", "down": "▼", "steady": "▶"}


def render(s, region, profile, has_home, using_home, from_cache=False):
    me = os.path.abspath(sys.argv[0])
    band = s["band"]
    color = BAND_COLOR[band]
    print(f"{ansi_dot(color)} {s['pm25']} {ARROW[s['trend']['direction']]} | ansi=true")
    print("---")
    # 1. verdict first (COPY §2), who it's for, optional second line
    print(f"{verdict_long(band, profile)} | size=15 font=HelveticaNeue-Bold")
    print(f"{FOR_LABEL[profile]} | size=12 color=#888888")
    if from_cache:
        print(f"You're offline. Showing the reading from {time_label(s['observedAt'])}. | size=12")
    else:
        sl = second_line(s)
        if sl:
            print(f"{sl} | size=12")
    print("---")
    # 2. number + chip + trend + anchor + provenance
    print(f"{display_number(s)} PM2.5 · {BAND_LABEL[band]} | sfimage={SF[band]} sfcolor={color} font=HelveticaNeue-Bold size=14")
    print(trend_phrase(s["history"])[0])
    print(f"{ANCHOR[band]} | size=12 color=#888888")
    unc = uncertainty_line(s)
    if unc:
        print(f"{unc} | size=12")
    print(f"{provenance(s)} | size=11 color=#888888")
    print("---")
    # 3. actions
    print("What you can do | size=12 color=#888888")
    for a in actions_for(band, s["history"], profile):
        print(f"{a} | size=13")
    print("---")
    # 4. official figure + chart (µg/m³ both)
    print(f"{official_line(s)} · {OFFICIAL_CAPTION} | tooltip={json.dumps(WHY_SHORT)}")
    hourly, daily = spark_pair(s)
    if hourly:
        print(f"{CHART_TITLE} (µg/m³) | size=12 color=#888888")
        print(f"hourly PM2.5   {hourly} | font=Menlo size=12")
        print(f"NEA 24-hr avg  {daily} | font=Menlo size=12")
        print(f"--{CHART_CAPTION} | size=12")
    print("Why two numbers?")
    for line in wrap(WHY_LONG, 70):
        print(f"--{line} | size=12")
    print(f"{FORECAST_TIP} | href={FORECAST_URL} size=12")
    print("---")
    # 5. regions + settings
    print(REGIONS_HEADING)
    for k in REGIONS:
        v = s["regions"][k]["pm25"]
        mark = " (your area)" if s["locationMode"] == "region" and k == s["nearestRegion"] else (
            " (nearest)" if s["locationMode"] == "gps" and k == s["nearestRegion"] else "")
        if v is None:
            print(f"--{region_row(s, k)} | sfimage=circle color=#888888")
        else:
            b = band_of(v)
            print(f"--{region_row(s, k)}{mark} | sfimage={SF[b]} sfcolor={BAND_COLOR[b]}")
    print("Show area")
    for k in list(REGIONS) + ["island"]:
        tick = "✓ " if (k == region and not using_home) else "   "
        print(f"--{tick}{'Islandwide' if k == 'island' else k.title()} | bash={json.dumps(me)} param1=--set-region param2={k} terminal=false refresh=true")
    if has_home:
        tick = "✓ " if using_home else "   "
        print(f"--{tick}My spot (HAZENOW_LAT/LON) | bash={json.dumps(me)} param1=--set-region param2=home terminal=false refresh=true")
    print("Who are you checking for?")
    labels = {"general": "Just me, generally healthy", "kids": "Kids", "elderly": "Older adults (65+)", "pregnant": "Pregnant",
              "heart_lung": "Asthma, COPD or a heart condition", "exercising": "I exercise outdoors",
              "outdoor_worker": "I work outdoors"}
    for p in PROFILES:
        tick = "✓ " if p == profile else "   "
        print(f"--{tick}{labels[p]} | bash={json.dumps(me)} param1=--set-profile param2={p} terminal=false refresh=true")
    print("--Saved on this device only. | size=11 color=#888888")
    print("---")
    print(f"Copy share text | bash={json.dumps(me)} param1=--copy-share param2={region} terminal=false")
    print(f"Open HazeNow | href={WEB_URL}")
    print("Refresh | refresh=true")
    print(f"{FOOTER} | href=https://data.gov.sg color=#888888 size=11")


def wrap(text, width):
    out, line = [], ""
    for w in text.split():
        if line and len(line) + len(w) + 1 > width:
            out.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        out.append(line)
    return out


def selftest():
    C = dict(FALLBACK_COORDS)
    r = {"north": 49, "south": 105, "west": 117, "east": 83, "central": 105}
    assert at_spot(r, C, "south")["value"] == 105 and band_of(105) == "elevated" and instant_psi(105) == 153
    assert at_spot(r, C, "west")["value"] == 117 and instant_psi(117) == 165
    assert at_spot(r, C, "north")["value"] == 49 and band_of(49) == "normal" and instant_psi(49) == 93
    s = at_spot(dict(r, south=-1), C, "south")
    assert s["value"] == 89 and s["fell_back"], s
    g = at_spot(r, C, latlon=(1.29587, 103.82))
    assert (g["value"], g["mode"], g["nearest"]) == (105, "gps", "south")
    for c, i in [(0, 0), (12, 50), (55, 100), (150, 200), (250, 300), (500, 500), (600, 500)]:
        assert instant_psi(c) == i, (c, instant_psi(c))
    assert verdict_long("elevated") == "OK to be out. Go easy on hard exercise."
    print("selftest ok")


def main():
    args = sys.argv[1:]
    if args[:1] == ["--selftest"]:
        return selftest()
    cfg = load_config()
    if len(args) > 1 and args[0] in ("--set-region", "--set-profile"):
        key = "region" if args[0] == "--set-region" else "profile"
        if args[1] == "home":
            cfg.pop("region", None)
            cfg["use_home"] = True
        else:
            cfg[key] = args[1]
            if key == "region":
                cfg["use_home"] = False
        save_config(cfg)
        return
    region = cfg.get("region") or os.environ.get("HAZENOW_REGION") or "central"
    if args[:1] == ["--copy-share"]:  # clipboard from the last snapshot on disk (no network)
        import subprocess
        with open(os.path.join(CACHE_DIR, "swiftbar-last.json")) as f:
            subprocess.run(["pbcopy"], input=share_text(json.load(f)).encode(), check=False)
        return
    profile = cfg.get("profile") or os.environ.get("HAZENOW_PROFILE") or "general"
    profile = profile if profile in PROFILES else "general"
    latlon = None
    try:
        lat, lon = os.environ.get("HAZENOW_LAT"), os.environ.get("HAZENOW_LON")
        if lat and lon:
            latlon = (float(lat), float(lon))
    except ValueError:
        latlon = None
    using_home = bool(latlon) and cfg.get("use_home", "region" not in cfg)
    try:
        raw, from_cache = load_raw()
    except Exception:
        print("● -- | color=#888888")
        print("---")
        print("Can't reach NEA's data right now")
        print("We'll try again in a few minutes. | size=12")
        print("Try again | refresh=true")
        return
    try:
        s = build_snapshot(raw["pm"], raw["psi"], region=region, latlon=latlon if using_home else None)
    except ValueError:
        print("● -- | color=#888888")
        print("---")
        print("No reading available")
        print("NEA's data didn't include a usable reading this hour. We'll try again soon. | size=12")
        return
    try:
        with open(os.path.join(CACHE_DIR, "swiftbar-last.json"), "w") as f:
            json.dump(s, f)
    except OSError:
        pass
    if "--json" in args:
        print(json.dumps(s, indent=2, ensure_ascii=False))
    else:
        render(s, region, profile, bool(latlon), using_home, from_cache)


if __name__ == "__main__":
    main()
