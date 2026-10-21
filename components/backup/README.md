# backup — field notes

- **Not encrypted.** `backup.create` with the local agent writes a plain tar into `/config/backups`.
  It holds Home Assistant's auth store and every integration's credentials. Any copy off the host
  (NAS backup tasks, cloud sync) needs client-side encryption.
- **Restore:** the onboarding screen's "Restore from backup" on a fresh install, or Settings → System
  → Backups.
- **Home Assistant's own schedule stays off.** Its retention keeps a number of copies or days; this
  component keeps the newest `keep_daily` plus the newest of each of the last `keep_weekly` ISO weeks,
  so a week whose usual backup failed still keeps its last good one.
- **Catch-up after a start:** a restart over the backup time loses the time trigger, so a start backs
  up when the newest archive is older than `catch_up_hours`. The check waits two minutes for the age
  sensor's first run.
- **Silent automations** (for a home's `domosenso/silent.yaml`): `automation.nightly_home_assistant_backup`
  (`loaded_on`, `triggered_within: 25`, `entity_fresh: {entity: sensor.newest_backup_age}`) and
  `automation.alert_when_backups_stop` (`loaded_on`).
- The retention script deletes only `*.tar` directly in the folder; try it with
  `python3 /config/shell/prune_backups.py --dry-run` inside the container.
