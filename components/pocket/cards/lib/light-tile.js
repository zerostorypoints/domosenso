// <pocket-light-tile>: one light (or a room's lights together) as a tile of the Home page's Quick
// grid and the room page. Set its properties, not attributes:
//   tile.t = ctx.t;  tile.config = {name, entities: [light ids]};  tile.offline = ctx.offline;
//   tile.hass = hass   (each update; the tile patches itself, it never rebuilds)
//
// Touch (spec 6.2, 6.3):
//   - a tap toggles: light.toggle for one light; for several, all off when any is on, else all on
//     (light.toggle on a mixed group would flip each light and keep the group mixed);
//   - a horizontal drag sets the brightness from the finger's position across the tile, shown while
//     dragging and sent once on release (light.turn_on with brightness_pct);
//   - a vertical move cancels: the page scrolls (touch-action: pan-y) and no light changes;
//   - a 600 ms press opens Home Assistant's more-info dialog (the hass-more-info event).
// Unavailable (every light missing, unavailable or unknown): muted, a dash, no service call.
// Offline: the button is disabled, no service call.

const LONG_PRESS_MS = 600;
const DIRECTION_PX = 8;      // movement before a gesture is a drag or a scroll
const GONE = new Set(["unavailable", "unknown"]);

const STYLE = `
  :host { display: block; }
  .tile { box-sizing: border-box; width: 100%; height: 100%; min-height: 64px; margin: 0; padding: 12px;
          display: block; text-align: left; font: inherit; color: var(--fg);
          background: var(--card); border: 1px solid var(--line); border-radius: 18px;
          cursor: pointer; touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent; }
  .tile:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .tile:disabled { cursor: default; }
  .ic { width: 30px; height: 30px; border-radius: 50%; background: var(--chip); margin-bottom: 8px;
        display: flex; align-items: center; justify-content: center; color: var(--mut); }
  .ic ha-icon { --mdc-icon-size: 18px; }
  .tile.on .ic { background: color-mix(in srgb, var(--lamp) 35%, var(--card)); color: var(--fg); }
  .t1 { display: block; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; }
  .bar { display: block; height: 8px; border-radius: 4px; background: var(--chip); margin-top: 9px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--lamp); border-radius: 4px; }
  .tile.muted { opacity: .55; }
`;

class PocketLightTile extends HTMLElement {
  constructor() {
    super();
    this.t = (key) => key;
    this.offline = false;
    this._suppressClick = false;
    this._gesture = null;
    this.addEventListener("click", (e) => this._onClick(e));
    this.addEventListener("pointerdown", (e) => this._onDown(e));
    this.addEventListener("pointermove", (e) => this._onMove(e));
    this.addEventListener("pointerup", (e) => this._onUp(e));
    this.addEventListener("pointercancel", () => this._endGesture());
  }

  set config(config) {
    this._config = { name: config?.name ?? "", entities: [...(config?.entities ?? [])] };
    this._patch();
  }

  get config() {
    return this._config;
  }

  set hass(hass) {
    // A preview (the brightness being dragged, then sent) holds until one of the lights changes.
    const changed = this._config?.entities.some((id) => hass?.states?.[id] !== this._hass?.states?.[id]);
    if (changed && !this._gesture) this._preview = null;
    this._hass = hass;
    this._patch();
  }

  get hass() {
    return this._hass;
  }

  disconnectedCallback() {
    this._endGesture();
  }

  _states() {
    return (this._config?.entities ?? []).map((id) => this._hass?.states?.[id]).filter(Boolean);
  }

  _available() {
    return this._states().some((s) => !GONE.has(s.state));
  }

  _on() {
    return this._states().some((s) => s.state === "on");
  }

  // The mean brightness of the lights that are on, in percent; null when none is on.
  _brightness() {
    const on = this._states().filter((s) => s.state === "on");
    if (on.length === 0) return null;
    const values = on.map((s) => Number(s.attributes?.brightness)).filter(Number.isFinite);
    if (values.length === 0) return 100;     // an on/off light without a dimmer
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length / 255 * 100);
  }

  _canAct() {
    return !this.offline && this._available() && !!this._hass?.callService;
  }

  _target() {
    const ids = this._config.entities;
    return ids.length === 1 ? ids[0] : ids;
  }

  _call(service, data = {}) {
    if (!this._canAct()) return;
    const result = this._hass.callService("light", service, { entity_id: this._target(), ...data });
    // A failed call leaves the tile on Home Assistant's last state (the next hass update).
    if (result && typeof result.catch === "function") result.catch(() => {});
  }

  _build() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>${STYLE}</style>
      <button class="tile" type="button">
        <span class="ic"><ha-icon icon="mdi:lightbulb"></ha-icon></span>
        <span class="t1"></span><span class="t2"></span>
        <span class="bar"><i></i></span>
      </button>`;
    this._button = this._root.querySelector(".tile");
    this._name = this._root.querySelector(".t1");
    this._status = this._root.querySelector(".t2");
    this._fill = this._root.querySelector(".bar i");
  }

  _patch() {
    if (!this._config) return;
    if (!this._root) this._build();
    const available = this._available();
    const on = available && this._on();
    const pct = this._preview ?? (on ? this._brightness() : null);
    let status = this.t("card.pocket.format.none");
    if (available) status = pct != null ? this.t("card.pocket.format.percent", { value: pct }) : this.t("card.pocket.light.off");
    setText(this._name, this._config.name);
    setText(this._status, status);
    this._button.classList.toggle("on", on || this._preview != null);
    this._button.classList.toggle("muted", !available);
    this._button.disabled = !!this.offline;
    this._button.setAttribute("aria-pressed", String(on));
    this._button.setAttribute("aria-label", `${this._config.name}, ${status}`);
    const width = `${pct ?? 0}%`;
    if (this._fill.style.width !== width) this._fill.style.width = width;
  }

  _onClick(e) {
    if (this._suppressClick) {
      this._suppressClick = false;
      e.stopPropagation();
      return;
    }
    if (!this._canAct()) return;
    if (this._config.entities.length === 1) this._call("toggle");
    else this._call(this._on() ? "turn_off" : "turn_on");
  }

  _onDown(e) {
    if (e.button != null && e.button !== 0) return;
    this._endGesture();
    this._suppressClick = false;
    this._gesture = { x: e.clientX, y: e.clientY, mode: "pending", pointerId: e.pointerId };
    this._gesture.timer = setTimeout(() => this._longPress(), LONG_PRESS_MS);
  }

  _onMove(e) {
    const g = this._gesture;
    if (!g || g.mode === "cancel") return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === "pending") {
      if (Math.abs(dx) < DIRECTION_PX && Math.abs(dy) < DIRECTION_PX) return;
      clearTimeout(g.timer);
      this._suppressClick = true;
      if (Math.abs(dx) <= Math.abs(dy) || !this._canAct()) {
        g.mode = "cancel";     // a scroll: the light stays as it is
        return;
      }
      g.mode = "drag";
      try { this.setPointerCapture?.(g.pointerId); } catch { /* the pointer may already be gone */ }
    }
    this._preview = this._percentAt(e.clientX);
    this._patch();
  }

  _onUp(e) {
    const g = this._gesture;
    if (g?.mode === "drag") {
      this._preview = this._percentAt(e.clientX);
      this._call("turn_on", { brightness_pct: this._preview });
      this._patch();
    }
    this._endGesture({ keepPreview: g?.mode === "drag" });
  }

  _longPress() {
    const g = this._gesture;
    if (!g || g.mode !== "pending") return;
    g.mode = "cancel";
    this._suppressClick = true;
    // As Home Assistant's own fireEvent: an Event with a detail property.
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    event.detail = { entityId: this._config.entities[0] };
    this.dispatchEvent(event);
  }

  _endGesture({ keepPreview = false } = {}) {
    if (this._gesture) clearTimeout(this._gesture.timer);
    this._gesture = null;
    if (!keepPreview && this._preview != null) {
      this._preview = null;
      this._patch();
    }
  }

  _percentAt(x) {
    const rect = this.getBoundingClientRect();
    if (!rect.width) return this._brightness() ?? 100;
    return Math.min(100, Math.max(1, Math.round((x - rect.left) / rect.width * 100)));
  }
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

if (!customElements.get("pocket-light-tile")) customElements.define("pocket-light-tile", PocketLightTile);
