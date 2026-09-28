"""Config flow: one click. Uses Home Assistant's home coordinates for the "Home" (IDW) sensors."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from homeassistant.helpers.selector import SelectSelector, SelectSelectorConfig, SelectSelectorMode

from .const import CONF_API_KEY, CONF_INCLUDE_HOME, CONF_PROFILE, DOMAIN
from .hazemath import PROFILES


class HazeNowConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="HazeNow Singapore", data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Optional(CONF_INCLUDE_HOME, default=True): bool}),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HazeNowOptionsFlow()


class HazeNowOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        o = self.config_entry.options
        d = self.config_entry.data
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_INCLUDE_HOME, default=o.get(CONF_INCLUDE_HOME, d.get(CONF_INCLUDE_HOME, True))): bool,
                    vol.Optional(CONF_PROFILE, default=o.get(CONF_PROFILE, "general")): SelectSelector(
                        SelectSelectorConfig(options=list(PROFILES), translation_key="profile", mode=SelectSelectorMode.DROPDOWN)
                    ),
                    vol.Optional(CONF_API_KEY, default=o.get(CONF_API_KEY, "")): str,
                }
            ),
        )
