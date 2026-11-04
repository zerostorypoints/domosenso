// Small helpers the Rooms tab and the room page share: patching the DOM without rebuilding it,
// numbers in the dashboard's language, a service call whose failure becomes the shell's toast,
// and the facts about a room both pages show (its lights, how many are on, whether it plays).

import { reportError } from "./report.js";

const NUMBER_LOCALES = { en: "en-GB", de: "de-CH", pl: "pl-PL" };
const formats = new Map();     // one Intl.NumberFormat per language and number of digits
const pluralRules = new Map();

export const GONE = new Set(["unavailable", "unknown"]);

export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

export function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

// grouping: false for readings such as CO2 ppm, shown as 1300 rather than 1,300.
export function number(ctx, value, digits, { grouping = true } = {}) {
  const key = `${ctx.lang}/${digits}/${grouping}`;
  if (!formats.has(key)) {
    formats.set(key, new Intl.NumberFormat(NUMBER_LOCALES[ctx.lang] ?? "en-GB", {
      minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping }));
  }
  return formats.get(key).format(value);
}

export function temperature(ctx, value) {
  return value == null ? ctx.t("card.pocket.format.none")
    : ctx.t("card.pocket.format.temperature", { value: number(ctx, value, 1) });
}

export function percent(ctx, value) {
  return value == null ? ctx.t("card.pocket.format.none")
    : ctx.t("card.pocket.format.percent", { value: number(ctx, value, 0) });
}

// The plural category of a count in the dashboard's language (one, few, many, other), as
// Intl.PluralRules names them: a counted text is a group of keys, one per category, and the page
// looks up t(`<group>.${pluralOf(ctx, n)}`) (a literal group key would not be a text).
export function pluralOf(ctx, count) {
  const locale = NUMBER_LOCALES[ctx.lang] ?? "en-GB";
  if (!pluralRules.has(locale)) pluralRules.set(locale, new Intl.PluralRules(locale));
  return pluralRules.get(locale).select(count);
}

// A service call whose failure becomes the shell's toast (lib/report.js).
export function call(root, hass, domain, service, data, errorKey) {
  let result;
  try {
    result = hass.callService(domain, service, data);
  } catch (err) {
    result = Promise.reject(err);
  }
  result?.catch?.(() => reportError(root, errorKey));
}

export const lightsOf = (room) => [room.lights ?? []].flat().filter(Boolean);
export const isOn = (hass, id) => hass?.states?.[id]?.state === "on";

// The lamps of a room: the members of its light group (the group's entity_id attribute) when the
// room names one group, else the lights it names. A single light without members has none.
export function membersOf(hass, room) {
  const lights = lightsOf(room);
  if (lights.length !== 1) return lights;
  const members = hass?.states?.[lights[0]]?.attributes?.entity_id;
  return Array.isArray(members) ? members.filter((id) => typeof id === "string") : [];
}

// The one definition of "lights on" (Home's chip, All off, the room strip, the Rooms tab): the
// lamps of a room are its group's members, else the lights it names; a lamp is counted once
// however many rooms name it.
export function lampsOf(hass, room) {
  const members = membersOf(hass, room);
  return members.length ? members : lightsOf(room);
}

export const lightsOn = (hass, room) => lightsOnIn(hass, [room]);

export function lightsOnIn(hass, rooms) {
  const lamps = new Set(rooms.flatMap((room) => lampsOf(hass, room)));
  return [...lamps].filter((id) => isOn(hass, id)).length;
}

// A line of texts joined by " · ", each its own span; a part with muted: true (a reading that is
// unavailable, shown as a dash) gets the muted class. Rebuilt only when a text or flag changes.
export function setLine(line, parts) {
  const key = JSON.stringify(parts.map((p) => [p.text, !!p.muted]));
  if (line._lineKey === key) return;
  line._lineKey = key;
  const nodes = [];
  parts.forEach((part, i) => {
    if (i > 0) nodes.push(document.createTextNode(" · "));
    const span = el("span", part.muted ? "muted" : "");
    span.textContent = part.text;
    nodes.push(span);
  });
  line.replaceChildren(...nodes);
}

export const playerOf = (room) => [room.media ?? []].flat().find(Boolean);
export const playing = (hass, room) =>
  [room.media ?? []].flat().some((id) => id && hass?.states?.[id]?.state === "playing");

// An entity's name for a tile or button inside its room: the friendly name without the room's
// name in front ("Living room Relax" -> "Relax"), else the object id.
export function shortName(hass, id, room) {
  const name = hass?.states?.[id]?.attributes?.friendly_name || id.split(".").pop().replace(/_/g, " ");
  const prefix = `${room.name} `;
  const short = name.toLowerCase().startsWith(prefix.toLowerCase()) ? name.slice(prefix.length).trim() : name;
  return short || name;
}
