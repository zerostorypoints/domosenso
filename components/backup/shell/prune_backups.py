"""Rolling retention for the nightly Home Assistant backups (component backup).

Keeps the newest archives (--keep-daily, default 7), plus the newest archive of each of the most
recent ISO weeks (--keep-weekly, default 4), and deletes every other *.tar in the backups folder.
Grouping by week rather than by weekday means a week whose Sunday backup failed still keeps its last
good one.

Runs inside the container as shell_command.prune_old_backups (the component's package).
`--dry-run` prints what it would delete and deletes nothing; `--dir` points it at another folder.
"""

import argparse
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--keep-daily", type=int, default=7)
    parser.add_argument("--keep-weekly", type=int, default=4)
    parser.add_argument("--dir", type=Path, default=Path("/config/backups"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    archives = sorted(args.dir.glob("*.tar"), key=lambda p: p.stat().st_mtime, reverse=True)

    keep = set(archives[: args.keep_daily])
    weeks = {}
    for archive in archives:
        week = time.strftime("%G-W%V", time.localtime(archive.stat().st_mtime))
        weeks.setdefault(week, archive)  # newest first, so the first seen is the newest
    keep.update(list(weeks.values())[: args.keep_weekly])

    for archive in archives:
        if archive in keep:
            print(f"keep   {archive.name}")
        else:
            print(f"delete {archive.name}")
            if not args.dry_run:
                archive.unlink()


if __name__ == "__main__":
    main()
