"""Fetches data.gov.sg once per interval and derives snapshots for every region + home."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from . import hazemath
from .const import API, API_V1, CONF_API_KEY, CONF_INCLUDE_HOME, DOMAIN, HOME, UPDATE_INTERVAL

_LOGGER = logging.getLogger(__name__)
# Cloudflare in front of data.gov.sg 403s some non-browser UAs; send a browser-like UA with a contact URL.
USER_AGENT = "Mozilla/5.0 (compatible; HazeNow/0.1; +https://github.com/yongquantan/hazenow)"
SGT = timezone(timedelta(hours=8))


class HazeNowCoordinator(DataUpdateCoordinator[dict]):
    """data = {location_key: snapshot dict}. Keys: central/north/south/east/west (+ home)."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=UPDATE_INTERVAL, config_entry=entry)
        self._session = async_get_clientsession(hass)
        self._yesterday: tuple[str, dict] | None = None  # (date, data) cached for the day
        self.home_latlon: tuple[float, float] | None = None
        if entry.options.get(CONF_INCLUDE_HOME, entry.data.get(CONF_INCLUDE_HOME, True)):
            self.home_latlon = (hass.config.latitude, hass.config.longitude)

    async def _get_v2(self, path: str) -> dict:
        headers = {"User-Agent": USER_AGENT}
        key = self.config_entry.options.get(CONF_API_KEY) if self.config_entry else None
        if key:
            headers["x-api-key"] = key
        for attempt in range(3):
            async with self._session.get(f"{API}/{path}", headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status == 429 and attempt < 2:
                    await asyncio.sleep(float(r.headers.get("Retry-After") or 10))
                    continue
                r.raise_for_status()
                body = await r.json()
            if body.get("code") != 0 or not body.get("data"):
                raise UpdateFailed(body.get("errorMsg") or "bad response from data.gov.sg")
            return body["data"]
        raise UpdateFailed("rate limited by data.gov.sg")

    async def _get(self, kind: str, date: str | None) -> dict:
        """SPEC v1.3: NEA v1 first (fresh, stable stamps, no observed rate limit), v2 as fallback."""
        q = f"?date={date}" if date else ""
        try:
            async with self._session.get(
                f"{API_V1}/{kind}{q}", headers={"User-Agent": USER_AGENT}, timeout=aiohttp.ClientTimeout(total=15)
            ) as r:
                r.raise_for_status()
                data = hazemath.from_v1(await r.json())
            if data["items"] or date:
                return data
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            _LOGGER.debug("HazeNow v1 %s failed, using v2: %s", kind, err)
        return await self._get_v2(f"{kind}{q}")

    async def _async_update_data(self) -> dict:
        now = datetime.now(SGT)
        today = now.date().isoformat()
        yday = (now.date() - timedelta(days=1)).isoformat()
        try:
            pm_today = await self._get("pm25", today)
            if not pm_today.get("items"):  # just after midnight
                pm_today = await self._get("pm25", None)
            try:
                psi_today = await self._get("psi", today)
            except (aiohttp.ClientError, UpdateFailed):
                psi_today = None
            # Past days don't change: fetch yesterday once per day (history + chart only).
            if not self._yesterday or self._yesterday[0] != yday:
                try:
                    self._yesterday = (yday, {"pm": await self._get("pm25", yday), "psi": await self._get("psi", yday)})
                except (aiohttp.ClientError, UpdateFailed) as err:
                    _LOGGER.debug("HazeNow history fetch failed: %s", err)
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise UpdateFailed(f"data.gov.sg unreachable: {err}") from err

        y = self._yesterday[1] if self._yesterday and self._yesterday[0] == yday else {}
        pm_days = [pm_today, y.get("pm")]
        psi_days = [psi_today, y.get("psi")]
        out = {}
        try:
            for region in hazemath.REGIONS:
                out[region] = hazemath.build_snapshot(pm_days, psi_days, region=region, now=now)
            if self.home_latlon:
                out[HOME] = hazemath.build_snapshot(pm_days, psi_days, latlon=self.home_latlon, now=now)
        except ValueError as err:
            raise UpdateFailed(str(err)) from err
        return out
