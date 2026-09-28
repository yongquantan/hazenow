"""End-to-end: set up the config entry inside a real (test) Home Assistant with mocked data.gov.sg.

Needs: pip install pytest-homeassistant-custom-component
"""
import re

import pytest

pytest.importorskip("pytest_homeassistant_custom_component")

from pytest_homeassistant_custom_component.common import MockConfigEntry  # noqa: E402

META = [
    {"name": "north", "labelLocation": {"latitude": 1.41803, "longitude": 103.82}},
    {"name": "south", "labelLocation": {"latitude": 1.29587, "longitude": 103.82}},
    {"name": "east", "labelLocation": {"latitude": 1.35735, "longitude": 103.94}},
    {"name": "west", "labelLocation": {"latitude": 1.35735, "longitude": 103.7}},
    {"name": "central", "labelLocation": {"latitude": 1.35735, "longitude": 103.82}},
]


def _pm(ts, r):
    return {"timestamp": ts, "updatedTimestamp": ts.replace(":00:00+", ":30:40+"), "readings": {"pm25_one_hourly": r}}


LATEST = {"code": 0, "data": {"regionMetadata": META, "items": [_pm("2026-09-28T16:00:00+08:00", {"north": 49, "south": -1, "west": 117, "east": 83, "central": 105})]}}
TODAY = {"code": 0, "data": {"regionMetadata": META, "items": [LATEST["data"]["items"][0], _pm("2026-09-28T15:00:00+08:00", {"north": 53, "south": 106, "west": 103, "east": 63, "central": 80})]}}
PSI = {"code": 0, "data": {"regionMetadata": META, "items": [{"timestamp": "2026-09-28T16:00:00+08:00", "readings": {
    "psi_twenty_four_hourly": {"north": 64, "south": 84, "west": 81, "east": 73, "central": 81},
    "pm25_twenty_four_hourly": {"north": 24, "south": 41, "west": 38, "east": 32, "central": 39}}}]}}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield
    # pycares (aiohttp's DNS resolver) leaves a daemon shutdown thread that the harness's
    # cleanup check flags on some versions; it is not ours. Tag it as allowed.
    import threading

    for t in threading.enumerate():
        if "_run_safe_shutdown_loop" in t.name:
            t.name = "waitpid-pycares-shutdown"


def _v1(v2body):
    d = v2body["data"]
    return {
        "region_metadata": [{"name": m["name"], "label_location": m["labelLocation"]} for m in d["regionMetadata"]],
        "items": [{"timestamp": i["timestamp"], "update_timestamp": i["timestamp"].replace(":00:00+", ":00:59+"), "readings": i["readings"]} for i in d["items"]],
        "api_info": {"status": "healthy"},
    }


V1 = "https://api.data.gov.sg/v1/environment"
V2 = "https://api-open.data.gov.sg/v2/real-time/api"


async def test_v2_fallback_when_v1_down(hass, aioclient_mock):
    aioclient_mock.get(re.compile(rf"{re.escape(V1)}/.*"), status=503)
    aioclient_mock.get(re.compile(rf"{re.escape(V2)}/pm25\?date=.*"), json=TODAY)
    aioclient_mock.get(re.compile(rf"{re.escape(V2)}/psi\?date=.*"), json=PSI)
    entry = MockConfigEntry(domain="hazenow", data={"include_home": False}, unique_id="hazenow")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.hazenow_west_pm2_5_1_hr").state == "117"


async def test_setup_creates_sensors(hass, aioclient_mock):
    aioclient_mock.get(re.compile(rf"{re.escape(V1)}/pm25\?date=.*"), json=_v1(TODAY))
    aioclient_mock.get(re.compile(rf"{re.escape(V1)}/psi\?date=.*"), json=_v1(PSI))
    hass.config.latitude, hass.config.longitude = 1.35735, 103.82  # at the Central station

    entry = MockConfigEntry(domain="hazenow", data={"include_home": True}, unique_id="hazenow")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    states = {s.entity_id: s for s in hass.states.async_all("sensor")}
    assert len(states) == 24, sorted(states)  # 6 locations × 4 sensors (no Instant PSI entity)
    assert not any("instant" in e for e in states)
    home_pm = next(s for e, s in states.items() if e.startswith("sensor.hazenow_home_pm2_5"))
    assert home_pm.state == "105" and home_pm.attributes["trend"] == "up"
    assert home_pm.attributes["published_at"] == "2026-09-28T16:00:59+08:00"  # v1 first-publish stamp
    assert home_pm.attributes["history"][-1] == {"time": "2026-09-28T16:00:00+08:00", "pm25": 105, "pm25_24h": 39}
    home_band = next(s for e, s in states.items() if e.startswith("sensor.hazenow_home_haze_band"))
    assert home_band.state == "elevated"
    assert home_band.attributes["verdict"] == "OK to be out. Go easy on hard exercise."
    assert home_band.attributes["provenance"].startswith("NEA Central station · 0.0 km away · measured 4pm")
    assert home_band.attributes["actions"] == ["Haze isn't always easy to see. Check here before a long run."]
    south_pm = next(s for e, s in states.items() if e.startswith("sensor.hazenow_south_pm2_5"))
    assert south_pm.state == "89"  # South offline → island mean, never -1
    south_band = next(s for e, s in states.items() if e.startswith("sensor.hazenow_south_haze_band"))
    assert "offline" in south_band.attributes["provenance"]
    psi = next(s for e, s in states.items() if e.startswith("sensor.hazenow_central_nea_24_hr_psi"))
    assert psi.state == "81" and psi.attributes["label"] == "NEA 24-hr PSI: 81 (Moderate)"
    for st in states.values():
        assert "lagging" not in str(st.attributes) and "Instant PSI" not in str(st.attributes)
    for e, s in sorted(states.items()):
        if e.startswith("sensor.hazenow_home"):
            print(e, "=", s.state)
