// The weather of the configured `weather` entity: today and the next days, as Home (a compact
// row), the Climate page (a strip) and the forecast sheet (every day) show it.
//
//   watchForecast(hass, entity, listener) -> stop()
//       the daily forecast the way Home Assistant's own weather card gets it: the websocket
//       subscription weather/subscribe_forecast (forecast_type daily). One subscription per entity
//       however many widgets watch it; the last stop() ends it (a new connection starts a new
//       one). listener() runs whenever new days arrive or the subscription fails.
//   daysOf(hass, entity) -> [day]   the subscription's days; until it has some, or when it failed
//       (an old Home Assistant, a refused call, a hass without subscribeMessage), the entity's
//       `forecast` attribute (older integrations still carry it); [] without either
//   splitDays(days, now?, limit?) -> {today, next}   today: the first day when its date is today,
//       else null; next: the following days, at most limit (NEXT_DAYS)
//   iconOf(condition) -> an mdi icon name, as the Ramka's clock-weather-card maps Home
//       Assistant's weather conditions
//   <pocket-forecast mode="row|strip|list">   the widget: el.ctx = ctx (page contract) draws it;
//       it watches the forecast while it is connected and stops when it leaves the page or the
//       sheet. row: the current condition with today's high / low and its chance of rain; strip:
//       today and the next days in columns; list: one line per day the forecast has.
//   forecastSpec(ctx) -> spec   the sheet behind Home's weather row and the Climate strip
//   forecastSheet = {render(ctx, spec), update(el, ctx)}   that sheet's content (kind "forecast")
//
// A day: {datetime, condition, temperature (the high), templow?, precipitation_probability?}.
// Nothing is guessed: a value the forecast does not give is left out.

import { formatDate } from "./i18n.js";
import { el, setText, number } from "./page-kit.js";

export const NEXT_DAYS = 4;

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

const feeds = new Map();       // entity id -> {conn, listeners, days, failed, unsub, ended}

function notify(feed) {
  if (feed.ended) return;
  for (const listener of [...feed.listeners]) listener();
}

function begin(feed) {
  if (typeof feed.conn?.subscribeMessage !== "function") {
    feed.failed = true;
    return;
  }
  try {
    feed.unsub = feed.conn.subscribeMessage((message) => {
      feed.days = Array.isArray(message?.forecast) ? message.forecast : [];
      notify(feed);
    }, { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: feed.entity });
  } catch {
    feed.failed = true;
    return;
  }
  Promise.resolve(feed.unsub).catch(() => {
    feed.failed = true;
    feed.unsub = null;
    notify(feed);
  });
}

function end(feed) {
  feed.ended = true;
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
    feed = { entity, conn, listeners: new Set(), days: null, failed: false, unsub: null, ended: false };
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
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function splitDays(days, now = new Date(), limit = NEXT_DAYS) {
  const dated = (Array.isArray(days) ? days : []).filter((day) => dateOf(day));
  const today = dated.length && sameDay(dateOf(dated[0]), now) ? dated[0] : null;
  const next = dated.filter((day) => day !== today && dateOf(day) > now).slice(0, limit);
  return { today, next };
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
  return formatDate({ locale: { language: ctx.lang } }, dateOf(day), { weekday: "short" });
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
    const { today, next } = splitDays(daysOf(ctx.hass, entity), new Date(), mode === "list" ? Infinity : NEXT_DAYS);
    const days = [today, ...next].filter(Boolean);
    const current = state && !GONE.has(state.state) ? state.state : today?.condition;
    const key = JSON.stringify([mode, ctx.lang, current, days, ctx.t("card.pocket.weather.today")]);
    if (key === this._drawn) return;
    this._drawn = key;
    if (mode === "row") this._row(box, ctx, current, today);
    else this._days(box, ctx, mode, days, today);
  }

  _row(box, ctx, current, today) {
    box.className = "row";
    box.innerHTML = `<ha-icon></ha-icon><span class="cond"></span><span class="hl"></span>${rainHtml}`;
    box.querySelector("ha-icon").setAttribute("icon", iconOf(current));
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
