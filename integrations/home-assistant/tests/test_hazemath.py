"""pytest tests for the pure SPEC maths (no Home Assistant needed). LIVE=1 also hits data.gov.sg."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "custom_components", "hazenow"))
import hazemath as hm  # noqa: E402

R = {"north": 49, "south": 105, "west": 117, "east": 83, "central": 105}
C = hm.FALLBACK_COORDS
SGT = timezone(timedelta(hours=8))


@pytest.mark.parametrize("region,pm,band,psi", [("south", 105, "elevated", 153), ("west", 117, "elevated", 165), ("north", 49, "normal", 93)])
def test_regions(region, pm, band, psi):
    v = hm.at_spot(R, C, region)["value"]
    assert (v, hm.band_of(v), hm.instant_psi(v)) == (pm, band, psi)


def test_offline_falls_back_to_island_mean():
    s = hm.at_spot({**R, "south": -1}, C, "south")
    assert s["value"] == 89 and s["fell_back"] and s["mode"] == "island"


def test_gps_exact_station():
    s = hm.at_spot(R, C, latlon=(1.29587, 103.82))
    assert (s["value"], s["mode"], s["nearest"]) == (105, "gps", "south")


def test_gps_idw_between_stations():
    v = hm.at_spot(R, C, latlon=(1.3521, 103.8198))["value"]
    assert 83 <= v <= 117


@pytest.mark.parametrize("c,i", [(0, 0), (12, 50), (55, 100), (150, 200), (250, 300), (500, 500), (600, 500)])
def test_breakpoints(c, i):
    assert hm.instant_psi(c) == i


def test_copy_strings():
    assert hm.psi_descriptor(81) == "Moderate"
    assert [hm.trend_of(d) for d in (5, 4, -5)] == ["up", "steady", "down"]
    assert hm.trend_phrase([{"pm25": 71}, {"pm25": 80}, {"pm25": 105}]) == ("Rising fast: up 34 in 2 hours", "rising fast")
    assert hm.trend_phrase([{"pm25": 100}, {"pm25": 92}])[0] == "Easing: down 8 in the last hour"
    assert hm.verdict_long("elevated") == "OK to be out. Go easy on hard exercise."
    assert hm.verdict_short("high", "kids") == "Indoor play for now"
    assert all(len(hm.verdict_short(b, p)) <= 28 for b in hm.BAND_ORDER for p in hm.PROFILES)


def test_outdoor_worker_profile():
    assert hm.FOR_LABEL["outdoor_worker"] == "For outdoor work"
    assert hm.verdict_long("very_high", "outdoor_worker") == "Limit time outside for now. Ask about indoor work."
    assert hm.verdict_short("elevated", "outdoor_worker") == "Take breaks indoors"
    assert hm.actions_for("elevated", [{"pm25": 90}], "outdoor_worker") == [
        "Take breaks in the shade or indoors, and drink water.", "Ask your supervisor about indoor breaks and lighter tasks."]


def test_actions_filtered_by_profile_and_masks_never_lead():
    h = [{"pm25": 170}]
    for p in hm.PROFILES:
        for b in ("elevated", "high", "very_high"):
            acts = hm.actions_for(b, h, p)
            assert 1 <= len(acts) <= 3, (b, p)
            assert "N95" not in acts[0]
    assert not any(a.startswith("Out for hours") for a in hm.actions_for("high", h, "kids"))
    assert hm.actions_for("normal", [{"pm25": 80}, {"pm25": 60}, {"pm25": 40}]) == ["Air's cleared. Good time to open the windows."]


def _item(ts, readings):
    return {"timestamp": ts, "updatedTimestamp": ts, "readings": {"pm25_one_hourly": readings}}


def test_snapshot_walks_back_when_latest_all_offline():
    latest = {"items": [_item("2026-09-28T16:00:00+08:00", {k: -1 for k in R})]}
    day = {"items": [_item("2026-09-28T15:00:00+08:00", R), _item("2026-09-28T14:00:00+08:00", {**R, "west": 100})]}
    now = datetime(2026, 9, 28, 18, 40, tzinfo=SGT)
    s = hm.build_snapshot([latest, day], [], region="west", now=now)
    assert s["pm25"] == 117 and s["observedAt"].startswith("2026-09-28T15") and s["stale"] is True
    assert s["trend"] == {"delta": 17, "direction": "up"}
    assert s["officialPsi24h"] is None


def test_v1_normalise_and_merge():
    v1 = hm.from_v1({"region_metadata": [{"name": "south", "label_location": {"latitude": 1.29587, "longitude": 103.82}}], "items": [
        {"timestamp": "2026-09-28T15:00:00+08:00", "update_timestamp": "2026-09-28T15:00:59+08:00", "readings": {"pm25_one_hourly": {"north": 53, "west": 103}}},
        {"timestamp": "2026-09-28T16:00:00+08:00", "update_timestamp": "2026-09-28T16:00:59+08:00", "readings": {"pm25_one_hourly": {**R}}}]})
    v2 = {"items": [_item("2026-09-28T15:00:00+08:00", {"south": 106})]}
    s = hm.build_snapshot([v1, v2], [], region="south", now=datetime(2026, 9, 28, 16, 10, tzinfo=SGT))
    assert [h["pm25"] for h in s["history"]] == [106, 105]
    assert s["publishedAt"] == "2026-09-28T16:00:59+08:00"


@pytest.mark.skipif(not os.environ.get("LIVE"), reason="set LIVE=1 to hit data.gov.sg")
def test_live():
    def get(p):
        # data.gov.sg (Cloudflare) returns 403 to the default "Python-urllib" User-Agent.
        req = urllib.request.Request(f"https://api.data.gov.sg/v1/environment/{p}", headers={"User-Agent": "Mozilla/5.0 (compatible; HazeNow/0.1; +https://github.com/yongquantan/hazenow)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return hm.from_v1(json.load(r))

    today = datetime.now(SGT).date().isoformat()
    s = hm.build_snapshot([get(f"pm25?date={today}")], [get(f"psi?date={today}")], latlon=(1.3521, 103.8198))
    print("\nLIVE home:", hm.verdict_long(s["band"]), "|", hm.display_number(s), hm.BAND_LABEL[s["band"]], "|",
          hm.trend_phrase(s["history"])[0], "|", hm.provenance(s), "|", hm.official_line(s), "|", hm.actions_for(s["band"], s["history"]))
    print("  hourly", *hm.spark_pair(s), sep="\n  ")
    assert s["pm25"] >= 0 and s["band"] in hm.BAND_LABEL
