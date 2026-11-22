// Dangerous weather as the weather component judges it (SPEC-056 and its amendment 1), as Pocket
// shows it: the wind in the weather row and the forecast sheet's days, Home's warning chip and the
// forecast sheet's list of warnings. Plain ES module: no DOM. Without the weather component's
// entities every function gives null, [] or "", so Pocket looks as it did before.
//
//   ENTITIES = {level, warning, warnings, gust}   the weather component's provided ids (manifest
//       `consumes`)
//   windOf(hass) -> null | {level, speed, gust, judged, direction}
//       sensor.weather_wind_level: null when it is missing or its state is not a level (unavailable)
//   windText(ctx, wind) -> "32 km/h SW", "Breezy · 32 km/h SW, gusts 49", "" without a speed
//   kmh(value, unit) -> km/h, or null (not a number, or a unit not known)
//   dayWind(hass, entity, day, date) -> {speed, gust}   a forecast day's wind_speed in km/h (the
//       weather entity's wind_speed_unit) and its gust maximum from sensor.weather_wind_gust's
//       `daily` (Open-Meteo's shape) on the date "YYYY-MM-DD"; null where not given, both null
//       when Home Assistant has no level sensor (no weather component: the day reads as before)
//   dayWindText(ctx, wind) -> "18 km/h, gusts 45", "gusts 45 km/h", ""
//   warningsOf(hass) -> [{type, level, tone, icon, severity, title, expires}]
//       sensor.weather_warnings's `warnings`, most severe first (the feed's order within a level);
//       an entry without a known level is left out, an unknown type is "other". title: the feed's
//       headline, else its event, else null (the feed's own words, in the language the home chose
//       for it: never translated). [] without the sensor (a home without warnings configured)
//   warningChip(hass) -> null | chip   while binary_sensor.weather_warning is on:
//       {kind: "warning", type, level, tone, more}: the most severe official warning, more the
//           number of the others;
//       else {kind: "strong" | "gale", tone: "fair" | "poor", value?, gusty?}: Met.no's level, gale
//           poor, strong fair (and strong for a lower level still within the binary sensor's
//           off-delay). value: the gust when the gust judged the level (gust / 1.5 above the
//           speed, as the weather package judges), gusty true; else the speed
//   chipText(ctx, chip) -> "Orange warning · Thunderstorm", "Yellow warning · Wind +1",
//       "Yellow warning" (type other), "Strong wind · 45 km/h", "Gale · gusts 95 km/h"
//   sheetRows(ctx, now?) -> [{key, icon, tone, title, detail}]   the forecast sheet's list: every
//       official warning (title: its headline, else its type's name; detail: "Orange warning ·
//       until Thu 18:00", the level alone without an end), then the wind line while the level is
//       strong or a gale, or while the chip shows the wind (title: windText, no detail); [] when
//       neither applies
//   untilText(ctx, iso, now?) -> "until 18:00" today, "until Thu 18:00" another day, in Home
//       Assistant's time zone (the browser's without one) and the card's language; "" without a time
//
// tone: the dot's and the icon's colour class, fair (--warn), orange (--orange) or poor (--bad).

import { number } from "./page-kit.js";
import { formatDate } from "./i18n.js";

export const ENTITIES = {
  level: "sensor.weather_wind_level",
  warning: "binary_sensor.weather_warning",
  warnings: "sensor.weather_warnings",
  gust: "sensor.weather_wind_gust",
};
export const LEVELS = ["calm", "breezy", "strong", "gale"];
// As the weather package's judge(): a gust of 1.5 times a threshold counts as reaching it.
export const GUST_FACTOR = 1.5;
const FACTORS = { "km/h": 1, "m/s": 3.6, mph: 1.609344, kn: 1.852, "ft/s": 1.09728 };
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
// MeteoAlarm's levels from yellow up, as Pocket's colours, and their order (most severe first).
const WARNING_TONES = { yellow: "fair", orange: "orange", red: "poor" };
const SEVERITY = { yellow: 2, orange: 3, red: 4 };
export const TYPE_ICONS = {
  wind: "mdi:weather-windy", snow_ice: "mdi:snowflake-alert", thunderstorm: "mdi:weather-lightning",
  fog: "mdi:weather-fog", heat: "mdi:thermometer-high", cold: "mdi:snowflake-thermometer",
  coastal: "mdi:waves", forest_fire: "mdi:fire-alert", avalanche: "mdi:image-filter-hdr",
  rain: "mdi:weather-pouring", flood: "mdi:home-flood", rain_flood: "mdi:home-flood", other: "mdi:alert",
};

const isNumber = (x) => typeof x === "number" && Number.isFinite(x);
const numeric = (x) => {
  if (isNumber(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
};
const textOf = (x) => (typeof x === "string" && x.trim() && x !== "None" ? x.trim() : null);

export function kmh(value, unit) {
  const v = numeric(value);
  // Home Assistant's weather entities always name their unit; without one it is km/h, as the
  // weather package reads it.
  const factor = FACTORS[unit ?? "km/h"];
  return v == null || factor == null ? null : v * factor;
}

export function windOf(hass) {
  const state = hass?.states?.[ENTITIES.level];
  if (!state || !LEVELS.includes(state.state)) return null;
  const a = state.attributes ?? {};
  return {
    level: state.state,
    speed: numeric(a.speed),
    gust: numeric(a.gust),
    judged: numeric(a.judged),
    direction: DIRECTIONS.includes(a.direction) ? a.direction : null,
  };
}

const whole = (ctx, value) => number(ctx, value, 0);
const directionOf = (ctx, direction) => ctx.t(`card.pocket.wind.direction.${direction}`);

export function windText(ctx, wind) {
  if (!wind || wind.speed == null) return "";
  const value = whole(ctx, wind.speed);
  let text = wind.direction
    ? ctx.t("card.pocket.wind.speed_from", { value, direction: directionOf(ctx, wind.direction) })
    : ctx.t("card.pocket.wind.speed", { value });
  if (wind.gust != null) text = ctx.t("card.pocket.wind.with_gusts", { text, gust: whole(ctx, wind.gust) });
  // The level word from breezy up; calm says nothing a speed does not.
  if (wind.level !== "calm") text = ctx.t("card.pocket.wind.leveled", { level: ctx.t(`card.pocket.wind.level.${wind.level}`), text });
  return text;
}

// The date's gust maximum in the gust sensor's `daily`, or null.
function gustOn(hass, date) {
  const daily = hass?.states?.[ENTITIES.gust]?.attributes?.daily;
  const times = daily?.time;
  const maxima = daily?.wind_gusts_10m_max;
  if (!date || !Array.isArray(times) || !Array.isArray(maxima)) return null;
  const i = times.indexOf(date);
  return i < 0 ? null : numeric(maxima[i]);
}

export function dayWind(hass, entity, day, date) {
  if (!hass?.states?.[ENTITIES.level]) return { speed: null, gust: null };
  const unit = hass?.states?.[entity]?.attributes?.wind_speed_unit;
  return { speed: kmh(day?.wind_speed, unit), gust: gustOn(hass, date) };
}

export function dayWindText(ctx, wind) {
  const speed = wind?.speed != null ? ctx.t("card.pocket.wind.speed", { value: whole(ctx, wind.speed) }) : null;
  const gust = wind?.gust != null ? whole(ctx, wind.gust) : null;
  if (speed && gust != null) return ctx.t("card.pocket.wind.with_gusts", { text: speed, gust });
  if (gust != null) return ctx.t("card.pocket.wind.gusts_only", { gust });
  return speed ?? "";
}

// --- official warnings and the chip -------------------------------------------------------------

export function warningsOf(hass) {
  const list = hass?.states?.[ENTITIES.warnings]?.attributes?.warnings;
  if (!Array.isArray(list)) return [];
  const found = [];
  for (const item of list) {
    const level = textOf(item?.level)?.toLowerCase();
    if (!(level in SEVERITY)) continue;
    const type = textOf(item?.type)?.toLowerCase();
    const known = type in TYPE_ICONS ? type : "other";
    found.push({ type: known, level, tone: WARNING_TONES[level], icon: TYPE_ICONS[known], severity: SEVERITY[level],
      title: textOf(item?.headline) ?? textOf(item?.event), expires: textOf(item?.expires) });
  }
  // The feed sends them most severe first; a stable sort keeps its order within a level.
  return found.sort((a, b) => b.severity - a.severity);
}

function windChip(wind) {
  const kind = wind?.level === "gale" ? "gale" : "strong";
  const chip = { kind, tone: kind === "gale" ? "poor" : "fair" };
  const speed = wind?.speed ?? null;
  const gust = wind?.gust ?? null;
  if (gust != null && (speed == null || gust / GUST_FACTOR > speed)) {
    chip.value = gust;
    chip.gusty = true;
  } else if (speed != null) chip.value = speed;
  return chip;
}

export function warningChip(hass) {
  if (hass?.states?.[ENTITIES.warning]?.state !== "on") return null;
  const warnings = warningsOf(hass);
  if (!warnings.length) return windChip(windOf(hass));
  const [first] = warnings;
  return { kind: "warning", type: first.type, level: first.level, tone: first.tone, more: warnings.length - 1 };
}

const typeName = (ctx, type) => ctx.t(`card.pocket.warnings.type.${type}`);
const levelName = (ctx, level) => ctx.t(`card.pocket.warnings.level.${level}`);

export function chipText(ctx, chip) {
  if (!chip) return "";
  if (chip.kind === "warning") {
    // "Yellow warning · Warning" would say it twice: a type the feed does not name is the level alone.
    const level = levelName(ctx, chip.level);
    const text = chip.type === "other" ? level : ctx.t("card.pocket.wind.chip", { level, text: typeName(ctx, chip.type) });
    return chip.more > 0 ? ctx.t("card.pocket.warnings.more", { text, count: chip.more }) : text;
  }
  const level = ctx.t(`card.pocket.wind.level.${chip.kind}`);
  if (chip.value == null) return level;
  const value = whole(ctx, chip.value);
  const text = chip.gusty ? ctx.t("card.pocket.wind.gusts_only", { gust: value }) : ctx.t("card.pocket.wind.speed", { value });
  return ctx.t("card.pocket.wind.chip", { level, text });
}

// --- until when ---------------------------------------------------------------------------------

const zones = new Map();       // time zone -> whether this browser knows it
// Home Assistant's time zone when the browser knows it, else none (the browser's own).
function zoneOf(hass) {
  const zone = hass?.config?.time_zone;
  if (typeof zone !== "string" || !zone) return undefined;
  if (!zones.has(zone)) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      zones.set(zone, true);
    } catch {
      zones.set(zone, false);
    }
  }
  return zones.get(zone) ? zone : undefined;
}

const zoned = (options, timeZone) => (timeZone ? { ...options, timeZone } : options);
const ymd = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", zoned({ year: "numeric", month: "2-digit", day: "2-digit" }, timeZone)).format(date);

export function untilText(ctx, iso, now = new Date()) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const timeZone = zoneOf(ctx.hass);
  const locale = { locale: { language: ctx.lang } };
  const time = formatDate(locale, date, zoned({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone));
  if (ymd(date, timeZone) === ymd(now, timeZone)) return ctx.t("card.pocket.warnings.until", { time });
  const day = formatDate(locale, date, zoned({ weekday: "short" }, timeZone));
  return ctx.t("card.pocket.warnings.until_day", { day, time });
}

// --- the forecast sheet's list ------------------------------------------------------------------

export function sheetRows(ctx, now = new Date()) {
  const rows = warningsOf(ctx.hass).map((w, i) => {
    const level = levelName(ctx, w.level);
    const until = untilText(ctx, w.expires, now);
    return { key: `warning-${i}`, icon: w.icon, tone: w.tone, title: w.title ?? typeName(ctx, w.type),
      detail: until ? ctx.t("card.pocket.warnings.detail", { level, until }) : level };
  });
  const wind = windOf(ctx.hass);
  // The wind line while the level is strong or a gale, and while the chip says the wind (the
  // binary sensor's off-delay after the level fell), so the sheet the chip opened says why.
  const windy = wind?.level === "strong" || wind?.level === "gale";
  const chip = warningChip(ctx.hass);
  if (windy || (wind && chip && chip.kind !== "warning")) {
    const title = windText(ctx, wind);
    if (title) rows.push({ key: "wind", icon: TYPE_ICONS.wind, tone: wind.level === "gale" ? "poor" : "fair", title, detail: "" });
  }
  return rows;
}
