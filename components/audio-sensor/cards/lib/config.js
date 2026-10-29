// Configuration: defaults, validation at setConfig time, and the per-update resolution of
// entity-valued options. No DOM. The flavour registry is passed in (flavourKinds:
// { <flavour>: [<kind>, ...] }), so this module does not depend on the flavours.

import en from "../../translations/en.json" with { type: "json" };
import { createT } from "./i18n.js";
import { nearestBand } from "./sources.js";
import { DEFAULT_LINE_WIDTH } from "./geometry.js";

const t = createT({ en });
// hass is not known at setConfig time, so config errors are always English.
const fail = (key, vars) => { throw new Error(t(null, `card.ambient_wave.error.${key}`, vars)); };

export const DEFAULT_FLAVOUR = { spectrum: "dune", scalar: "centre" };
export const SCENARIOS = ["electronic", "jazz", "vocal", "orchestra", "quiet"];
export const NAMED_PALETTES = ["zones", "series", "calm"];
// What the card draws while its source sends nothing: `none` keeps the flavour, calming; `classic`
// draws Ramka's wave with an info icon, so a strip is never empty while a board is away.
export const FALLBACKS = ["none", "classic"];

// The defaults are the values the card was tuned to on a wall tablet, so a card without options
// looks that way. dB SPL: with the series palette, 30 to 70 keeps a quiet room neutral and
// lets music at a talking level colour the wave without saturating it. Both kinds share the pair;
// they stay separate so a kind can move on its own.
export const DEFAULT_COLOUR = { spectrum: { neutral: 30, hot: 70 }, scalar: { neutral: 30, hot: 70 } };

export const DEFAULTS = {
  flavour: DEFAULT_FLAVOUR,
  flavour_options: {},
  source: { offset: 0, axis: "third_octave", show: [31.5, 16000], history: 40, demo: false, scenario: "electronic" },
  // neutral and hot come from DEFAULT_COLOUR by kind.
  colour: { palette: "series", neutral_color: "var(--primary-color)" },
  dynamics: { rise: 200, fall: 4, hold: 1.5, tilt: true },
  style: { line_width: DEFAULT_LINE_WIDTH },
  controls: false,
  fallback: "none",
  fps: 30,
};

// CSS px; a thinner line vanishes, a thicker one is a band that hides the amplitude.
export const LINE_WIDTH_RANGE = [0.5, 12];
const validLineWidth = (n) => n >= LINE_WIDTH_RANGE[0] && n <= LINE_WIDTH_RANGE[1];

export const ENTITY_OPTION = /^(input_number|input_select|input_boolean|number|select|sensor)\.[a-z0-9_]+$/;
const isEntity = (v) => typeof v === "string" && ENTITY_OPTION.test(v);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// Own keys only: a state such as "constructor" must not reach Object.prototype.
const kindsOf = (flavourKinds, id) => (Object.hasOwn(flavourKinds, id) ? flavourKinds[id] : []);
// makePalette keeps the stops whose position is a number; with none it has no colour to draw.
const validStop = (s) => Array.isArray(s) && s.length >= 1 && s[0] !== null && s[0] !== "" && Number.isFinite(Number(s[0]));

// Options that may be entity ids: dotted path -> { type, allowed?, valid? }. Type "choice" checks
// the state against `allowed` when given; "number" against `valid`. The default is the option's own.
const ENTITY_OPTIONS = {
  "source.offset": { type: "number" },
  "source.history": { type: "number", valid: (n) => n > 0 },
  "source.demo": { type: "boolean" },
  "source.scenario": { type: "choice", allowed: SCENARIOS },
  "colour.palette": { type: "choice", allowed: NAMED_PALETTES },
  "colour.neutral": { type: "number" },
  "colour.hot": { type: "number" },
  "colour.neutral_color": { type: "choice" },
  "dynamics.rise": { type: "number" },
  "dynamics.fall": { type: "number" },
  "dynamics.hold": { type: "number" },
  "dynamics.tilt": { type: "boolean" },
  "style.line_width": { type: "number", valid: validLineWidth },
  controls: { type: "boolean" },
  fps: { type: "number", valid: (n) => n >= 1 && n <= 60 },
  flavour: { type: "choice" },
};

const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
function set(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function merge(defaults, raw) {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(raw ?? {})) {
    out[k] = isObject(v) && isObject(defaults[k]) ? merge(defaults[k], v) : v;
  }
  return out;
}

export function normaliseConfig(raw, flavourKinds) {
  if (!isObject(raw)) fail("config");
  const src = raw.source;
  const kind = src?.kind;
  if (kind !== "spectrum" && kind !== "scalar") fail("source_kind");
  if (!src.entity && src.demo !== true) fail("source_entity");

  const defaults = { ...DEFAULTS, flavour: undefined, colour: { ...DEFAULTS.colour, ...DEFAULT_COLOUR[kind] } };
  const config = merge(defaults, raw);
  config.flavour ??= DEFAULT_FLAVOUR[kind];

  // The engine has the 31 third-octave slots only: another axis would fill some and leave the rest
  // neutral, so it is refused rather than drawn wrong.
  if (config.source.axis !== "third_octave") fail("axis");
  const { show } = config.source;
  const okShow = Array.isArray(show) && show.length === 2 && show.every((f) => typeof f === "number" && f > 0)
    && nearestBand(show[0]) < nearestBand(show[1]);
  if (!okShow) fail("show");

  const flavour = config.flavour;
  if (!isEntity(flavour) && !kindsOf(flavourKinds, flavour).includes(kind)) {
    fail("flavour", { flavour: String(flavour), kind });
  }
  const { palette } = config.colour;
  if (Array.isArray(palette) ? !palette.some(validStop) : typeof palette !== "string") fail("palette");
  const { history } = config.source;
  if (!isEntity(history) && !(typeof history === "number" && Number.isFinite(history) && history > 0)) fail("history");
  const { neutral, hot } = config.colour;
  if (typeof neutral === "number" && typeof hot === "number" && hot <= neutral) fail("colour_hot");
  const { fps } = config;
  if (!isEntity(fps) && !(Number.isFinite(fps) && fps >= 1 && fps <= 60)) fail("fps");
  if (!FALLBACKS.includes(config.fallback)) fail("fallback");
  return config;
}

export function entitiesOf(config) {
  const ids = new Set();
  if (config.source?.entity) ids.add(config.source.entity);
  if (config.active) ids.add(config.active);
  for (const path of Object.keys(ENTITY_OPTIONS)) {
    const v = get(config, path);
    if (isEntity(v)) ids.add(v);
  }
  return [...ids];
}

function readState(spec, id, states, fallback) {
  const s = states?.[id]?.state;
  if (s === undefined || s === "unavailable" || s === "unknown" || s === "") return fallback;
  if (spec.type === "boolean") return s === "on";
  if (spec.type === "number") {
    const n = parseFloat(s);
    return Number.isFinite(n) && (spec.valid?.(n) ?? true) ? n : fallback;
  }
  return spec.allowed && !spec.allowed.includes(s) ? fallback : s;
}

export function resolveOptions(config, states, flavourKinds) {
  const out = structuredClone(config);
  const kind = config.source.kind;
  const defaultOf = (path) => {
    if (path === "flavour") return DEFAULT_FLAVOUR[kind];
    if (path === "colour.neutral" || path === "colour.hot") return DEFAULT_COLOUR[kind][path.slice(7)];
    return get(DEFAULTS, path);
  };

  for (const [path, spec] of Object.entries(ENTITY_OPTIONS)) {
    const v = get(config, path);
    if (!isEntity(v)) continue;
    const fallback = defaultOf(path);
    let value = readState(spec, v, states, fallback);
    if (path === "flavour" && !kindsOf(flavourKinds, value).includes(kind)) value = fallback;
    set(out, path, value);
  }
  // A literal flavour or number is the author's, except the line width: the console and the editor
  // bound it, and a hand-written value outside the range falls back like an entity state would.
  const lw = out.style?.line_width;
  if (!(typeof lw === "number" && validLineWidth(lw))) out.style = { ...out.style, line_width: DEFAULT_LINE_WIDTH };
  return orderColour(out);
}

// A hot at or below neutral would reverse the palette and turn bars upside down: the kind's defaults
// instead. The card applies it again after merging the console's session values.
export function orderColour(options) {
  if (!(options.colour.hot > options.colour.neutral)) Object.assign(options.colour, DEFAULT_COLOUR[options.source.kind]);
  return options;
}
