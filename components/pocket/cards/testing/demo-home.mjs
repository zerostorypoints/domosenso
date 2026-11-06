// The demo home's rooms (examples/demo-home/home.inputs.yaml) as the dashboard template passes
// them, its states, and a ctx on the page contract (pages/index.js): shared by the page tests.
import { createT } from "../lib/i18n.js";
import { createOptimistic } from "../lib/optimistic.js";
import en from "../../translations/en.json" with { type: "json" };
import de from "../../translations/de.json" with { type: "json" };
import pl from "../../translations/pl.json" with { type: "json" };

const translate = createT({ en, de, pl });

export const config = {
  lang: "en",
  rooms: [
    { id: "living_room", name: "Living room", lights: "light.living_room",
      scenes: ["scene.living_room_relax", "scene.living_room_bright"],
      climate: { temperature: "sensor.living_room_temperature", humidity: "sensor.living_room_humidity" },
      air: { score: "sensor.living_room_air_quality_score", co2: "sensor.living_room_co2" },
      media: "media_player.living_room_speaker" },
    { id: "bedroom", name: "Bedroom",
      climate: { temperature: "sensor.bedroom_temperature", humidity: "sensor.bedroom_humidity" } },
    { id: "office", name: "Office", lights: "light.office" },
    { id: "hall", name: "Hall" },
  ],
  thresholds: {
    rooms: {
      living_room: { temp_low: "input_number.lr_temp_low", temp_high: "input_number.lr_temp_high",
                     humidity_low: "input_number.lr_humidity_low", humidity_high: "input_number.lr_humidity_high" },
      bedroom: { temp_low: "input_number.br_temp_low", temp_high: "input_number.br_temp_high",
                 humidity_low: "input_number.br_humidity_low", humidity_high: "input_number.br_humidity_high" },
    },
    air: {
      score: { fair: "input_number.score_fair", poor: "input_number.score_poor" },
      co2: { fair: "input_number.co2_fair", poor: "input_number.co2_poor" },
    },
  },
};

export const st = (state, attributes = {}) => ({ state: String(state), attributes });

export const baseStates = () => ({
  "input_number.lr_temp_low": st(20), "input_number.lr_temp_high": st(24),
  "input_number.lr_humidity_low": st(35), "input_number.lr_humidity_high": st(60),
  "input_number.br_temp_low": st(18), "input_number.br_temp_high": st(22),
  "input_number.br_humidity_low": st(35), "input_number.br_humidity_high": st(60),
  "input_number.score_fair": st(80), "input_number.score_poor": st(60),
  "input_number.co2_fair": st(800), "input_number.co2_poor": st(1200),
  "sensor.living_room_temperature": st(21.7), "sensor.living_room_humidity": st(44),
  "sensor.living_room_air_quality_score": st(81), "sensor.living_room_co2": st(768),
  "sensor.bedroom_temperature": st(21.9), "sensor.bedroom_humidity": st(44),
  "light.living_room": st("on", { brightness: 171, friendly_name: "Living room",
    entity_id: ["light.living_room_ceiling", "light.living_room_lamp"] }),
  "light.living_room_ceiling": st("on", { brightness: 171, friendly_name: "Living room Ceiling" }),
  "light.living_room_lamp": st("off", { friendly_name: "Reading lamp" }),
  "light.office": st("off", { friendly_name: "Office" }),
  "scene.living_room_relax": st("2026-11-01T20:00:00", { friendly_name: "Living room Relax" }),
  "scene.living_room_bright": st("unknown", { friendly_name: "Bright" }),
  "media_player.living_room_speaker": st("playing", {
    media_title: "Devil Like Me", media_artist: "Rainbow Kitten Surprise", entity_picture: "/api/media_player_proxy/x" }),
});

export function hassOf(states = baseStates()) {
  const calls = [];
  return { calls, states, locale: { language: "en" }, connected: true,
    callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); } };
}

// As the shell's: ctx.hass is the store's view of the raw hass (ctx.raw), and ctx.redraw (set by
// a test) runs on each send or rollback.
// What the shell gives pages since SPEC-038 (lib/home-model.js): the home's areas, each with a type.
// A config of the old shape becomes that: its rooms typed inside, its `outside` sensors an area
// "outside" of type outside, named Outside, its range under thresholds.rooms.outside.
export function asAreas(cfg) {
  if (!cfg || !Array.isArray(cfg.rooms) || cfg.rooms.some((r) => "type" in r) || cfg.asAreas) return cfg;
  const { outside, ...rest } = cfg;
  const rooms = cfg.rooms.map((room) => ({ type: "inside", ...room }));
  const thresholds = { ...(cfg.thresholds ?? {}), rooms: { ...(cfg.thresholds?.rooms ?? {}) } };
  delete thresholds.outside;
  if (outside?.temperature || outside?.humidity) {
    const climate = {};
    if (outside.temperature) climate.temperature = outside.temperature;
    if (outside.humidity) climate.humidity = outside.humidity;
    const room = { id: "outside", name: "Outside", area: outside.area ?? "outside", type: "outside", climate };
    // A test's way to say the home switched this area out of the checks (SPEC-038 §3.2).
    if (outside.checked === false) room.checked = false;
    rooms.push(room);
    if (cfg.thresholds?.outside) thresholds.rooms.outside = cfg.thresholds.outside;
  }
  return { ...rest, rooms, thresholds, asAreas: true };
}

export function ctxOf({ hass = hassOf(), lang = "en", cfg = config, offline = false, routeId, timeoutMs } = {}) {
  cfg = asAreas(cfg);
  const routes = [];
  const options = [];
  const optimistic = createOptimistic(timeoutMs ? { timeoutMs } : {});
  const sheets = [];   // every spec a page passed to ctx.openSheet
  const ctx = { routes, options, sheets, raw: hass, optimistic, config: cfg, lang, offline, routeId,
    openSheet: (spec) => { sheets.push(spec); return true; },
    closed: 0,
    closeSheet: () => { ctx.closed += 1; },
    get hass() { return optimistic.view(ctx.raw); },
    set hass(value) { ctx.raw = value; optimistic.update(value); },
    t: (key, vars) => translate({ locale: { language: lang } }, key, vars),
    navigate: (route, opts) => { routes.push(route); if (opts) options.push(opts); } };
  optimistic.onChange = () => ctx.redraw?.();
  return ctx;
}

export const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
export const texts = (el, sel) => [...el.querySelectorAll(sel)].map(text);
export const pointer = (el, type, x, y) =>
  el.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, composed: true }));

// --- Power and Plants: the demo home's registries (generic names) -------------------------------

const reg = (entity_id, extra = {}) => ({ entity_id, platform: "demo", ...extra });

// Meters: a mains meter in the hall (power and voltage, the catalog's mains-meter kind), a smart plug
// in the living room (power, energy, current, voltage), a two-channel meter in the office (a total
// and its two channels: counted once), a plug behind it (via_device_id: left out of the sum), a
// meter without a device in the bedroom, one in no area, a diagnostic one and a disabled device's.
export function powerHass(extraStates = {}) {
  const states = {
    ...baseStates(),
    "sensor.mains_power": st(812, { device_class: "power", unit_of_measurement: "W", state_class: "measurement", friendly_name: "Mains meter Power" }),
    "sensor.mains_voltage": st(231.4, { device_class: "voltage", unit_of_measurement: "V", state_class: "measurement", friendly_name: "Mains meter Voltage" }),
    "sensor.tv_plug_power": st(64.5, { device_class: "power", unit_of_measurement: "W", state_class: "measurement", friendly_name: "TV plug Power" }),
    "sensor.tv_plug_energy": st(12.4, { device_class: "energy", unit_of_measurement: "kWh", state_class: "total_increasing", friendly_name: "TV plug Energy" }),
    "sensor.tv_plug_current": st(0.31, { device_class: "current", unit_of_measurement: "A", state_class: "measurement", friendly_name: "TV plug Current" }),
    "sensor.tv_plug_voltage": st(230, { device_class: "voltage", unit_of_measurement: "V", state_class: "measurement", friendly_name: "TV plug Voltage" }),
    "sensor.desk_meter_total": st(0.2, { device_class: "power", unit_of_measurement: "kW", state_class: "measurement", friendly_name: "Desk meter Total" }),
    "sensor.desk_meter_channel_1": st(150, { device_class: "power", unit_of_measurement: "W", friendly_name: "Desk meter Channel 1" }),
    "sensor.desk_meter_channel_2": st(50, { device_class: "power", unit_of_measurement: "W", friendly_name: "Desk meter Channel 2" }),
    "sensor.lamp_plug_power": st(9, { device_class: "power", unit_of_measurement: "W", friendly_name: "Lamp plug Power" }),
    "sensor.heater_power": st(1200, { device_class: "power", unit_of_measurement: "W", friendly_name: "Heater power" }),
    "sensor.garage_power": st("unavailable", { device_class: "power", unit_of_measurement: "W", friendly_name: "Garage power" }),
    "sensor.tv_plug_signal": st(-60, { device_class: "signal_strength", friendly_name: "TV plug Signal" }),
    "sensor.tv_plug_power_diag": st(1, { device_class: "power", unit_of_measurement: "W" }),
    "sensor.old_plug_power": st(5, { device_class: "power", unit_of_measurement: "W" }),
    ...extraStates,
  };
  const hass = hassOf(states);
  hass.areas = {
    living_room: { area_id: "living_room", name: "Living room" }, bedroom: { area_id: "bedroom", name: "Bedroom" },
    office: { area_id: "office", name: "Office" }, hall: { area_id: "hall", name: "Hall" },
    utility: { area_id: "utility", name: "Utility room" },
  };
  hass.devices = {
    d_mains: { id: "d_mains", name: "Mains meter", area_id: "utility" },
    d_tv: { id: "d_tv", name: "TV plug", area_id: "living_room" },
    d_desk: { id: "d_desk", name: "Desk meter", area_id: "office" },
    d_lamp: { id: "d_lamp", name: "Lamp plug", area_id: "office", via_device_id: "d_desk" },
    d_old: { id: "d_old", name: "Old plug", area_id: "office", disabled_by: "user" },
  };
  hass.entities = {
    "sensor.mains_power": reg("sensor.mains_power", { device_id: "d_mains" }),
    "sensor.mains_voltage": reg("sensor.mains_voltage", { device_id: "d_mains" }),
    "sensor.tv_plug_power": reg("sensor.tv_plug_power", { device_id: "d_tv" }),
    "sensor.tv_plug_energy": reg("sensor.tv_plug_energy", { device_id: "d_tv" }),
    "sensor.tv_plug_current": reg("sensor.tv_plug_current", { device_id: "d_tv" }),
    "sensor.tv_plug_voltage": reg("sensor.tv_plug_voltage", { device_id: "d_tv" }),
    "sensor.tv_plug_signal": reg("sensor.tv_plug_signal", { device_id: "d_tv" }),
    "sensor.tv_plug_power_diag": reg("sensor.tv_plug_power_diag", { device_id: "d_tv", entity_category: "diagnostic" }),
    "sensor.desk_meter_total": reg("sensor.desk_meter_total", { device_id: "d_desk" }),
    "sensor.desk_meter_channel_1": reg("sensor.desk_meter_channel_1", { device_id: "d_desk" }),
    "sensor.desk_meter_channel_2": reg("sensor.desk_meter_channel_2", { device_id: "d_desk" }),
    "sensor.lamp_plug_power": reg("sensor.lamp_plug_power", { device_id: "d_lamp" }),
    "sensor.heater_power": reg("sensor.heater_power", { area_id: "bedroom" }),
    "sensor.garage_power": reg("sensor.garage_power"),
    "sensor.old_plug_power": reg("sensor.old_plug_power", { device_id: "d_old" }),
  };
  return hass;
}

// A home with many plants (the plants component's entities and attributes): one with a Mi Flora
// device in an area, others placed by the component's room only, one with the plant integration's
// problem only, one without any reading, one with a low battery.
const plant = (name, a, extra = {}) => st(extra.state ?? "ok", { friendly_name: name, domosenso_plant: true, ...a });
export function plantsHass(extraStates = {}) {
  const states = {
    ...baseStates(),
    "plant.fern": plant("Fern", { moisture: 9, conductivity: 500, brightness: 300, temperature: 21, problem: "moisture low", domosenso_room: "Living room",
      domosenso_bands: { min_moisture: 20, max_moisture: 60, min_conductivity: 350, max_conductivity: 2000, min_brightness: 500 } }, { state: "problem" }),
    "sensor.fern_moisture": st(9, { device_class: "moisture", unit_of_measurement: "%", state_class: "measurement" }),
    "sensor.fern_conductivity": st(500, { device_class: "conductivity", unit_of_measurement: "µS/cm", state_class: "measurement" }),
    "sensor.fern_illuminance": st(300, { device_class: "illuminance", unit_of_measurement: "lx", state_class: "measurement" }),
    "sensor.fern_illuminance_max_24h": st(2400, { unit_of_measurement: "lx" }),
    "sensor.fern_temperature": st(21, { device_class: "temperature", unit_of_measurement: "°C", state_class: "measurement" }),
    "sensor.fern_battery": st(80, { device_class: "battery", unit_of_measurement: "%" }),
    "plant.palm": plant("Palm", { moisture: 40, conductivity: 900, brightness: 120, temperature: 22, problem: "none", domosenso_room: "Living room",
      domosenso_bands: { min_moisture: 15, max_moisture: 60, min_brightness: 1500 } }),
    "sensor.palm_moisture": st(40, { unit_of_measurement: "%" }),
    "sensor.palm_illuminance_max_24h": st(800, { unit_of_measurement: "lx" }),
    "plant.cactus": plant("Cactus", { moisture: 75, conductivity: 200, brightness: 9000, temperature: 9, problem: "none", domosenso_room: "Bedroom",
      domosenso_bands: { min_moisture: 5, max_moisture: 30, min_conductivity: 350, min_temperature: 12, max_temperature: 30, min_brightness: 2000 } }),
    "plant.herbs": plant("Herbs", { moisture: 35, conductivity: 1200, brightness: 4000, max_brightness: 6000, temperature: 23, problem: "none", domosenso_room: "Kitchen" }),
    "plant.ivy": plant("Ivy", { moisture: 30, conductivity: 800, brightness: 1500, temperature: 20, battery: 8, problem: "none", domosenso_room: "Office" }),
    "plant.orchid": plant("Orchid", { problem: "brightness low, temperature high", domosenso_room: "Office" }, { state: "problem" }),
    "plant.bonsai": plant("Bonsai", { moisture: 33, problem: "none" }),
    "plant.new_pot": plant("New pot", { problem: "none" }),
    "plant.yucca": plant("Yucca", { moisture: 25, conductivity: 700, brightness: 1800, temperature: 20, problem: "none", domosenso_room: "Living room" }),
    ...extraStates,
  };
  const hass = hassOf(states);
  hass.areas = { living_room: { area_id: "living_room", name: "Living room" }, bedroom: { area_id: "bedroom", name: "Bedroom" },
    office: { area_id: "office", name: "Office" }, kitchen: { area_id: "kitchen", name: "Kitchen" } };
  // Fern's Mi Flora stands in the bedroom (moved there): its device's area wins over the room label.
  hass.devices = { d_fern: { id: "d_fern", name: "Fern sensor", area_id: "bedroom" } };
  hass.entities = Object.fromEntries(["moisture", "conductivity", "illuminance", "temperature", "battery"]
    .map((r) => [`sensor.fern_${r}`, reg(`sensor.fern_${r}`, { device_id: "d_fern" })]));
  return hass;
}
