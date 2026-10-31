// One Ramka screen in a box of the tablet's size, for the preview dashboard: its sections laid out
// as Home Assistant's sections view lays them out on the tablet (three view columns, a section
// spanning `column_span` of them; a section of three columns is a 36-column grid, rows 56 px, gaps
// and the view's padding 8 px), scaled down as a whole when the browser is narrower than the screen,
// and a link under it. The box carries a transform, so a card that draws a fixed layer
// (photo-frame-card) is held inside the box rather than over the page.
// A card's own `visibility` is applied as the sections view applies it, for the conditions the
// Ramka's cards use (state with state / state_not, numeric_state, and, or, not); any other
// condition counts as met. A card with its own `height` keeps it: grid rows only size the cards
// without one (the calendar's agenda-card is one row in grid_options and as tall as the screen).
//
//   type: custom:screen-frame-card
//   width: 1100                     # the screen in CSS px (the Ramka's inputs.screen)
//   height: 720
//   background: "#000000"           # optional
//   link: {label: Settings for this screen, path: /ramka-settings/climate}   # optional
//   sections:                       # the Ramka dashboard's sections of this screen
//     - type: grid
//       column_span: 3
//       cards: [...]

const ROW = 56;
const GAP = 8;
const COLUMNS = 3;

const list = (value) => (Array.isArray(value) ? value : [value]).map(String);

// Home Assistant's card visibility conditions, as far as the Ramka's cards use them.
export function conditionMet(condition, hass) {
  const kind = condition.condition || "state";
  if (kind === "and") return (condition.conditions || []).every((c) => conditionMet(c, hass));
  if (kind === "or") return (condition.conditions || []).some((c) => conditionMet(c, hass));
  if (kind === "not") return !(condition.conditions || []).some((c) => conditionMet(c, hass));
  const entity = hass && hass.states && hass.states[condition.entity];
  // A missing entity reads as unavailable, as in Home Assistant.
  const state = entity ? String(entity.state) : "unavailable";
  if (kind === "state") {
    if (condition.state !== undefined && !list(condition.state).includes(state)) return false;
    if (condition.state_not !== undefined && list(condition.state_not).includes(state)) return false;
    return true;
  }
  if (kind === "numeric_state") {
    const value = Number(state);
    if (Number.isNaN(value)) return false;
    if (condition.above !== undefined && !(value > Number(condition.above))) return false;
    if (condition.below !== undefined && !(value < Number(condition.below))) return false;
    return true;
  }
  return true;
}

class ScreenFrameCard extends HTMLElement {
  setConfig(config) {
    for (const key of ["width", "height"]) {
      if (!(Number(config[key]) > 0)) throw new Error(`screen-frame-card: ${key} must be a positive number`);
    }
    if (!Array.isArray(config.sections)) throw new Error("screen-frame-card: sections is required");
    this._config = config;
    this._render();
    this._make();
  }

  getCardSize() {
    return Math.ceil(Number(this._config.height) / (ROW + GAP)) + 1;
  }

  set hass(hass) {
    this._hass = hass;
    for (const card of this._cards || []) card.hass = hass;
    this._show();
  }

  // Each card shown while its own visibility holds; a hidden card takes no place in the grid.
  _show() {
    for (const card of this._cards || []) {
      const conditions = card._frameVisibility;
      if (!conditions) continue;
      card.style.display = conditions.every((c) => conditionMet(c, this._hass)) ? "" : "none";
    }
  }

  connectedCallback() {
    if (!this._observer && typeof ResizeObserver !== "undefined") {
      this._observer = new ResizeObserver(() => this._fit());
      this._observer.observe(this);
    }
    this._fit();
  }

  disconnectedCallback() {
    if (this._observer) this._observer.disconnect();
    this._observer = null;
  }

  _render() {
    const { width, height, background, link } = this._config;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
        :host { display: block; }
        .outer { position: relative; overflow: hidden; margin: 0 auto; }
        .screen { position: absolute; top: 0; left: 0; transform-origin: 0 0; overflow: hidden;
          box-sizing: border-box; padding: ${GAP}px; display: grid; gap: ${GAP}px;
          grid-template-columns: repeat(${COLUMNS}, minmax(0, 1fr)); align-content: start; align-items: start;
          outline: 1px solid var(--divider-color, #444); }
        .section { display: grid; gap: ${GAP}px; grid-auto-rows: minmax(${ROW}px, auto); }
        .section > * { min-width: 0; }
        .link { display: block; margin: 12px auto; text-align: center; color: var(--primary-color);
          font-size: 16px; cursor: pointer; text-decoration: underline; }
      </style>
      <div class="outer"><div class="screen"></div></div>`;
    const screen = this.shadowRoot.querySelector(".screen");
    Object.assign(screen.style, { width: `${width}px`, height: `${height}px`, background: background || "transparent" });
    if (link && link.path) {
      const a = document.createElement("a");
      a.className = "link";
      a.href = link.path;
      a.textContent = link.label || link.path;
      // Home Assistant's own navigation: no page load, the frontend follows the new path.
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        window.history.pushState(null, "", link.path);
        window.dispatchEvent(new window.CustomEvent("location-changed", { detail: { replace: false } }));
      });
      this.shadowRoot.appendChild(a);
    }
    this._fit();
  }

  // The scale that fits the screen into the card's width, never above 1.
  _scale() {
    const available = this.clientWidth;
    const width = Number(this._config.width);
    return available > 0 ? Math.min(1, available / width) : 1;
  }

  _fit() {
    const outer = this.shadowRoot && this.shadowRoot.querySelector(".outer");
    if (!outer) return;
    const scale = this._scale();
    const screen = outer.firstElementChild;
    screen.style.transform = `scale(${scale})`;
    outer.style.width = `${Number(this._config.width) * scale}px`;
    outer.style.height = `${Number(this._config.height) * scale}px`;
  }

  async _make() {
    const token = (this._token = {});
    const helpers = await window.loadCardHelpers();
    if (token !== this._token) return;
    const screen = this.shadowRoot.querySelector(".screen");
    screen.replaceChildren();
    this._cards = [];
    for (const section of this._config.sections) {
      const span = Math.min(COLUMNS, Number(section.column_span) || 1);
      const columns = 12 * span;
      const grid = document.createElement("div");
      grid.className = "section";
      grid.style.gridColumn = `span ${span}`;
      grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      for (const config of section.cards || []) {
        const card = helpers.createCardElement(config);
        // A card type not loaded yet comes back as a placeholder that asks to be made again.
        card.addEventListener("ll-rebuild", (ev) => { ev.stopPropagation(); this._make(); }, { once: true });
        card.layout = "grid";
        const options = config.grid_options || (card.getGridOptions && card.getGridOptions()) || {};
        const width = options.columns === "full" || options.columns === undefined ? columns : Math.min(columns, Number(options.columns));
        card.style.gridColumn = `span ${width}`;
        if (Number(options.rows) > 0) {
          card.style.gridRow = `span ${Number(options.rows)}`;
          // The rows' height only for a card without its own: an inline height would override the
          // one the card sets on itself (the calendar showed a 56 px strip).
          if (config.height === undefined) card.style.height = `${options.rows * ROW + (options.rows - 1) * GAP}px`;
        }
        if (Array.isArray(config.visibility) && config.visibility.length) card._frameVisibility = config.visibility;
        if (this._hass) card.hass = this._hass;
        this._cards.push(card);
        grid.appendChild(card);
      }
      screen.appendChild(grid);
    }
    this._show();
  }
}

customElements.define("screen-frame-card", ScreenFrameCard);
