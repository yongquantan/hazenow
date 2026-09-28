"""HazeNow sensors per location (home + 5 regions): pm25, official_psi_24h, band, verdict.

No Instant PSI entity (SPEC v1.2 #1): NEA doesn't publish an hourly PSI, so we don't show one.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import CONCENTRATION_MICROGRAMS_PER_CUBIC_METER
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import HazeNowConfigEntry, hazemath
from .const import ATTRIBUTION, CONF_PROFILE, DOMAIN, HOME
from .coordinator import HazeNowCoordinator


@dataclass(frozen=True, kw_only=True)
class HazeSensorDescription(SensorEntityDescription):
    value_fn: Callable[[dict, str], Any]


SENSORS: tuple[HazeSensorDescription, ...] = (
    HazeSensorDescription(
        key="pm25",
        translation_key="pm25",
        device_class=SensorDeviceClass.PM25,
        native_unit_of_measurement=CONCENTRATION_MICROGRAMS_PER_CUBIC_METER,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s, _: s["pm25"],
    ),
    HazeSensorDescription(
        key="official_psi_24h",
        translation_key="official_psi_24h",
        device_class=SensorDeviceClass.AQI,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s, _: s["officialPsi24h"],
    ),
    HazeSensorDescription(
        key="band",
        translation_key="band",
        device_class=SensorDeviceClass.ENUM,
        options=list(hazemath.BAND_ORDER),
        value_fn=lambda s, _: s["band"],
    ),
    HazeSensorDescription(
        key="verdict",
        translation_key="verdict",
        value_fn=lambda s, profile: hazemath.verdict_long(s["band"], profile),
    ),
)


async def async_setup_entry(hass: HomeAssistant, entry: HazeNowConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    locations = ([HOME] if coordinator.home_latlon else []) + list(hazemath.REGIONS)
    async_add_entities(HazeSensor(coordinator, entry, loc, d) for loc in locations for d in SENSORS)


class HazeSensor(CoordinatorEntity[HazeNowCoordinator], SensorEntity):
    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION
    entity_description: HazeSensorDescription

    def __init__(self, coordinator: HazeNowCoordinator, entry: HazeNowConfigEntry, location: str, desc: HazeSensorDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = desc
        self._location = location
        profile = entry.options.get(CONF_PROFILE, "general")
        self._profile = profile if profile in hazemath.PROFILES else "general"
        self._attr_unique_id = f"{entry.entry_id}_{location}_{desc.key}"
        name = "Home" if location == HOME else location.title()
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{location}")},
            name=f"HazeNow {name}",
            manufacturer="NEA via data.gov.sg",
            model="Estimated from NEA stations" if location == HOME else "NEA regional station",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def _snap(self) -> dict | None:
        return (self.coordinator.data or {}).get(self._location)

    @property
    def available(self) -> bool:
        return super().available and self._snap is not None

    @property
    def native_value(self):
        s = self._snap
        return None if s is None else self.entity_description.value_fn(s, self._profile)

    @property
    def icon(self) -> str | None:
        s = self._snap
        if self.entity_description.key in ("band", "verdict") and s:
            return hazemath.BAND_ICON[s["band"]]
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        s = self._snap
        if s is None:
            return None
        key = self.entity_description.key
        attrs: dict[str, Any] = {
            "observed_at": s["observedAt"],
            "published_at": s["publishedAt"],
            "stale": s["stale"],
            "location_mode": s["locationMode"],
            "nearest_region": s["nearestRegion"],
            "provenance": hazemath.provenance(s),
        }
        if key == "pm25":
            words, word = hazemath.trend_phrase(s["history"])
            attrs.update(
                {
                    "display": hazemath.display_number(s),
                    "trend": s["trend"]["direction"],
                    "trend_delta": s["trend"]["delta"],
                    "trend_words": words,
                    "anchor": hazemath.ANCHOR[s["band"]],
                    "uncertainty": hazemath.uncertainty_line(s),
                    # hourly PM2.5 and NEA's 24-hr PM2.5 average, same unit: the "Last 24 hours" chart
                    "history": [{"time": h["time"], "pm25": h["pm25"], "pm25_24h": h["pm25_24h"]} for h in s["history"]],
                }
            )
        if key == "official_psi_24h":
            attrs.update(
                {
                    "label": hazemath.official_line(s),
                    "caption": hazemath.OFFICIAL_CAPTION,
                    "why_two_numbers": hazemath.WHY_LONG,
                    "forecast": hazemath.FORECAST_URL,
                }
            )
        if key in ("band", "verdict"):
            attrs.update(
                {
                    "verdict": hazemath.verdict_long(s["band"], self._profile),
                    "short_verdict": hazemath.verdict_short(s["band"], self._profile),
                    "for": hazemath.FOR_LABEL[self._profile],
                    "second_line": hazemath.second_line(s),
                    "band_label": hazemath.BAND_LABEL[s["band"]],
                    "color": hazemath.BAND_COLOR[s["band"]],
                    "pm25": s["pm25"],
                    "actions": hazemath.actions_for(s["band"], s["history"], self._profile),
                    "share_text": hazemath.share_text(s),
                }
            )
        return attrs
