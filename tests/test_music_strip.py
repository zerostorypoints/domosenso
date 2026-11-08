"""Host tests of the music strip's audio analysis (music_features.h), built with the system C++ compiler.

The header has no ESPHome or IDF dependency, so beat detection, auto gain and the band split are
checked here with synthetic signals, without a board.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
COMPONENT = REPO / "components" / "audio-sensor" / "esphome" / "components" / "music_strip"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "music_strip"


def _build_and_run(tmp_path, source):
    exe = tmp_path / source.stem
    build = subprocess.run(["c++", "-std=c++17", "-O2", "-I", str(COMPONENT), str(source), "-o", str(exe)],
                           capture_output=True, text=True)
    assert build.returncode == 0, build.stderr
    run = subprocess.run([str(exe)], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    assert "FAIL" not in run.stdout
    assert "ok " in run.stdout


@pytest.mark.skipif(shutil.which("c++") is None, reason="needs a C++ compiler")
def test_features(tmp_path):
    _build_and_run(tmp_path, FIXTURES / "test_features.cpp")
