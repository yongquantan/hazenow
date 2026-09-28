"""Constants for HazeNow."""
from datetime import timedelta

DOMAIN = "hazenow"
API = "https://api-open.data.gov.sg/v2/real-time/api"  # v2: fallback only (rate-limited)
API_V1 = "https://api.data.gov.sg/v1/environment"  # v1: primary (SPEC v1.3)
ATTRIBUTION = "Data: NEA via data.gov.sg · HazeNow (free & open source)"
# NEA data lands ~1 min after the hour (SPEC v1.3); v1 has no observed rate limit. 2 min keeps us fresh.
UPDATE_INTERVAL = timedelta(minutes=2)
CONF_INCLUDE_HOME = "include_home"
CONF_PROFILE = "profile"
CONF_API_KEY = "api_key"
HOME = "home"
