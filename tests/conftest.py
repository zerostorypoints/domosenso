import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))


import os

import pytest


@pytest.fixture(autouse=True)
def _private_config_home(tmp_path):
    """No test reads or writes the real ~/.config: the private folder (SPEC-035) goes to a temporary one.
    Not through `monkeypatch`: an autouse fixture holding it would undo every test's own patches only
    after the test module's fixtures have torn down."""
    before = os.environ.get("XDG_CONFIG_HOME")
    os.environ["XDG_CONFIG_HOME"] = str(tmp_path / "xdg-config")
    yield
    if before is None:
        os.environ.pop("XDG_CONFIG_HOME", None)
    else:
        os.environ["XDG_CONFIG_HOME"] = before
