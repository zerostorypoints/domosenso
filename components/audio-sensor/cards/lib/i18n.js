// Shared i18n helper for the ambient wave card. Plain ES module: no imports, no DOM.
// The same as Ramka's cards/lib/i18n.js: a component installs on its own, so each ships its copy.
// A fix to one belongs in both.
// A key missing in the language falls back to `en`, and to the key itself only when `en` lacks it too.

const SUPPORTED = ["en", "de", "pl"];
const DATE_LOCALES = { en: "en-GB", de: "de-CH", pl: "pl-PL" };

export function language(hass) {
  const tag = hass?.locale?.language || hass?.language || "en";
  const base = String(tag).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(base) ? base : "en";
}

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
      ? String(vars[name])
      : match
  );
}

export function createT(dicts) {
  return (hass, key, vars) => {
    const text = lookup(dicts[language(hass)], key) ?? lookup(dicts.en, key) ?? key;
    return interpolate(text, vars);
  };
}

export function plural(hass, count, forms) {
  const category = new Intl.PluralRules(language(hass)).select(count);
  const form = forms[category] ?? forms.other;
  return form == null ? "" : interpolate(form, { count });
}

export function formatDate(hass, date, options) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(DATE_LOCALES[language(hass)], options).format(date);
}

// Short weekday name. A language may define its own shape under
// card.common.weekday_short.0 ... .6 (0 = Sunday, as Date.getDay()), e.g. Polish "nd pn wt";
// without those keys the Intl short form is used. `t` is the card's translator.
export function weekdayShort(hass, date, t) {
  const key = `card.common.weekday_short.${date instanceof Date ? date.getDay() : ""}`;
  const text = t(hass, key);
  return text !== key ? text : formatDate(hass, date, { weekday: "short" });
}
