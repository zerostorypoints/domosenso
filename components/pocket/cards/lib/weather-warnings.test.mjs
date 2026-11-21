import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITIES, windOf, windText, kmh, dayWind, dayWindText, warningsOf, warningChip, chipText, untilText, sheetRows, TYPE_ICONS,
} from "./weather-warnings.js";
import { createT } from "./i18n.js";
import en from "../../translations/en.json" with { type: "json" };
import de from "../../translations/de.json" with { type: "json" };
import pl from "../../translations/pl.json" with { type: "json" };

const translate = createT({ en, de, pl });
const ctxOf = (hass, lang = "en") => ({ hass, lang, t: (key, vars) => translate({ locale: { language: lang } }, key, vars) });
const level = (state, attributes = {}) => ({ [ENTITIES.level]: { state, attributes: {
  speed: 32, gust: null, judged: 32, bearing: 225, direction: "SW", ...attributes } } });
const warning = (state = "on") => ({ [ENTITIES.warning]: { state, attributes: {} } });
const hassOf = (...parts) => ({ states: Object.assign({}, ...parts) });

test("without the weather component there is no wind and no chip", () => {
  const hass = hassOf({ "weather.home": { state: "cloudy", attributes: { wind_speed: 32 } } });
  assert.equal(windOf(hass), null);
  assert.equal(windText(ctxOf(hass), windOf(hass)), "");
  assert.equal(warningChip(hass), null);
  assert.deepEqual(dayWind(hass, "weather.home", { wind_speed: 20 }, "2026-11-18"), { speed: null, gust: null },
    "a forecast day's wind only with the weather component");
  assert.equal(windOf(hassOf(level("unavailable"))), null, "an unavailable level is no wind");
});

test("the row's wind: speed and direction always, the level word from breezy, the gust when known", () => {
  const ctx = ctxOf(null);
  assert.equal(windText(ctx, windOf(hassOf(level("calm", { speed: 12, direction: "N" })))), "12 km/h N");
  assert.equal(windText(ctx, windOf(hassOf(level("breezy")))), "Breezy · 32 km/h SW");
  assert.equal(windText(ctx, windOf(hassOf(level("breezy", { gust: 48.6 })))), "Breezy · 32 km/h SW, gusts 49");
  assert.equal(windText(ctx, windOf(hassOf(level("strong", { speed: 45, direction: null })))), "Strong wind · 45 km/h");
  assert.equal(windText(ctx, windOf(hassOf(level("gale", { speed: 70 })))), "Gale · 70 km/h SW");
  assert.equal(windText(ctx, windOf(hassOf(level("breezy", { speed: null })))), "", "no speed: no wind text");
});

test("the level words and gusts in German and Polish", () => {
  const wind = windOf(hassOf(level("breezy", { gust: 49, direction: "NE" })));
  assert.equal(windText(ctxOf(null, "de"), wind), "Frischer Wind · 32 km/h NO, Böen 49");
  assert.equal(windText(ctxOf(null, "pl"), wind), "Wietrznie · 32 km/h NE, porywy 49");
  for (const [lang, words] of [["en", ["Calm", "Breezy", "Strong wind", "Gale"]], ["de", ["Ruhig", "Frischer Wind", "Starker Wind", "Sturm"]],
    ["pl", ["Spokojnie", "Wietrznie", "Silny wiatr", "Wichura"]]]) {
    const ctx = ctxOf(null, lang);
    assert.deepEqual(["calm", "breezy", "strong", "gale"].map((l) => ctx.t(`card.pocket.wind.level.${l}`)), words);
  }
});

test("kmh: the weather entity's unit; an unknown unit is left out", () => {
  assert.equal(kmh(10, "m/s"), 36);
  assert.equal(kmh(20, "km/h"), 20);
  assert.equal(kmh(20, undefined), 20);
  assert.ok(Math.abs(kmh(10, "kn") - 18.52) < 1e-9);
  assert.equal(kmh(10, "furlongs"), null);
  assert.equal(kmh(undefined, "km/h"), null);
});

test("a forecast day: its wind_speed and the gust maximum of its date, each only when given", () => {
  const gust = { [ENTITIES.gust]: { state: "48.6", attributes: { daily: {
    time: ["2026-11-18", "2026-11-19", "2026-11-20"], wind_gusts_10m_max: [52.3, 71, null] } } } };
  const hass = hassOf(level("breezy"), gust, { "weather.home": { state: "cloudy", attributes: { wind_speed_unit: "m/s" } } });
  assert.deepEqual(dayWind(hass, "weather.home", { wind_speed: 5 }, "2026-11-19"), { speed: 18, gust: 71 });
  assert.deepEqual(dayWind(hass, "weather.home", {}, "2026-11-18"), { speed: null, gust: 52.3 });
  assert.deepEqual(dayWind(hass, "weather.home", { wind_speed: 5 }, "2026-11-20"), { speed: 18, gust: null });
  assert.deepEqual(dayWind(hass, "weather.home", { wind_speed: 5 }, "2026-11-25"), { speed: 18, gust: null });
  assert.deepEqual(dayWind(hassOf(level("calm")), "weather.home", { wind_speed: 14 }, "2026-11-18"), { speed: 14, gust: null },
    "no gust sensor (gusts: none): the speed only");
  const ctx = ctxOf(null);
  assert.equal(dayWindText(ctx, { speed: 18, gust: 71 }), "18 km/h, gusts 71");
  assert.equal(dayWindText(ctx, { speed: null, gust: 52.3 }), "gusts 52 km/h");
  assert.equal(dayWindText(ctx, { speed: 18, gust: null }), "18 km/h");
  assert.equal(dayWindText(ctx, { speed: null, gust: null }), "");
});

test("the chip only while the warning binary sensor is on", () => {
  assert.equal(warningChip(hassOf(level("strong", { speed: 45 }), warning("off"))), null);
  assert.equal(warningChip(hassOf(level("strong", { speed: 45 }))), null, "no binary sensor: no chip");
  assert.equal(warningChip(hassOf(level("calm"), warning("unavailable"))), null);
});

test("the chip per level: strong fair, gale poor; the gust when it judged the level", () => {
  const ctx = ctxOf(null);
  const strong = warningChip(hassOf(level("strong", { speed: 45, gust: 52 }), warning()));
  assert.deepEqual(strong, { kind: "strong", tone: "fair", value: 45 });
  assert.equal(chipText(ctx, strong), "Strong wind · 45 km/h");
  const gale = warningChip(hassOf(level("gale", { speed: 40, gust: 95 }), warning()));
  assert.deepEqual(gale, { kind: "gale", tone: "poor", value: 95, gusty: true });
  assert.equal(chipText(ctx, gale), "Gale · gusts 95 km/h");
  assert.equal(chipText(ctxOf(null, "de"), gale), "Sturm · Böen 95 km/h");
  assert.equal(chipText(ctxOf(null, "pl"), gale), "Wichura · porywy 95 km/h");
  // The binary sensor's off-delay: the level has fallen, the chip still says strong wind.
  const after = warningChip(hassOf(level("breezy", { speed: 33 }), warning()));
  assert.deepEqual(after, { kind: "strong", tone: "fair", value: 33 });
  assert.equal(chipText(ctx, warningChip(hassOf(level("gale", { speed: null }), warning()))), "Gale");
});

// --- official warnings (amendment 1) ------------------------------------------------------------

const entry = (type, lvl, extra = {}) => ({ type, level: lvl, severity: { yellow: 2, orange: 3, red: 4 }[lvl],
  event: `${lvl} ${type} event`, headline: `${lvl} ${type} headline`, onset: "2026-11-18T06:00:00+00:00",
  expires: "2026-11-18T17:00:00+00:00", ...extra });
const feed = (...warnings) => ({ [ENTITIES.warnings]: { state: String(warnings.length), attributes: { warnings } } });

test("warningsOf: most severe first, unknown types as other, entries without a level left out", () => {
  assert.deepEqual(warningsOf(hassOf()), [], "no warnings sensor (warnings not configured)");
  assert.deepEqual(warningsOf(hassOf({ [ENTITIES.warnings]: { state: "unavailable", attributes: {} } })), []);
  const list = warningsOf(hassOf(feed(entry("rain", "yellow"), entry("thunderstorm", "orange"),
    entry("tsunami", "yellow", { headline: null }), entry("fog", "green"), entry("heat", "red", { headline: "", expires: null }))));
  assert.deepEqual(list.map((w) => [w.type, w.level, w.tone, w.icon]), [
    ["heat", "red", "poor", "mdi:thermometer-high"],
    ["thunderstorm", "orange", "orange", "mdi:weather-lightning"],
    ["rain", "yellow", "fair", "mdi:weather-pouring"],
    ["other", "yellow", "fair", "mdi:alert"],
  ]);
  assert.equal(list[0].title, "red heat event", "no headline: the event");
  assert.equal(list[0].expires, null);
  assert.equal(list[3].title, "yellow tsunami event");
});

test("every type has its icon and its name in en, de and pl", () => {
  const types = ["wind", "snow_ice", "thunderstorm", "fog", "heat", "cold", "coastal", "forest_fire", "avalanche",
    "rain", "flood", "rain_flood", "other"];
  assert.deepEqual(Object.keys(TYPE_ICONS).sort(), [...types].sort());
  assert.equal(TYPE_ICONS.flood, TYPE_ICONS.rain_flood);
  for (const lang of ["en", "de", "pl"]) {
    const ctx = ctxOf(null, lang);
    for (const type of types) assert.doesNotMatch(ctx.t(`card.pocket.warnings.type.${type}`), /^card\./, `${lang} ${type}`);
  }
  assert.equal(ctxOf(null, "de").t("card.pocket.warnings.type.snow_ice"), "Schnee und Eis");
  assert.equal(ctxOf(null, "pl").t("card.pocket.warnings.type.rain_flood"), "Deszcz i powódź");
});

test("the chip: the most severe official warning, its level's colour, +n for the others", () => {
  const ctx = ctxOf(null);
  const one = warningChip(hassOf(level("calm"), warning(), feed(entry("thunderstorm", "orange"))));
  assert.deepEqual(one, { kind: "warning", type: "thunderstorm", level: "orange", tone: "orange", more: 0 });
  assert.equal(chipText(ctx, one), "Orange warning · Thunderstorm");
  const three = warningChip(hassOf(level("calm"), warning(), feed(entry("rain", "yellow"), entry("wind", "red"), entry("fog", "yellow"))));
  assert.deepEqual(three, { kind: "warning", type: "wind", level: "red", tone: "poor", more: 2 });
  assert.equal(chipText(ctx, three), "Red warning · Wind +2");
  assert.equal(chipText(ctxOf(null, "de"), three), "Rote Warnung · Wind +2");
  assert.equal(chipText(ctxOf(null, "pl"), three), "Czerwone ostrzeżenie · Wiatr +2");
  const yellow = warningChip(hassOf(warning(), feed(entry("snow_ice", "yellow"), entry("cold", "yellow"))));
  assert.equal(yellow.tone, "fair");
  assert.equal(chipText(ctx, yellow), "Yellow warning · Snow and ice +1");
  assert.equal(chipText(ctx, warningChip(hassOf(warning(), feed(entry("tsunami", "yellow"))))), "Yellow warning",
    "a type the feed does not name: the level alone");
});

test("the chip: an official warning wins over Met.no's gale; without warnings the wind level drives it", () => {
  const both = warningChip(hassOf(level("gale", { speed: 70 }), warning(), feed(entry("rain", "yellow"))));
  assert.equal(both.kind, "warning");
  assert.equal(chipText(ctxOf(null), both), "Yellow warning · Rain");
  // A feed with nothing in effect, or no feed at all (warnings not configured): the wind as before.
  for (const extra of [feed(), {}]) {
    const chip = warningChip(hassOf(level("gale", { speed: 70 }), warning(), extra));
    assert.deepEqual(chip, { kind: "gale", tone: "poor", value: 70 });
    assert.equal(chipText(ctxOf(null), chip), "Gale · 70 km/h");
  }
  assert.equal(warningChip(hassOf(level("calm"), warning("off"), feed(entry("rain", "red")))), null,
    "the binary sensor decides when the chip shows");
  // Warnings only: no level sensor (gusts and level are always there with the component, but the
  // chip does not need them).
  assert.equal(chipText(ctxOf(null), warningChip(hassOf(warning(), feed(entry("fog", "yellow"))))), "Yellow warning · Fog");
});

test("until: the time today, the weekday and time another day, in Home Assistant's zone", () => {
  const hass = { config: { time_zone: "Europe/Berlin" } };
  const now = new Date("2026-11-18T09:00:00Z");
  assert.equal(untilText(ctxOf(hass), "2026-11-18T17:00:00+00:00", now), "until 18:00");
  assert.equal(untilText(ctxOf(hass), "2026-11-19T05:30:00+00:00", now), "until Thu 06:30");
  assert.equal(untilText(ctxOf(hass, "de"), "2026-11-19T05:30:00+00:00", now), "bis Do 06:30");
  assert.equal(untilText(ctxOf(hass, "pl"), "2026-11-18T17:00:00+00:00", now), "do 18:00");
  // 23:30 UTC is already the next day in Berlin.
  assert.equal(untilText(ctxOf(hass), "2026-11-18T23:30:00+00:00", now), "until Thu 00:30");
  assert.equal(untilText(ctxOf(hass), null, now), "");
  assert.equal(untilText(ctxOf(hass), "not a time", now), "");
});

test("the sheet's list: every warning, then the wind line while it is strong", () => {
  const now = new Date("2026-11-18T09:00:00Z");
  const zone = { config: { time_zone: "UTC" } };
  const ctx = (states, lang) => ctxOf({ ...zone, ...hassOf(...states) }, lang);
  assert.deepEqual(sheetRows(ctx([]), now), [], "no weather component: no list");
  assert.deepEqual(sheetRows(ctx([level("breezy", { gust: 40 }), warning("off"), feed()]), now), [], "nothing dangerous: no list");
  const rows = sheetRows(ctx([level("strong", { speed: 45, gust: 60 }), warning(),
    feed(entry("rain", "yellow"), entry("thunderstorm", "orange", { expires: "2026-11-19T18:00:00+00:00" }),
      entry("fog", "yellow", { headline: null, event: null, expires: null }))]), now);
  assert.deepEqual(rows, [
    { key: "warning-0", icon: "mdi:weather-lightning", tone: "orange", title: "orange thunderstorm headline",
      detail: "Orange warning · until Thu 18:00" },
    { key: "warning-1", icon: "mdi:weather-pouring", tone: "fair", title: "yellow rain headline", detail: "Yellow warning · until 17:00" },
    { key: "warning-2", icon: "mdi:weather-fog", tone: "fair", title: "Fog", detail: "Yellow warning" },
    { key: "wind", icon: "mdi:weather-windy", tone: "fair", title: "Strong wind · 45 km/h SW, gusts 60", detail: "" },
  ]);
  const pl = sheetRows(ctx([level("gale", { speed: 80 }), warning(), feed(entry("wind", "red"))], "pl"), now);
  assert.deepEqual(pl.map((r) => [r.tone, r.title, r.detail]), [
    ["poor", "red wind headline", "Czerwone ostrzeżenie · do 17:00"], ["poor", "Wichura · 80 km/h SW", ""]]);
  // Warnings with a calm wind: no wind line.
  assert.deepEqual(sheetRows(ctx([level("calm"), warning(), feed(entry("heat", "yellow"))]), now).map((r) => r.key), ["warning-0"]);
  // The off-delay: the level fell, the chip still says the wind, and so does the sheet.
  assert.deepEqual(sheetRows(ctx([level("breezy", { speed: 33 }), warning()]), now).map((r) => r.title), ["Breezy · 33 km/h SW"]);
  // Warnings only, without a level sensor.
  assert.deepEqual(sheetRows(ctx([warning(), feed(entry("fog", "yellow"))]), now).map((r) => r.icon), ["mdi:weather-fog"]);
});
