// <pocket-light-tile>: one light (or a room's lights together) as a tile of the Home page's Quick
// grid and the area page. Set its properties, not attributes:
//   tile.t = ctx.t;  tile.config = {name, entities: [light ids]};  tile.offline = ctx.offline;
//   tile.optimistic = ctx.optimistic;   (lib/optimistic.js; the tile keeps its own store without)
//   tile.hass = hass   (each update; the tile patches itself, it never rebuilds)
//
// Touch (spec 6.2, 6.3; the phone check of iteration 2):
//   - the tile's body: a tap switches the light: off when it shows on, else on (for several
//     lights: all off when any is on, else all on); a 600 ms press opens Home Assistant's more-info
//     dialog (the hass-more-info event); any move of the finger (a swipe between areas, a scroll)
//     is not the tile's: nothing changes and the move goes on to the page;
//   - the brightness strip under it (44 px tall, a slider): a horizontal drag sets the brightness
//     from the finger's position along the strip, shown while dragging and sent once on release
//     (light.turn_on with brightness_pct); a tap on it sends the brightness of that point; a
//     vertical move is the page's scroll. Arrow keys step it. The strip carries data-drag: the area
//     swipe leaves a gesture that starts on it alone. A light without a dimmer has no strip.
// What the tile sends goes through the optimistic store: the new state shows at once, stays until
// Home Assistant reports it, and goes back with a toast (pocket-error) when the call fails or no
// report comes in time.
// Unavailable (every light missing, unavailable or unknown): muted, a dash, no service call.
// Offline: the controls are disabled, no service call.

import { createOptimistic } from "./optimistic.js";

const LONG_PRESS_MS = 600;
const DIRECTION_PX = 8;      // movement before a gesture is a drag or a scroll
const CLICK_WINDOW_MS = 300;  // a click after a gesture comes right after the pointerup; later ones are the user's
const KEY_STEP = 10;          // percent per arrow key on the strip
const GONE = new Set(["unavailable", "unknown"]);

const STYLE = `
  :host { display: block; }
  .tile { box-sizing: border-box; width: 100%; height: 100%; min-height: 64px; margin: 0; padding: 0;
          display: flex; flex-direction: column; color: var(--fg);
          background: var(--card); border: 1px solid var(--line); border-radius: 18px;
          touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent; }
  .main { box-sizing: border-box; flex: 1 1 auto; width: 100%; min-height: 44px; margin: 0; padding: 12px 12px 8px;
          display: block; text-align: left; font: inherit; color: inherit; background: none; border: 0;
          border-radius: 18px 18px 0 0; cursor: pointer; touch-action: pan-y; -webkit-tap-highlight-color: transparent; }
  .main:focus-visible, .bar:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .main:disabled { cursor: default; }
  .ic { width: 30px; height: 30px; border-radius: 50%; background: var(--chip); margin-bottom: 8px;
        display: flex; align-items: center; justify-content: center; color: var(--mut); }
  .ic ha-icon { --mdc-icon-size: 18px; }
  .tile.on .ic { background: color-mix(in srgb, var(--lamp) 35%, var(--card)); color: var(--fg); }
  .t1 { display: block; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; }
  /* The brightness strip: a slider a thumb can hold, with a grip line at the level. */
  .bar { position: relative; box-sizing: border-box; display: block; height: 44px; margin: 0 8px 8px;
         border-radius: 12px; background: var(--chip); overflow: hidden; cursor: ew-resize; touch-action: pan-y; }
  .bar i { display: block; height: 100%; background: color-mix(in srgb, var(--lamp) 70%, var(--chip)); }
  .bar i::after { content: ""; position: absolute; top: 12px; bottom: 12px; width: 3px; margin-left: -8px;
                  border-radius: 2px; background: var(--fg); opacity: .35; }
  .bar[hidden] { display: none; }
  .tile.muted { opacity: .55; }
  .tile.muted .bar { cursor: default; }
`;

class PocketLightTile extends HTMLElement {
  constructor() {
    super();
    this.t = (key) => key;
    this.offline = false;
    this.optimistic = null;
    this._suppressClick = false;
    this._gesture = null;
    this.addEventListener("click", (e) => this._onClick(e));
    this.addEventListener("pointerdown", (e) => this._onDown(e));
    this.addEventListener("pointermove", (e) => this._onMove(e));
    this.addEventListener("pointerup", (e) => this._onUp(e));
    this.addEventListener("pointercancel", () => {
      this._endGesture();
      clearTimeout(this._suppressTimer);
      this._suppressClick = false;
    });
    this.addEventListener("keydown", (e) => this._onKey(e));
  }

  // How long a sent state waits for Home Assistant's report (the tile's own store).
  set confirmMs(ms) {
    this._store().timeoutMs = ms;
  }

  get confirmMs() {
    return this._store().timeoutMs;
  }

  set config(config) {
    this._config = { name: config?.name ?? "", entities: [...(config?.entities ?? [])] };
    this._patch();
  }

  get config() {
    return this._config;
  }

  set hass(hass) {
    this._hass = hass;
    this._store().update(hass);
    this._patch();
  }

  get hass() {
    return this._hass;
  }

  disconnectedCallback() {
    this._endGesture();
  }

  // The page's store (ctx.optimistic) when it passes one, else the tile's own, which redraws it.
  _store() {
    if (this.optimistic) return this.optimistic;
    if (!this._own) {
      this._own = createOptimistic();
      this._own.onChange = () => this._patch();
    }
    return this._own;
  }

  _states() {
    const hass = this._store().view(this._hass);
    return (this._config?.entities ?? []).map((id) => hass?.states?.[id]).filter(Boolean);
  }

  // A tile acts while one of its lights can (unknown still takes a command; see page-kit operable).
  _available() {
    return this._states().some((s) => s.state !== "unavailable");
  }

  _on() {
    return this._states().some((s) => s.state === "on");
  }

  // A light that only switches (supported_color_modes is onoff alone) has no brightness strip.
  _dimmable() {
    return this._states().some((s) => {
      const modes = s.attributes?.supported_color_modes;
      return !Array.isArray(modes) || modes.some((mode) => mode !== "onoff");
    });
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

  // One call through the optimistic store: each available light of the tile expects `want`.
  _send(service, data, want) {
    if (!this._canAct()) return;
    const expect = {};
    for (const state of this._config.entities.map((id) => [id, this._hass?.states?.[id]])) {
      if (state[1] && !GONE.has(state[1].state)) expect[state[0]] = want;
    }
    this._store().send(this, this._hass, { domain: "light", service,
      data: { entity_id: this._target(), ...data }, errorKey: "card.pocket.error.light", expect });
  }

  _sendBrightness(pct) {
    this._send("turn_on", { brightness_pct: pct },
      { state: "on", attributes: { brightness: Math.round(pct * 255 / 100) } });
  }

  _build() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>${STYLE}</style>
      <div class="tile">
        <button class="main" type="button">
          <span class="ic"><ha-icon icon="mdi:lightbulb"></ha-icon></span>
          <span class="t1"></span><span class="t2"></span>
        </button>
        <span class="bar" role="slider" tabindex="0" data-drag aria-valuemin="1" aria-valuemax="100"><i></i></span>
      </div>`;
    this._tile = this._root.querySelector(".tile");
    this._button = this._root.querySelector(".main");
    this._name = this._root.querySelector(".t1");
    this._status = this._root.querySelector(".t2");
    this._strip = this._root.querySelector(".bar");
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
    const locked = !!this.offline || !available;
    setText(this._name, this._config.name);
    setText(this._status, status);
    this._tile.classList.toggle("on", on || this._preview != null);
    this._tile.classList.toggle("muted", !available);
    this._button.disabled = !!this.offline;
    setAttr(this._button, "aria-pressed", String(on));
    setAttr(this._button, "aria-label", `${this._config.name}, ${status}`);
    this._strip.hidden = !this._dimmable();
    setAttr(this._strip, "aria-label", this.t("card.pocket.light.brightness", { name: this._config.name }));
    setAttr(this._strip, "aria-valuenow", String(pct ?? 0));
    setAttr(this._strip, "aria-valuetext", status);
    setAttr(this._strip, "aria-disabled", String(locked));
    setAttr(this._strip, "tabindex", locked ? "-1" : "0");
    const width = `${pct ?? 0}%`;
    if (this._fill.style.width !== width) this._fill.style.width = width;
  }

  _onStrip(e) {
    return !!this._strip && !!e.composedPath?.().includes(this._strip);
  }

  _onClick(e) {
    if (this._suppressClick) {
      this._suppressClick = false;
      e.stopPropagation();
      return;
    }
    if (this._onStrip(e) || !this._canAct()) return;     // the strip acts on its pointerup
    const on = this._on();
    this._send(on ? "turn_off" : "turn_on", {}, { state: on ? "off" : "on" });
  }

  _onDown(e) {
    if (e.button != null && e.button !== 0) return;
    this._endGesture();
    clearTimeout(this._suppressTimer);
    this._suppressClick = false;
    const strip = this._onStrip(e);
    this._gesture = { x: e.clientX, y: e.clientY, mode: "pending", strip, pointerId: e.pointerId };
    if (!strip) this._gesture.timer = setTimeout(() => this._longPress(), LONG_PRESS_MS);
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
      // On the body any move is the page's (a scroll, a swipe between areas); on the strip a
      // vertical one is.
      if (!g.strip || Math.abs(dx) <= Math.abs(dy) || !this._canAct()) {
        g.mode = "cancel";
        return;
      }
      g.mode = "drag";
      try { this._strip.setPointerCapture?.(g.pointerId); } catch { /* the pointer may already be gone */ }
    }
    this._preview = this._percentAt(e.clientX);
    this._patch();
  }

  _onUp(e) {
    const g = this._gesture;
    // A drag along the strip, or a tap on it: the brightness of where the finger lifts.
    if (g?.strip && g.mode !== "cancel" && this._canAct()) {
      this._suppressClick = true;
      this._preview = null;
      this._sendBrightness(this._percentAt(e.clientX));
    }
    this._endGesture();
    // Only the click the browser fires right after this gesture is swallowed: if none follows
    // (the pointer left the tile, a keyboard Enter comes later), the next click must work.
    clearTimeout(this._suppressTimer);
    if (this._suppressClick) {
      this._suppressTimer = setTimeout(() => { this._suppressClick = false; }, CLICK_WINDOW_MS);
    }
  }

  _onKey(e) {
    if (!this._onStrip(e) || !this._canAct()) return;
    const step = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[e.key];
    if (!step) return;
    e.preventDefault();
    this._sendBrightness(Math.min(100, Math.max(1, (this._brightness() ?? 0) + step)));
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

  _endGesture() {
    if (this._gesture) clearTimeout(this._gesture.timer);
    this._gesture = null;
    if (this._preview != null) {
      this._preview = null;
      this._patch();
    }
  }

  _percentAt(x) {
    const rect = this._strip.getBoundingClientRect();
    if (!rect.width) return this._brightness() ?? 100;
    return Math.min(100, Math.max(1, Math.round((x - rect.left) / rect.width * 100)));
  }
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

if (!customElements.get("pocket-light-tile")) customElements.define("pocket-light-tile", PocketLightTile);
