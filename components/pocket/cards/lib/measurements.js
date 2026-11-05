// The measurements of the sensor a trend sheet shows: a device that measures more than one thing
// (a climate sensor's temperature and humidity, an air monitor's score, CO₂, PM2.5 and VOC) is one
// sensor with several readings, so its trend sheet offers each of them, the one it was opened for
// chosen. Found by Home Assistant's registries (lib/sensors.js registryIndex: the device's entities),
// the way the area page finds its sensors; no list of the pocket's own. Plain ES module: no DOM.
//
//   measurementsOf(ctx, spec) -> [{entity, label, spec}]   the device's listed sensors with a
//       number (and the entity the sheet opened on, whatever it is), each with the trend spec it
//       opens: the home's readings first in the Ramka's order (temperature, humidity, score, co2,
//       pm2_5, voc, nox), then the rest by name; [] when the entity has no device or the device
//       measures nothing else
//   specFor(ctx, base, entity) -> spec   the trend spec of a sibling of base's entity
//
// A sibling's spec, by what it is:
//   - one of the area's readings in the home's inputs (rooms[].climate / air, outside): that
//     reading's spec (lib/trend-sheet.js trendSpec), with the area's comfort band and the levels;
//   - a temperature or humidity (device_class) in an area with a comfort range, or a CO₂, PM2.5 or
//     VOC with the home's air levels: the same, for this entity;
//   - anything else: the sensor's own (lib/sensor-list.js sensorSpec), named without its device's.
// The area comes from base.area (the pocket area's id, set by trendSpec and sensorSpec); the
// subtitle stays base's.

import { areasOf } from "./areas.js";
import { isNumeric, registryIndex, shownEntity } from "./sensors.js";
import { READING_ORDER, readingSpec } from "./trend-sheet.js";
import { sensorSpec } from "./sensor-list.js";

const GONE = new Set(["unavailable", "unknown"]);
const BY_CLASS = {
  temperature: "temperature", humidity: "humidity", carbon_dioxide: "co2", pm25: "pm2_5",
  volatile_organic_compounds: "voc", volatile_organic_compounds_parts: "voc",
};

export function measurementsOf(ctx, spec) {
  const hass = ctx.hass;
  const reg = hass?.entities?.[spec?.entity];
  if (!reg?.device_id) return [];
  const index = registryIndex(hass);
  const siblings = (index?.byDevice.get(reg.device_id) ?? []).map((r) => r.entity_id).filter((id) => id === spec.entity
    || (shownEntity(hass.entities[id]) && isNumeric(hass, id) && hass.states[id] && !GONE.has(hass.states[id].state)));
  if (siblings.length < 2) return [];
  const list = siblings.map((entity) => {
    const sibling = entity === spec.entity ? spec : specFor(ctx, spec, entity);
    return { entity, spec: sibling, label: labelOf(ctx, sibling, entity, reg.device_id) };
  });
  const rank = (m) => {
    const at = READING_ORDER.indexOf(m.spec.reading);
    return at < 0 ? READING_ORDER.length : at;
  };
  return list.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label) || (a.entity < b.entity ? -1 : 1));
}

export function specFor(ctx, base, entity) {
  const area = areaOf(ctx, base?.area);
  const reading = area ? readingOf(ctx, area, entity) : null;
  const spec = reading ? readingSpec(ctx, area, reading, entity) : null;
  if (spec) return { ...spec, subtitle: base.subtitle };
  const device = deviceName(ctx.hass, ctx.hass?.entities?.[entity]?.device_id);
  return { ...sensorSpec(ctx, entity, ownName(ctx.hass, entity, device), base?.subtitle), area: base?.area };
}

function areaOf(ctx, id) {
  return id ? areasOf(ctx.config, ctx.t).find((area) => area.id === id) ?? null : null;
}

// The reading an entity is in its area: named by the home's inputs, else by its device_class when
// the home has levels for it (the comfort range of the area, the air levels of the home).
function readingOf(ctx, area, entity) {
  for (const [reading, id] of Object.entries({ ...area.climate, ...area.air })) if (id === entity) return reading;
  const reading = BY_CLASS[ctx.hass?.states?.[entity]?.attributes?.device_class];
  if (!reading) return null;
  if (reading === "temperature" || reading === "humidity") return reading;
  return ctx.config?.thresholds?.air?.[reading] ? reading : null;
}

function labelOf(ctx, spec, entity, deviceId) {
  if (spec.reading) return ctx.t(`card.pocket.trend.reading.${spec.reading}`);
  return ownName(ctx.hass, entity, deviceName(ctx.hass, deviceId));
}

function deviceName(hass, deviceId) {
  const device = deviceId ? hass?.devices?.[deviceId] : null;
  return device?.name_by_user || device?.name || "";
}

// An entity's name without its device's in front ("Ruuvi Air 92BB Indoor air quality score" is the
// device's "Indoor air quality score"); the whole name when that would leave nothing.
function ownName(hass, entity, device) {
  const name = hass?.states?.[entity]?.attributes?.friendly_name || entity.split(".").pop().replace(/_/g, " ");
  if (!device || !name.toLowerCase().startsWith(`${device.toLowerCase()} `)) return name;
  const own = name.slice(device.length).trim();
  return own ? own.charAt(0).toUpperCase() + own.slice(1) : name;
}
