#!/usr/bin/env python3
"""Generate deterministic QA mock scenarios in raw NEA response shape.

Output: app/src/debug/assets/mock/<scenario>/{pm25.json,psi.json} (debug builds only).
If packages/core/fixtures/scenarios/<scenario>/ exists it is copied instead, so all clients share them.
Timestamps are anchored at 2026-09-28T16:00+08:00 (published ~:00:42, like v1); the app shifts them so the newest hour is the current hour
(all_offline_stale has its newest 3 hours offline, so it reads as stale).
"""
import json, os, shutil
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "..", "app", "src", "debug", "assets", "mock")
SHARED = os.path.join(ROOT, "packages", "core", "fixtures", "scenarios")
SGT = timezone(timedelta(hours=8))
LATEST = datetime(2026, 9, 28, 16, 0, tzinfo=SGT)
REGIONS = ["north", "south", "east", "west", "central"]
META = [
    {"name": "north", "labelLocation": {"latitude": 1.41803, "longitude": 103.82}},
    {"name": "south", "labelLocation": {"latitude": 1.29587, "longitude": 103.82}},
    {"name": "east", "labelLocation": {"latitude": 1.35735, "longitude": 103.94}},
    {"name": "west", "labelLocation": {"latitude": 1.35735, "longitude": 103.70}},
    {"name": "central", "labelLocation": {"latitude": 1.35735, "longitude": 103.82}},
]
OFFSET = {"north": -12, "south": 4, "east": -6, "west": 8, "central": 0}
HOURS = 48

def series(fn):
    """fn(hours_ago) -> central value; other regions offset deterministically."""
    out = []
    for h in range(HOURS):  # h = hours ago, newest first
        c = fn(h)
        out.append({r: max(1, round(c + OFFSET[r] * (c / 100 if c > 60 else 0.3))) for r in REGIONS})
    return out

def ramp(start, end, over):
    return lambda h: end if h == 0 else start + (end - start) * max(0, over - h) / over

SCENARIOS = {
    "normal": series(lambda h: 22 + (h % 5)),
    "elevated": series(lambda h: 104 - (h % 2) if h < 6 else max(30, 104 - (h - 5) * 9)),
    "high": series(lambda h: 185 - h * 2 if h < 8 else max(40, 170 - (h - 7) * 12)),
    "very_high": series(lambda h: 290 - h * 3 if h < 6 else max(60, 272 - (h - 5) * 15)),
    "south_offline": series(lambda h: 104 - (h % 2) if h < 6 else max(30, 104 - (h - 5) * 9)),
    "all_offline_stale": series(lambda h: 110 - h if h < 10 else 60),
    "rising_fast": series(lambda h: 105 if h == 0 else (80 if h == 1 else max(30, 80 - (h - 1) * 6))),
    # Back to Normal after an overnight episode (worst hour 162), for the all-clear card.
    "all_clear": series(lambda h: 22 + h if h < 3 else (162 - abs(h - 8) * 14 if h <= 14 else 30)),
}
SCENARIOS["south_offline"][0]["south"] = -1
for h in range(3):  # newest 3 hours: every station offline
    SCENARIOS["all_offline_stale"][h] = {r: -1 for r in REGIONS}

BP = [(0, 12, 0, 50), (12, 55, 50, 100), (55, 150, 100, 200), (150, 250, 200, 300), (250, 350, 300, 400), (350, 500, 400, 500)]
def sub_index(c):
    if c <= 0: return 0
    if c >= 500: return 500
    for clo, chi, ilo, ihi in BP:
        if c <= chi: return round(ilo + (c - clo) * (ihi - ilo) / (chi - clo))

def iso(t): return t.isoformat()

def build(name, rows):
    pm_items, psi_items = [], []
    for h, vals in enumerate(rows):
        t = LATEST - timedelta(hours=h)
        pm_items.append({"date": t.date().isoformat(), "updatedTimestamp": iso(t + timedelta(seconds=42)),
                         "timestamp": iso(t), "readings": {"pm25_one_hourly": vals}})
        if h + 24 > len(rows):
            continue
        avg, psi = {}, {}
        for r in REGIONS:
            window = [row[r] for row in rows[h:h + 24] if row[r] >= 0]
            if window:
                avg[r] = round(sum(window) / len(window))
                psi[r] = sub_index(avg[r])
            else:
                avg[r] = psi[r] = -1
        psi_items.append({"date": t.date().isoformat(), "updatedTimestamp": iso(t + timedelta(seconds=41)),
                          "timestamp": iso(t), "readings": {"psi_twenty_four_hourly": psi, "pm25_twenty_four_hourly": avg}})
    wrap = lambda items: {"code": 0, "data": {"regionMetadata": META, "items": items}, "errorMsg": ""}
    return wrap(pm_items), wrap(psi_items)

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
for name, rows in SCENARIOS.items():
    d = os.path.join(OUT, name)
    os.makedirs(d)
    src = os.path.join(SHARED, name)
    if os.path.isdir(src):
        for f in ("pm25.json", "psi.json"):
            shutil.copy(os.path.join(src, f), d)
        continue
    pm, psi = build(name, rows)
    json.dump(pm, open(os.path.join(d, "pm25.json"), "w"), separators=(",", ":"))
    json.dump(psi, open(os.path.join(d, "psi.json"), "w"), separators=(",", ":"))
    print(name, "latest:", rows[0], "prev:", rows[1])
os.makedirs(os.path.join(OUT, "network_error"))
open(os.path.join(OUT, "network_error", "README"), "w").write("No data: every fetch fails with an IOException.\n")
