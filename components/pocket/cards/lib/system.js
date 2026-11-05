// The home's system at a glance for the System page and its tile on Home's Systems: what waits to be
// updated, how old the last backup is, and which devices read nothing. Everything from Home
// Assistant's own entities and registries; nothing the home names. Plain ES module: no DOM.
//
//   systemOf(hass, now?) -> {updates: [id], backup: {last, attempted, state, age, failed} | null,
//                            silent: [{device, name, area}], tone}
//     updates   update.* entities that are on (an update is available; a skipped one is off), listed
//               (not hidden or disabled), by name
//     backup    Home Assistant's backup integration (platform "backup"): its last successful and last
//               attempted automatic backup (Date | null), its manager's state, the age of the last
//               successful one in ms; failed: the last attempt is more than an hour after the last
//               success. null when the home has no backup sensors.
//     silent    devices (not disabled, not services) with listed entities, every one of them
//               unavailable: a device that dropped off
//     tone      "poor": a failed backup, or none for BACKUP_POOR; "fair": none for BACKUP_FAIR; null
//               otherwise. An update waiting is news, not a problem; a device that reads nothing is
//               often one switched off at the wall (an amplifier in standby), so neither colours it.

import { registryIndex, shownEntity } from "./sensors.js";

const DAY = 24 * 3600 * 1000;
export const BACKUP_FAIR = 8 * DAY;
export const BACKUP_POOR = 30 * DAY;
const KEYS = { last: "last_successful_automatic_backup", attempted: "last_attempted_automatic_backup",
  state: "backup_manager_state" };

function backupIds(hass) {
  const found = {};
  for (const reg of Object.values(hass?.entities ?? {})) {
    if (reg?.platform !== "backup") continue;
    for (const [name, key] of Object.entries(KEYS)) if (reg.translation_key === key) found[name] = reg.entity_id;
  }
  // Home Assistant's default ids, for a registry without translation keys.
  for (const [name, key] of Object.entries(KEYS)) {
    const id = `sensor.backup_${key}`;
    if (!found[name] && hass?.states?.[id]) found[name] = id;
  }
  return found;
}

const dateOf = (hass, id) => {
  const value = id ? Date.parse(hass?.states?.[id]?.state) : NaN;
  return Number.isFinite(value) ? new Date(value) : null;
};

export function systemOf(hass, now = Date.now()) {
  const states = hass?.states ?? {};
  const name = (id) => states[id]?.attributes?.title || states[id]?.attributes?.friendly_name || id;
  const updates = Object.keys(states).filter((id) => id.startsWith("update.") && states[id].state === "on"
    && (!hass.entities?.[id] || shownEntity(hass.entities[id]))).sort((a, b) => name(a).localeCompare(name(b)));

  const ids = backupIds(hass);
  let backup = null;
  if (ids.last || ids.attempted || ids.state) {
    const last = dateOf(hass, ids.last);
    const attempted = dateOf(hass, ids.attempted);
    backup = { last, attempted, state: states[ids.state]?.state ?? null, age: last ? now - last.getTime() : null,
      failed: !!attempted && (!last || attempted.getTime() - last.getTime() > 3600 * 1000) };
  }

  const silent = [];
  const index = registryIndex(hass);
  for (const [deviceId, regs] of index?.byDevice ?? []) {
    const device = hass.devices?.[deviceId];
    if (!device || device.disabled_by || device.entry_type === "service") continue;
    const listed = regs.filter((reg) => shownEntity(reg) && states[reg.entity_id]);
    if (!listed.length || !listed.every((reg) => states[reg.entity_id].state === "unavailable")) continue;
    silent.push({ device: deviceId, name: device.name_by_user || device.name || deviceId,
      area: device.area_id ? hass.areas?.[device.area_id]?.name ?? null : null });
  }
  silent.sort((a, b) => a.name.localeCompare(b.name));

  let tone = null;
  if (backup && (backup.failed || backup.age == null || backup.age > BACKUP_POOR)) tone = "poor";
  else if (backup && backup.age > BACKUP_FAIR) tone = "fair";
  return { updates, backup, silent, tone };
}

// "2 days ago" in the person's language.
export function ago(lang, ms) {
  const format = new Intl.RelativeTimeFormat(lang || "en", { numeric: "auto" });
  const minutes = Math.round(ms / 60000);
  if (Math.abs(minutes) < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(-hours, "hour");
  return format.format(-Math.round(hours / 24), "day");
}
