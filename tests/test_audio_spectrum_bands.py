"""Host test of the spectrum band maths (spectrum_bands.h), built with the system C++ compiler.

The header has no ESPHome or IDF dependency, so the firmware's band edges, normalisation and octave
sums are checked here without a board.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
COMPONENT = REPO / "components" / "audio-sensor" / "esphome" / "components" / "audio_spectrum"
SOURCE = Path(__file__).resolve().parent / "fixtures" / "audio_spectrum" / "test_bands.cpp"


@pytest.mark.skipif(shutil.which("c++") is None, reason="needs a C++ compiler")
def test_band_maths(tmp_path):
    exe = tmp_path / "test_bands"
    build = subprocess.run(["c++", "-std=c++17", "-O2", "-I", str(COMPONENT), str(SOURCE), "-o", str(exe)],
                           capture_output=True, text=True)
    assert build.returncode == 0, build.stderr
    run = subprocess.run([str(exe)], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    assert "FAIL" not in run.stdout
    assert "ok " in run.stdout
