// Wraps a chart card and restyles single lines of it: for example, one series of a 7-day
// temperature chart drawn dashed and thicker than the rest. HA's statistics-graph card has no
// per-series style, so this merges an ECharts lineStyle into the series HA builds, on their way
// into the chart: statistics-chart hands ha-chart-base its series as `.data`, with ids
// "<entity>-<stat type>" and lineStyle {width: 1.5} (HA 2026.9.2). That is frontend internals: if
// an update renames them, the lines fall back to HA's own style and the chart still works.
//
//   type: custom:line-style-card
//   line_styles:                                  # entity → ECharts lineStyle, over HA's
//     sensor.outside_temperature: {width: 3, type: [8, 5]}
//   grid_options: {columns: 18, rows: 4}          # also passed on to the inner card, which
//                                                 # fills its rows only when it has them
//   rooms:                                        # optional: the inner card's entities from
//     entity: sensor.ramka_climate_rooms          # this entity's `rooms` ({label, main, extra}),
//     slots: input_number.ramka_climate_slots     # its first `slots` places (a number or an
//     key: main                                   # entity; spacers, {spacer: true}, skipped),
//     after: [{entity: sensor.outside, name: Outside}]  # their `key` reading, then `after`; the
//                                                 # card's own entities while it holds none
//
// With rooms, each line has the colour of its widget, series colour n for the n-th widget with a
// reading (as the room tiles; lib/climate-widgets.js, the threshold colours left out), whether or
// not the widgets before it have a `key` reading; `after` follows the last one's colour.
//   card:
//     type: statistics-graph
//     entities: [...]

// The shared widget module carries this module's own ?v= (the deploy's hash of its version directory): /local/
// is served with a 31-day cache, so an import without it can stay the old file after a deploy.
const { seriesSlot, slotColor, readWidget, hasReading } =
  await import(new URL("./lib/climate-widgets.js", import.meta.url).href + new URL(import.meta.url).search);

class LineStyleCard extends HTMLElement {
  setConfig(config) {
    if (!config.card) throw new Error("line-style-card: card is required");
    this._config = config;
    this._make();
  }

  getCardSize() {
    return (this._inner && this._inner.getCardSize && this._inner.getCardSize()) || 4;
  }

  getGridOptions() {
    return (this._inner && this._inner.getGridOptions && this._inner.getGridOptions()) || { columns: 12, rows: 4 };
  }

  set hass(hass) {
    this._hass = hass;
    const entities = this._roomEntities();
    const key = JSON.stringify([entities, this._colors]);
    if (key !== this._roomsKey) {
      const first = this._roomsKey === undefined;
      this._roomsKey = key;
      // The first time only when the rooms replace the card's own entities: setConfig built that.
      if (!first || entities) this._make();
    }
    if (this._inner) this._inner.hass = hass;
    this._hook();
  }

  // The widgets' readings, then `after`, as statistics-graph entities; null without a widget with a
  // reading. Air quality widgets stay off the charts: CO2 or PM2.5 on the temperature and humidity
  // axes would only squash the lines (a Custom widget is the user's choice, so it stays). A widget keeps its series colour by its place among all widgets,
  // as on its tile. Sets this._colors: entity → the theme slot of its widget's series colour.
  _roomEntities() {
    this._colors = null;
    const rooms = this._config.rooms;
    const list = rooms && this._hass && this._hass.states[rooms.entity]?.attributes?.rooms;
    if (!Array.isArray(list)) return null;
    const real = list.slice(0, this._slots(rooms.slots, list.length)).map((r) => readWidget(r, this._hass.states))
      .filter(hasReading);
    if (!real.some((r) => r.type !== "air")) return null;
    const colors = {};
    const live = [];
    real.forEach((r, i) => {
      if (r.type === "air" || !r[rooms.key]) return;
      live.push({ entity: r[rooms.key], name: String(r.label || "") });
      if (!(r[rooms.key] in colors)) colors[r[rooms.key]] = seriesSlot(i + 1);
    });
    (rooms.after || []).forEach((a, i) => {
      if (a && a.entity && !(a.entity in colors)) colors[a.entity] = seriesSlot(real.length + 1 + i);
    });
    this._colors = colors;
    return [...live, ...(rooms.after || [])];
  }

  // How many places count: `slots` as a number or an entity's state, 1 to 20; all without one.
  _slots(slots, all) {
    const n = typeof slots === "number" ? slots : parseInt(slots && this._hass.states[slots]?.state, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 20) : all;
  }

  // hui-card sets these on the card it shows; the inner card needs them to lay out the same way.
  set layout(v) {
    this._layout = v;
    if (this._inner) this._inner.layout = v;
  }

  set preview(v) {
    this._preview = v;
    if (this._inner) this._inner.preview = v;
  }

  async _make() {
    const token = (this._token = {});
    const helpers = await (window.__lineStyleHelpers ||= window.loadCardHelpers());
    if (token !== this._token) return;
    const config = { ...this._config.card };
    const entities = this._hass ? this._roomEntities() : null;
    if (entities) config.entities = entities;
    if (this._config.grid_options && !config.grid_options) config.grid_options = this._config.grid_options;
    const el = helpers.createCardElement(config);
    // A card type not loaded yet comes back as a placeholder that asks to be made again.
    el.addEventListener("ll-rebuild", (ev) => { ev.stopPropagation(); this._make(); }, { once: true });
    if (this._layout !== undefined) el.layout = this._layout;
    if (this._preview !== undefined) el.preview = this._preview;
    if (this._hass) el.hass = this._hass;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).innerHTML =
        "<style>:host { display: block; height: 100%; } :host > * { height: 100%; }</style>";
    }
    if (this._inner) this._inner.remove();
    this._inner = el;
    this._chart = null;
    this.shadowRoot.appendChild(el);
    // The chart appears once the statistics have loaded; hass updates look again, these cover a
    // quiet house.
    for (const ms of [200, 1000, 3000, 10000]) setTimeout(() => this._hook(), ms);
  }

  _hook() {
    if (!this._inner || (this._chart && this._chart.isConnected)) return;
    const chart = this._find(this._inner, "ha-chart-base");
    if (!chart) return;
    this._chart = chart;
    let proto = chart, desc;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, "data"))) proto = Object.getPrototypeOf(proto);
    if (!desc || !desc.set || proto === chart) return;
    const restyle = (data) => (Array.isArray(data) ? data.map((s) => this._restyle(s)) : data);
    Object.defineProperty(chart, "data", {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, restyle(v)); },
    });
    chart.data = chart.data;
  }

  _restyle(series) {
    const styles = this._config.line_styles || {};
    const id = series && series.id;
    const of = (table) => typeof id === "string" && Object.keys(table).find((e) => id === e || id.startsWith(`${e}-`));
    const entity = of(styles);
    let out = entity ? { ...series, lineStyle: { ...series.lineStyle, ...styles[entity] } } : series;
    const colored = this._colors && of(this._colors);
    if (colored) {
      const color = slotColor(this, this._colors[colored]);
      out = { ...out, color, itemStyle: { ...out.itemStyle, color }, lineStyle: { ...out.lineStyle, color } };
    }
    return out;
  }

  _find(root, tag) {
    const scope = root.shadowRoot || root;
    for (const el of scope.querySelectorAll("*")) {
      if (el.localName === tag) return el;
      if (el.shadowRoot) {
        const hit = this._find(el, tag);
        if (hit) return hit;
      }
    }
    return null;
  }
}

customElements.define("line-style-card", LineStyleCard);
