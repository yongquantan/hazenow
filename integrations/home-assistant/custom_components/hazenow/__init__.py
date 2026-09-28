"""HazeNow: Singapore haze right now (NEA 1-hr PM2.5, band, verdict, NEA 24-hr PSI). MIT licensed."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .coordinator import HazeNowCoordinator

PLATFORMS: list[Platform] = [Platform.SENSOR]

type HazeNowConfigEntry = ConfigEntry[HazeNowCoordinator]


async def async_setup_entry(hass: HomeAssistant, entry: HazeNowConfigEntry) -> bool:
    coordinator = HazeNowCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_reload))
    return True


async def _reload(hass: HomeAssistant, entry: HazeNowConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: HazeNowConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
