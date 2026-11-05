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
export function ctxOf({ hass = hassOf(), lang = "en", cfg = config, offline = false, routeId, timeoutMs } = {}) {
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
