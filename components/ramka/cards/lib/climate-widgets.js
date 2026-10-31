// The Climate page's widgets, shared by climate-rooms-card (the settings page's picker), rooms-card
// (the tiles on the Ramka) and line-style-card (the 7-day charts): the widget types, how a stored
// entry reads, the series colours and the threshold colours. Plain ES module: no DOM beyond
// getComputedStyle.
//
// An entry of sensor.<prefix>_climate_rooms is {type, label, main, extra, ...per-type values} or
// an empty place ({type: "empty", spacer: true}). An entry from before the types has no `type`: it
// reads as Temperature when its main sensor has device_class temperature, else Custom, and a
// spacer ({spacer: true}, or no main) as Empty; the next save stores the type.
//
// The one import, the named colours (lib/colours.js), carries this module's own ?v=: /local/ is
// served with a 31-day cache, so an import without it can stay the old file after a deploy.
const colours = await import(new URL("./colours.js", import.meta.url).href + new URL(import.meta.url).search);
export const { COLOURS, COLOUR_IDS, colourKey, colourCss, selectedColour, colourOfSlot } = colours;

export const TYPES = ["temperature", "air", "custom", "empty"];

// Per type, the device classes of its main and second pickers (null: any sensor with a reading).
export const DEVICE_CLASSES = {
  temperature: ["temperature", "humidity"],
  air: ["carbon_dioxide", "pm25"],
  custom: [null, null],
};

// A Temperature widget's comfort ranges, until its settings dialog sets its own.
export const COMFORT = { temp_low: 20, temp_high: 24, hum_low: 40, hum_high: 60 };

// The Air page's limits, fair from and poor from (input_number.<prefix>_air_<reading>_raised /
// _high, ids kept from before the fair / poor names): the package's
// defaults (air_limits in templates/package.yaml.j2), read while a helper has no number.
export const AIR_READINGS = { co2: [800, 1200], pm2_5: [15, 35] };

// The theme's series slots (--graph-color-N, themes/ramka.yaml) the widgets and the charts take,
// in this order: the threshold colours are left out (1 blue, 2 amber, 3 red, 7 orange, 8 light
// blue), so a series colour is never read as "cold", "raised" or "too warm".
export const SERIES_SLOTS = [4, 5, 6, 9, 11, 10];

// HA's own series colours when the theme has none (src/common/color/colors.ts); slot 11, which HA
// does not have, the Ramka theme's.
const HA_PALETTE = ["#4269d0", "#f4bd4a", "#ff725c", "#6cc5b0", "#a463f2", "#ff8ab7", "#9c6b4e", "#97bbf5", "#01ab63", "#9498a0"];
const SLOT_FALLBACK = { 11: "#e040fb" };

// The threshold colours: below a range (blue), above it (red); neutral, fair and poor are the
// settings' colours (NEUTRAL, AIR_COLOURS), these the colours without them (a dashboard that names
// no select): the theme's primary text colour, amber and red.
export const THRESHOLD = {
  low: "var(--ramka-threshold-low, #5b8def)",
  raised: "var(--air-raised, #f5c542)",
  high: "var(--air-high, #ff6b5c)",
  neutral: "var(--primary-text-color)",
};

// The settings' default colours (ids of lib/colours.js): the Climate page's neutral colour and the
// Air page's good, fair and poor, as the package seeds them (templates/package.yaml.j2).
export const NEUTRAL = "green";
export const AIR_COLOURS = { good: "green", fair: "amber", poor: "red" };

// The theme slot of the n-th widget with a reading (1-based).
export const seriesSlot = (n) => SERIES_SLOTS[(n - 1) % SERIES_SLOTS.length];

// A theme slot's colour on `el`: the theme's variable, else the fallback.
export function slotColor(el, slot) {
  const v = getComputedStyle(el).getPropertyValue(`--graph-color-${slot}`).trim();
  return v || SLOT_FALLBACK[slot] || HA_PALETTE[(slot - 1) % HA_PALETTE.length];
}

// A stored entry as a widget: {type, label, main, extra, ...values}, or {type: "empty"}.
// `states` is hass.states, for the device class of an untyped entry's main sensor.
export function readWidget(entry, states) {
  if (!entry || typeof entry !== "object" || entry.spacer || entry.type === "empty") return { type: "empty" };
  const main = typeof entry.main === "string" ? entry.main : "";
  let type = entry.type;
  if (!TYPES.includes(type)) {
    if (!main) return { type: "empty" };
    type = states?.[main]?.attributes?.device_class === "temperature" ? "temperature" : "custom";
  }
  const w = { type, label: String(entry.label || ""), main, extra: typeof entry.extra === "string" ? entry.extra : "" };
  if (type === "temperature") {
    for (const key of Object.keys(COMFORT)) if (Number.isFinite(entry[key])) w[key] = entry[key];
  }
  // A colour id; a theme slot number from the build before the list reads as its colour's id.
  if (type === "custom") {
    const color = typeof entry.color === "number" ? colourOfSlot(entry.color) : entry.color;
    if (COLOUR_IDS.includes(color)) w.color = color;
  }
  return w;
}

// A widget that is a tile with a reading (it takes a series colour); the others are empty tiles.
export const hasReading = (w) => !!(w && w.type !== "empty" && w.main);

// A widget as the script stores it; `label` gives the name of one left empty (from its main sensor).
export function storedWidget(w, label) {
  if (w.type === "empty") return { type: "empty", spacer: true };
  const out = { type: w.type, label: w.label.trim() || (w.main ? label(w.main) : ""), main: w.main, extra: w.extra };
  if (w.type === "temperature") {
    for (const key of Object.keys(COMFORT)) if (Number.isFinite(w[key])) out[key] = w[key];
  }
  if (w.type === "custom" && w.color) out.color = w.color;
  return out;
}

// Where a value sits in a comfort range: "low", "within" or "high"; null without a number.
export function band(value, low, high) {
  if (!Number.isFinite(value)) return null;
  return value < low ? "low" : value > high ? "high" : "within";
}

// An air reading's level from its two limits, as the air-card reads them: below the first is good,
// below the second fair, else poor; null without a number.
export function level(value, fair, poor) {
  if (!Number.isFinite(value)) return null;
  return value < fair ? "good" : value < poor ? "fair" : "poor";
}
