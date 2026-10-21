"""The backup component's retention script (installed as /config/shell/prune_backups.py)."""
import os
import subprocess
import sys
import time
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "components" / "backup" / "shell" / "prune_backups.py"
DAY = 86400


def archives(folder, days_ago):
    """One archive per age in days, named after the age; returns name -> path."""
    now = time.time()
    out = {}
    for age in days_ago:
        path = folder / f"backup-{age:02d}.tar"
        path.write_text("x")
        os.utime(path, (now - age * DAY, now - age * DAY))
        out[age] = path
    return out


def run(folder, *args):
    result = subprocess.run([sys.executable, str(SCRIPT), "--dir", str(folder), *args], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_keeps_newest_and_one_per_week(tmp_path):
    made = archives(tmp_path, range(60))
    (tmp_path / "notes.txt").write_text("not an archive")
    run(tmp_path, "--keep-daily", "3", "--keep-weekly", "2")
    left = {p.name for p in tmp_path.glob("*.tar")}
    assert {made[a].name for a in range(3)} <= left
    # The three newest, plus the newest of last week unless it is one of those three already.
    assert 3 <= len(left) <= 4
    assert (tmp_path / "notes.txt").exists()


def test_defaults_and_dry_run(tmp_path):
    archives(tmp_path, range(40))
    out = run(tmp_path, "--dry-run")
    assert out.count("keep   ") >= 7
    assert "delete " in out
    assert len(list(tmp_path.glob("*.tar"))) == 40
