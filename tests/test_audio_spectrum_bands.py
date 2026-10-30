"""Host tests of the spectrum band maths (spectrum_bands.h) and publish rule (publish_policy.h),
built with the system C++ compiler.

The headers have no ESPHome or IDF dependency, so the firmware's band edges, normalisation, octave
sums and when a spectrum goes out are checked here without a board.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
COMPONENT = REPO / "components" / "audio-sensor" / "esphome" / "components" / "audio_spectrum"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "audio_spectrum"


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
def test_band_maths(tmp_path):
    _build_and_run(tmp_path, FIXTURES / "test_bands.cpp")


@pytest.mark.skipif(shutil.which("c++") is None, reason="needs a C++ compiler")
def test_publish_policy(tmp_path):
    _build_and_run(tmp_path, FIXTURES / "test_publish_policy.cpp")
