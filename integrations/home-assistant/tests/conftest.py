"""The HA end-to-end test needs pytest-homeassistant-custom-component; the maths tests need only pytest."""
import os
import sys

# Import *our* custom_components package first; otherwise the harness's own testing_config shadows it.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import custom_components  # noqa: E402,F401

try:
    import pytest_homeassistant_custom_component  # noqa: F401

    pytest_plugins = ["pytest_homeassistant_custom_component"]
except ImportError:  # pragma: no cover
    pass
