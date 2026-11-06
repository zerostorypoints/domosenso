// The weather of the configured `weather` entity: today and the next days, as Home (a compact
// row), the Climate page (a strip) and the forecast sheet (every day) show it.
//
//   watchForecast(hass, entity, listener) -> stop()
//       the daily forecast the way Home Assistant's own weather card gets it: the websocket
//       subscription weather/subscribe_forecast (forecast_type daily). One subscription per entity
//       however many widgets watch it; the last stop() ends it (a new connection starts a new
//       one). listener() runs whenever new days arrive or the subscription fails. A refused
//       subscription is asked for again after RETRY_S (10, 30, 60, then every 300 s), as the
//       Ramka's clock-weather-card does, until it is accepted or the last widget stops.
//   daysOf(hass, entity) -> [day]   the subscription's days; until it has some (an old Home
//       Assistant, a refused call, a hass without subscribeMessage), the entity's `forecast`
//       attribute (older integrations still carry it); [] without either
//   splitDays(days, now?, limit?, timeZone?) -> {today, next}   today: the day dated today, else
//       null (a day gone by is dropped); next: the following days, at most limit (NEXT_DAYS).
//       Dates are Home Assistant's (timeZone: hass.config.time_zone, the browser's without it), and a day
//       at exactly midnight UTC, as some integrations send a date, is that UTC date
//   dayKey(day, timeZone?) -> {date: "YYYY-MM-DD", zone}   the date a day stands for, and the
//       zone to name its weekday in
//   iconOf(condition) -> an mdi icon name, as the Ramka's clock-weather-card maps Home
//       Assistant's weather conditions
//   <pocket-forecast mode="row|strip|list">   the widget: el.ctx = ctx (page contract) draws it;
//       it watches the forecast while it is connected and stops when it leaves the page or the
//       sheet. row: the temperature outside now (nowTemperature), the current condition, today's
//       high / low and its chance of rain; strip:
//       today and the next days in columns; list: one line per day the forecast has.
//   nowTemperature(ctx) -> number | null   the temperature outside now: the home's outside sensor
//       (config.outside.temperature), else the weather entity's own; null without either
//   forecastSpec(ctx) -> spec   the sheet behind Home's weather row and the Climate strip
//   forecastSheet = {render(ctx, spec), update(el, ctx)}   that sheet's content (kind "forecast")
//
// A day: {datetime, condition, temperature (the high), templow?, precipitation_probability?}.
// Nothing is guessed: a value the forecast does not give is left out.

import { formatDate } from "./i18n.js";
import { el, setText, number, temperature } from "./page-kit.js";
import { numberOf } from "./level.js";

export const NEXT_DAYS = 4;

// The sensor the home names for the outside is what the person sees out of the window; the
// weather entity's value is the provider's estimate for the location, so it comes second.
export function nowTemperature(ctx) {
  const sensor = numberOf(ctx.hass, ctx.config?.outside?.temperature);
  if (sensor != null) return sensor;
  const value = Number(ctx.hass?.states?.[ctx.config?.weather]?.attributes?.temperature);
  return Number.isFinite(value) ? value : null;
}

const ICONS = {
  "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", fog: "mdi:weather-fog",
  hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy", pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant", exceptional: "mdi:alert-circle-outline",
};
const FALLBACK_ICON = "mdi:weather-cloudy";
const GONE = new Set(["unavailable", "unknown"]);

export const iconOf = (condition) => ICONS[condition] ?? FALLBACK_ICON;

// --- the subscription ---------------------------------------------------------------------------

const feeds = new Map();       // entity id -> {conn, listeners, days, unsub, ended, tries, retry}
export const RETRY_S = [10, 30, 60, 300];

function notify(feed) {
  if (feed.ended) return;
  for (const listener of [...feed.listeners]) listener();
}

// A refused subscription: the widgets draw the attribute meanwhile, and it is asked for again.
function refused(feed) {
  feed.unsub = null;
  if (feed.ended) return;
  notify(feed);
  const wait = RETRY_S[Math.min(feed.tries++, RETRY_S.length - 1)];
  feed.retry = setTimeout(() => { feed.retry = null; begin(feed); }, wait * 1000);
}

function begin(feed) {
  // Without subscribeMessage there is nothing to ask again: the attribute it is.
  if (feed.ended || typeof feed.conn?.subscribeMessage !== "function") return;
  let unsub;
  try {
    unsub = feed.conn.subscribeMessage((message) => {
      feed.days = Array.isArray(message?.forecast) ? message.forecast : [];
      feed.tries = 0;
      notify(feed);
    }, { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: feed.entity });
  } catch {
    refused(feed);
    return;
  }
  feed.unsub = unsub;
  Promise.resolve(unsub).catch(() => { if (feed.unsub === unsub) refused(feed); });
}

function end(feed) {
  feed.ended = true;
  clearTimeout(feed.retry);
  feed.retry = null;
  if (feeds.get(feed.entity) === feed) feeds.delete(feed.entity);
  const unsub = feed.unsub;
  feed.unsub = null;
  // A subscription the server refused, or one on a connection that has gone, has nothing to end.
  if (unsub) Promise.resolve(unsub).then((stop) => { if (typeof stop === "function") return stop(); }).catch(() => {});
}

export function watchForecast(hass, entity, listener) {
  if (!entity) return () => {};
  let feed = feeds.get(entity);
  const conn = hass?.connection;
  if (feed && feed.conn !== conn) {
    end(feed);
    feed = null;
  }
  if (!feed) {
    feed = { entity, conn, listeners: new Set(), days: null, unsub: null, ended: false, tries: 0, retry: null };
    feeds.set(entity, feed);
    begin(feed);
  }
  feed.listeners.add(listener);
  const watched = feed;
  return () => {
    watched.listeners.delete(listener);
    if (watched.listeners.size === 0 && !watched.ended) end(watched);
  };
}

export function daysOf(hass, entity) {
  const days = feeds.get(entity)?.days;
  if (Array.isArray(days) && days.length) return days;
  const attribute = hass?.states?.[entity]?.attributes?.forecast;
  return Array.isArray(attribute) ? attribute : [];
}

const dateOf = (day) => {
  const date = new Date(day?.datetime);
  return Number.isNaN(date.getTime()) ? null : date;
};
const ymdFormats = new Map();  // one formatter per time zone ("" the browser's)

// A date as YYYY-MM-DD in a time zone; an unknown zone is the browser's.
function ymd(date, timeZone) {
  const key = timeZone ?? "";
  if (!ymdFormats.has(key)) {
    let format;
    try {
      format = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      // A zone this browser does not know: its own.
      format = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    ymdFormats.set(key, format);
  }
  return ymdFormats.get(key).format(date);
}

const utcMidnight = (date) => date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;

export function dayKey(day, timeZone) {
  const date = dateOf(day);
  if (!date) return null;
  const zone = utcMidnight(date) ? "UTC" : timeZone;
  return { date: ymd(date, zone), zone };
}

export function splitDays(days, now = new Date(), limit = NEXT_DAYS, timeZone) {
  const keyed = (Array.isArray(days) ? days : []).map((day) => ({ day, key: dayKey(day, timeZone) }))
    .filter(({ key }) => key);
  const todayDate = ymd(now, timeZone);
  // A forecast may still start with a day gone by (fetched before midnight): today is the day dated today.
  const today = keyed.find(({ key }) => key.date === todayDate)?.day ?? null;
  const next = keyed.filter(({ day, key }) => day !== today && key.date > todayDate).slice(0, limit).map(({ day }) => day);
  return { today, next };
}

const zones = new Map();       // time zone -> whether this browser knows it
// Home Assistant's time zone when the browser knows it, else none (the browser's own).
function timeZoneOf(hass) {
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

// Tests start without subscriptions.
export function clearForecasts() {
  for (const feed of [...feeds.values()]) end(feed);
}

// --- words --------------------------------------------------------------------------------------

const isNumber = (x) => typeof x === "number" && Number.isFinite(x);
const degrees = (ctx, value) => ctx.t("card.pocket.format.temperature", { value: number(ctx, value, 0) });

function conditionName(ctx, condition) {
  if (!condition) return ctx.t("card.pocket.format.none");
  const key = `card.pocket.weather.condition.${condition}`;
  const name = ctx.t(key);
  return name === key ? condition : name;
}

function highLow(ctx, day) {
  const high = isNumber(day?.temperature) ? degrees(ctx, day.temperature) : null;
  const low = isNumber(day?.templow) ? degrees(ctx, day.templow) : null;
  if (high && low) return ctx.t("card.pocket.weather.high_low", { high, low });
  return high ?? low ?? "";
}

const rainOf = (day) => (isNumber(day?.precipitation_probability) ? day.precipitation_probability : null);

function dayName(ctx, day, today) {
  if (day === today) return ctx.t("card.pocket.weather.today");
  const zone = dayKey(day, timeZoneOf(ctx.hass))?.zone;
  return formatDate({ locale: { language: ctx.lang } }, dateOf(day), zone ? { weekday: "short", timeZone: zone } : { weekday: "short" });
}

// --- the widget ---------------------------------------------------------------------------------

const STYLE = `
  :host { display: block; color: var(--fg); }
  :host([hidden]) { display: none; }
  ha-icon { color: var(--acc); flex: 0 0 auto; }
  .rain { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; color: var(--mut); }
  .rain ha-icon { --mdc-icon-size: 14px; color: var(--mut); }
  .rain[hidden] { display: none; }
  .row { display: flex; flex-wrap: wrap; align-items: center; column-gap: 10px; row-gap: 2px; }
  .row > ha-icon { --mdc-icon-size: 28px; }
  .row .t { font-size: 20px; font-weight: 600; }
  .row .t[hidden] { display: none; }
  .row .cond { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .row .hl { font-size: 15px; }
  .strip { display: grid; grid-template-columns: repeat(var(--days, 5), minmax(0, 1fr)); gap: 4px; text-align: center; }
  .strip .day { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
  .strip .dn { font-size: 12.5px; color: var(--mut); overflow-wrap: anywhere; }
  .strip .day ha-icon { --mdc-icon-size: 26px; margin: 2px 0; }
  .strip .hi { font-size: 15px; font-weight: 600; }
  .strip .lo { font-size: 12.5px; color: var(--mut); }
  .list .day { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 4px 0;
               border-top: 1px solid var(--line); }
  .list .day:first-child { border-top: 0; }
  .list .dn { flex: 0 0 auto; min-width: 48px; font-size: 15px; font-weight: 600; }
  .list .day ha-icon { --mdc-icon-size: 26px; }
  .list .cond { flex: 1; min-width: 0; font-size: 15px; overflow-wrap: anywhere; }
  .list .hl { flex: 0 0 auto; font-size: 15px; font-weight: 600; }
  .empty { margin: 8px 0; font-size: 15px; color: var(--mut); text-align: center; }
`;

const rainHtml = `<span class="rain" role="img"><ha-icon icon="mdi:water-outline"></ha-icon><span></span></span>`;

class PocketForecast extends HTMLElement {
  constructor() {
    super();
    this._onFeed = () => this._draw();
    this._drawn = null;
  }

  set ctx(ctx) {
    this._ctx = ctx;
    this._sync();
    this._draw();
  }

  get ctx() {
    return this._ctx;
  }

  connectedCallback() {
    this._sync();
    this._draw();
  }

  disconnectedCallback() {
    this._stop?.();
    this._stop = null;
  }

  // Watches the entity of the config while connected; a new entity or connection watches anew.
  _sync() {
    const hass = this._ctx?.hass;
    const entity = this._ctx?.config?.weather;
    if (!this.isConnected || !entity || !hass) return;
    if (this._stop && this._entity === entity && this._conn === hass.connection) return;
    this._stop?.();
    this._entity = entity;
    this._conn = hass.connection;
    this._stop = watchForecast(hass, entity, this._onFeed);
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    if (!this._box) {
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${STYLE}</style><div></div>`;
      this._box = this.shadowRoot.lastChild;
    }
    const box = this._box;
    const entity = ctx.config?.weather;
    const state = entity ? ctx.hass?.states?.[entity] : undefined;
    const mode = this.getAttribute("mode") || "row";
    // The sheet lists every day the forecast gives.
    const { today, next } = splitDays(daysOf(ctx.hass, entity), new Date(), mode === "list" ? Infinity : NEXT_DAYS,
      timeZoneOf(ctx.hass));
    const days = [today, ...next].filter(Boolean);
    const current = state && !GONE.has(state.state) ? state.state : today?.condition;
    const now = mode === "row" ? nowTemperature(ctx) : null;
    const key = JSON.stringify([mode, ctx.lang, current, now, days, ctx.t("card.pocket.weather.today")]);
    if (key === this._drawn) return;
    this._drawn = key;
    if (mode === "row") this._row(box, ctx, current, today, now);
    else this._days(box, ctx, mode, days, today);
  }

  _row(box, ctx, current, today, now) {
    box.className = "row";
    box.innerHTML = `<ha-icon></ha-icon><span class="t" hidden></span><span class="cond"></span><span class="hl"></span>${rainHtml}`;
    box.querySelector("ha-icon").setAttribute("icon", iconOf(current));
    const t = box.querySelector(".t");
    t.hidden = now == null;
    if (now != null) setText(t, temperature(ctx, now));
    setText(box.querySelector(".cond"), conditionName(ctx, current));
    setText(box.querySelector(".hl"), highLow(ctx, today));
    fillRain(box.querySelector(".rain"), ctx, rainOf(today));
  }

  _days(box, ctx, mode, days, today) {
    box.className = mode;
    if (!days.length) {
      box.replaceChildren(el("p", "empty"));
      setText(box.firstChild, ctx.t("card.pocket.weather.none"));
      return;
    }
    box.style.setProperty("--days", String(days.length));
    box.replaceChildren(...days.map((day) => {
      const node = el("div", "day", mode === "strip"
        ? `<span class="dn"></span><ha-icon></ha-icon><span class="hi"></span><span class="lo"></span>${rainHtml}`
        : `<span class="dn"></span><ha-icon></ha-icon><span class="cond"></span>${rainHtml}<span class="hl"></span>`);
      setText(node.querySelector(".dn"), dayName(ctx, day, today));
      const icon = node.querySelector("ha-icon");
      icon.setAttribute("icon", iconOf(day.condition));
      icon.setAttribute("aria-label", conditionName(ctx, day.condition));
      if (mode === "strip") {
        setText(node.querySelector(".hi"), isNumber(day.temperature) ? degrees(ctx, day.temperature) : "");
        setText(node.querySelector(".lo"), isNumber(day.templow) ? degrees(ctx, day.templow) : "");
      } else {
        setText(node.querySelector(".cond"), conditionName(ctx, day.condition));
        setText(node.querySelector(".hl"), highLow(ctx, day));
      }
      fillRain(node.querySelector(".rain"), ctx, rainOf(day));
      return node;
    }));
  }
}

function fillRain(node, ctx, value) {
  node.hidden = value == null;
  if (value == null) return;
  setText(node.querySelector("span"), ctx.t("card.pocket.format.percent", { value: number(ctx, value, 0) }));
  node.setAttribute("aria-label", ctx.t("card.pocket.weather.rain", { value: number(ctx, value, 0) }));
}

if (!customElements.get("pocket-forecast")) customElements.define("pocket-forecast", PocketForecast);

// --- the sheet ----------------------------------------------------------------------------------

export function forecastSpec(ctx) {
  return { kind: "forecast", title: ctx.t("card.pocket.weather.title") };
}

const SHEET_STYLE = `
  .forecast-sheet .dtitle { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
                            margin-bottom: 8px; }
  .forecast-sheet .dtitle b { font-size: 17px; font-weight: 600; }
  .forecast-sheet .now { margin-bottom: 12px; }
`;

export const forecastSheet = {
  render(ctx, spec) {
    const root = el("div", "forecast-sheet", `<style>${SHEET_STYLE}</style>
      <div class="dtitle"><b></b></div>
      <pocket-forecast class="now" mode="row"></pocket-forecast>
      <pocket-forecast class="days" mode="list"></pocket-forecast>`);
    root._spec = spec;
    forecastSheet.update(root, ctx);
    return root;
  },
  update(root, ctx) {
    setText(root.querySelector(".dtitle b"), root._spec?.title ?? "");
    for (const widget of root.querySelectorAll("pocket-forecast")) widget.ctx = ctx;
  },
};
