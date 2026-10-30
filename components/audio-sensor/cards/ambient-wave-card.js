// ambient-wave-card: sound (a band spectrum) or any single value drawn as calm waves,
// which swell and warm with the level. The shell: config, hass, lifecycle, ha-card, editor schema
// and registration. Smoothing lives in lib/engine.js, drawing in lib/flavours/<id>.js.
//
// type: custom:ambient-wave-card
// source: { kind: spectrum | scalar, entity | demo: true, ... }   # also attribute, offset, show, history, scenario
// flavour: swell
// active: binary_sensor.<something>   # optional: off draws `still`, then the loop sleeps
// fallback: classic                   # optional: no data draws the classic wave with an info icon

import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };
import { createT, language } from "./lib/i18n.js";
import { normaliseConfig, entitiesOf, resolveOptions, orderColour, SCENARIOS, NAMED_PALETTES, FALLBACKS } from "./lib/config.js";
import { parseColour, makePalette } from "./lib/palette.js";
import { readSource, Demo, THIRD_OCTAVE, nearestBand } from "./lib/sources.js";
import { Engine } from "./lib/engine.js";
import { FLAVOURS, FLAVOUR_KINDS } from "./lib/flavours/index.js";
import { mountConsole } from "./lib/console.js";
import { drawClassic } from "./lib/classic.js";

const t = createT({ en, de, pl });

const FALLBACK_RGB = [3, 169, 244]; // #03a9f4, Home Assistant's default primary colour
const FALLBACK_ICON = "mdi:information-outline";
const DEMO_BANDS_MS = 200; // the device publishes the spectrum every 200 ms
const DEMO_LEVEL_MS = 1000; // and the level every second
const SETTLE_S = 2; // active off: draw still this long, then stop the loop
const ARIA_MS = 1000;
const MAX_DT = 0.25; // after a pause the waves resume rather than jump
const DEFAULT_WINDOWS = [30, 5, 1];

// The page's Home Assistant object: getConfigForm is static and HA passes it no hass.
const pageHass = () => document.querySelector("home-assistant")?.hass;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// Deep merge of plain objects; `patch` wins. Returns `base` untouched.
const mergeDeep = (base, patch) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObject(v) && isObject(out[k]) ? mergeDeep(out[k], v) : v;
  return out;
};

class AmbientWaveCard extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card { height: 100%; min-height: 56px; display: flex; flex-direction: column; overflow: hidden;
          background: var(--ha-card-background, var(--card-background-color)); }
        .stage { position: relative; flex: 1 1 auto; min-height: 0; }
        .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .message { position: absolute; inset: auto 8px 6px 8px; font-size: 12px; text-align: center;
          color: var(--secondary-text-color); }
        .message[hidden], .controls[hidden] { display: none; }
        .fallback-icon { position: absolute; top: 4px; right: 6px; --mdc-icon-size: 18px;
          color: var(--secondary-text-color); opacity: 0.8; }
        .controls { flex: none; border-top: 1px solid var(--divider-color); }
        /* With the console the card sizes itself (getGridOptions rows "auto"): its height follows its content. */
        ha-card.with-console { height: auto; min-height: 100%; }
        ha-card.with-console .stage { flex: 1 0 auto; min-height: 120px; }
      </style>
      <ha-card>
        <div class="stage"><canvas role="img"></canvas><div class="message" hidden></div></div>
        <div class="controls" hidden></div>
      </ha-card>`;
    this._card = root.querySelector("ha-card");
    this._controls = root.querySelector(".controls");
    this._stage = root.querySelector(".stage");
    this._canvas = root.querySelector("canvas");
    this._message = root.querySelector(".message");
    this._raf = 0;
    this._connected = false;
    this._onScreen = true;
    this._sleeping = false;
    this._w = 0;
    this._h = 0;
    // A draw can come before the first tick (connect, or a resize while stopped): the clocks start at 0.
    this._clock = 0;
    this._drift = 0;
    this._onVisibility = () => this._run();
  }

  // ---- Home Assistant card API ------------------------------------------------------
  setConfig(raw) {
    const config = normaliseConfig(raw, FLAVOUR_KINDS);
    if (this._engine?.kind !== config.source.kind) this._engine = new Engine(config.source.kind);
    this._config = config;
    this._ids = entitiesOf(config);
    this._seen = {};
    this._lastStamp = undefined;
    this._noReading = false;
    this._setFallback(false);
    this._demo = null;
    this._palette = null;
    this._sleeping = false;
    this._offFor = 0;
    this._stage.style.height = config.height ?? "";
    this._session = {}; // a new config is a new starting point for the console
    this._resolve();
    this._mountConsole();
    if (this._hass) this._applyHass(this._hass, true);
    this._run();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._applyHass(hass, false);
  }

  get hass() { return this._hass; }

  getGridOptions() {
    // The console sizes the card itself: rows "auto" lets the grid follow its height.
    return this._config?.controls === true ? { columns: 12, rows: "auto", min_rows: 2 } : { columns: 12, rows: 2, min_rows: 1 };
  }

  getCardSize() { return 2; }

  static getStubConfig() {
    return { source: { kind: "spectrum", demo: true }, flavour: "swell" };
  }

  // `hass` is optional (tests pass one); Home Assistant calls this without arguments.
  static getConfigForm(hass) {
    const h = () => hass ?? pageHass();
    const options = (group, values) => values.map((value) => ({ value, label: t(h(), `card.ambient_wave.${group}.${value}`) }));
    const select = (group, values) => ({ select: { mode: "dropdown", options: options(group, values) } });
    const number = (extra = {}) => ({ number: { mode: "box", ...extra } });
    return {
      schema: [
        { name: "source", type: "expandable", schema: [
          { name: "kind", required: true, selector: select("kind", ["spectrum", "scalar"]) },
          { name: "entity", selector: { entity: { domain: "sensor" } } },
          { name: "demo", selector: { boolean: {} } },
          { name: "scenario", selector: select("scenario", SCENARIOS) },
          { name: "offset", selector: { entity: { domain: ["input_number", "number", "sensor"] } } },
        ] },
        { name: "flavour", selector: select("flavour", Object.keys(FLAVOUR_KINDS)) },
        { name: "colour", type: "expandable", schema: [
          { name: "palette", selector: select("palette", NAMED_PALETTES) },
          { name: "neutral", selector: number({ step: 0.1 }) },
          { name: "hot", selector: number({ step: 0.1 }) },
        ] },
        { name: "dynamics", type: "expandable", schema: [
          { name: "rise", selector: number({ min: 0, max: 5000, step: 10 }) },
          { name: "fall", selector: number({ min: 0, max: 60, step: 0.1 }) },
          { name: "hold", selector: number({ min: 0, max: 30, step: 0.1 }) },
          { name: "tilt", selector: { boolean: {} } },
        ] },
        { name: "style", type: "expandable", schema: [
          { name: "line_width", selector: number({ min: 0.5, max: 12, step: 0.1 }) },
        ] },
        { name: "active", selector: { entity: {} } },
        { name: "fallback", selector: select("fallback", FALLBACKS) },
        { name: "controls", selector: { boolean: {} } },
      ],
      computeLabel: (s) => t(h(), `card.ambient_wave.editor.${s.name}`),
    };
  }

  connectedCallback() {
    this._connected = true;
    document.addEventListener("visibilitychange", this._onVisibility);
    if (typeof IntersectionObserver !== "undefined") {
      this._io = new IntersectionObserver((entries) => {
        this._onScreen = entries.some((e) => e.isIntersecting);
        this._run();
      });
      this._io.observe(this);
    }
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._measure());
      this._ro.observe(this._stage);
    }
    this._neutralRgb = null; // the theme may differ where the card is now attached
    this._primary = null;
    if (this._config) this._rebuildPalette();
    this._measure();
    this._run();
  }

  // What the console shows; entity-bound values are only known once hass has arrived.
  _consoleKey() {
    const r = this._resolved;
    return JSON.stringify([language(this._hass), r.flavour, r.colour, r.dynamics, r.style, r.source.demo, r.source.scenario]);
  }

  // Mounted again when the language changes, or while the console is untouched and the values it
  // starts from change (hass after setConfig), always from the options as they now are.
  _mountConsole() {
    this._console?.destroy();
    this._console = null;
    this._consoleKey_ = this._consoleKey();
    this._consoleLang = language(this._hass);
    const on = this._config.controls === true;
    this._controls.hidden = !on;
    this._card.classList.toggle("with-console", on);
    if (!on) return;
    this._console = mountConsole(this.shadowRoot, {
      resolved: this._resolved,
      kind: this._config.source.kind,
      t: (key) => t(this._hass, key),
      onChange: (patch) => this._onConsole(patch),
    });
  }

  // The session override lives on this instance only: never written to the config or to Home Assistant.
  _onConsole(patch) {
    this._session = mergeDeep(this._session, patch);
    this._resolve();
    // Back from demo to an entity: take its last report now rather than at its next change.
    if (!this._demo && this._config.source.entity && this._hass) {
      this._lastStamp = undefined;
      this._read(this._hass);
    }
    if (!this._raf) this._draw(this._isActive());
  }

  disconnectedCallback() {
    this._connected = false;
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._io?.disconnect();
    this._ro?.disconnect();
    this._io = this._ro = null;
    this._stop();
  }

  // ---- State --------------------------------------------------------------------------
  // The console's session overrides are merged over the resolved options, so they survive hass updates.
  _resolve() {
    // The console keeps its own pair in order, but a helper may move under it (session neutral 70,
    // then the hot helper set to 60): ordered again after the merge.
    this._resolved = orderColour(mergeDeep(resolveOptions(this._config, this._hass?.states, FLAVOUR_KINDS), this._session ?? {}));
    this._rebuildPalette();
    const src = this._resolved.source;
    if (src.demo === true && (!this._demo || this._demoScenario !== src.scenario)) {
      this._demo = new Demo(src.scenario);
      this._demoScenario = src.scenario;
      this._nextBands = this._nextLevel = 0;
    } else if (src.demo !== true) {
      this._demo = null;
    }
    // normaliseConfig allows the third-octave axis only and checks `show`.
    const spectrum = this._config.source.kind === "spectrum";
    this._show = spectrum ? [nearestBand(src.show[0]), nearestBand(src.show[1])] : [undefined, undefined];
  }

  _rebuildPalette() {
    this._neutralRgb ??= this._themeColour(this._resolved.colour.neutral_color);
    const { palette, neutral, hot } = this._resolved.colour;
    const key = JSON.stringify([palette, neutral, hot, this._neutralRgb]);
    if (key !== this._paletteKey || !this._palette) {
      this._paletteKey = key;
      this._palette = makePalette({ palette, neutral, hot }, this._neutralRgb);
    }
  }

  // `var(--x[, fallback])` is read from the theme as the card sees it.
  _themeColour(css) {
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(String(css ?? "").trim());
    const value = m ? getComputedStyle(this).getPropertyValue(m[1]).trim() || m[2] : css;
    return parseColour(value) ?? FALLBACK_RGB;
  }

  _applyHass(hass, force) {
    const states = hass.states ?? {};
    const changed = force || hass.themes !== this._themes || this._ids.some((id) => states[id] !== this._seen[id]);
    if (!changed) return;
    if (hass.themes !== this._themes) this._neutralRgb = this._primary = null;
    this._themes = hass.themes;
    for (const id of this._ids) this._seen[id] = states[id];

    this._resolve();
    if (this._config.controls === true) {
      const touched = Object.keys(this._session).length > 0;
      if (this._consoleKey() !== this._consoleKey_ && (!touched || language(hass) !== this._consoleLang)) this._mountConsole();
    }
    if (this._demo) this._showMessage(null);
    else if (this._config.source.entity) this._read(hass);
    // The icon's text follows the language; whether it shows is decided by the loop.
    if (this._falling) this._setFallback(true);
    if (this._sleeping && this._isActive()) {
      this._sleeping = false;
      this._run();
    }
  }

  _read(hass) {
    const src = this._resolved.source;
    const reading = readSource(src, hass);
    this._showMessage(reading?.error === "count"
      ? t(hass, "card.ambient_wave.message.count", { expected: THIRD_OCTAVE.length, count: reading.count })
      : null);
    if (!reading || reading.error) {
      // Once per transition, so the wave calms at the fall speed now: a spectrum would otherwise wait
      // for its 5 s timeout, and a scalar has none.
      if (!this._noReading) {
        this._noReading = true;
        this._lastStamp = undefined;
        this._engine.push(this._engine.kind === "spectrum" ? new Array(THIRD_OCTAVE.length).fill(NaN) : NaN, Date.now());
      }
      return;
    }
    // A new report only; stamped with this browser's clock, since the server's may be skewed.
    if (reading.updated === this._lastStamp) return;
    this._lastStamp = reading.updated;
    this._noReading = false;
    this._unit = reading.unit;
    this._engine.push(reading.values ?? reading.value, Date.now());
  }

  _showMessage(text) {
    this._message.hidden = !text;
    this._message.textContent = text ?? "";
  }

  _isActive() {
    const id = this._config?.active;
    if (!id || !this._hass) return true;
    return this._hass.states?.[id]?.state === "on";
  }

  // ---- Loop -----------------------------------------------------------------------------
  _canRun() {
    return this._connected && this._onScreen && !this._sleeping && !!this._config
      && document.visibilityState !== "hidden";
  }

  _run() {
    if (!this._canRun()) { this._stop(); return; }
    if (this._raf) return;
    this._last = null;
    this._raf = requestAnimationFrame(this._tick);
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _tick = (now) => {
    this._raf = 0;
    if (!this._canRun()) return;
    const interval = 1000 / this._resolved.fps;
    // 0.9: a 60 Hz display at a 30 fps cap draws every second frame, not every third.
    if (this._last !== null && now - this._last < interval * 0.9) {
      this._raf = requestAnimationFrame(this._tick);
      return;
    }
    const dt = this._last === null ? 0 : Math.min(MAX_DT, (now - this._last) / 1000);
    this._last = now;
    this._clock += dt;
    this._reduced ??= window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    this._drift += dt * (this._reduced?.matches ? 0.3 : 1);

    this._pushDemo();
    this._engine.step(dt, Date.now(), this._palette, this._engineOpts());
    const falling = this._wantsFallback();
    if (falling !== this._falling) this._setFallback(falling);
    const active = this._isActive();
    this._draw(active);
    this._console?.update(this._engine.frame, this._unit);
    this._aria(active);

    this._offFor = active ? 0 : (this._offFor ?? 0) + dt;
    if (this._offFor >= SETTLE_S) { this._sleeping = true; return; }
    this._raf = requestAnimationFrame(this._tick);
  };

  _pushDemo() {
    if (!this._demo) return;
    const ms = this._clock * 1000;
    const spectrum = this._engine.kind === "spectrum";
    // Each kind takes the reading the device would send it, at the device's rate.
    if (spectrum && ms >= this._nextBands) {
      this._engine.push(this._demo.bands(this._clock), Date.now());
      this._nextBands = ms + DEMO_BANDS_MS;
    } else if (!spectrum && ms >= this._nextLevel) {
      this._engine.push(this._demo.level(this._clock), Date.now());
      this._nextLevel = ms + DEMO_LEVEL_MS;
    }
    this._unit = "dB";
  }

  _engineOpts() {
    const r = this._resolved;
    return {
      ...r.dynamics,
      historyS: r.source.history,
      showFrom: this._show[0],
      showTo: this._show[1],
      unit: this._unit,
      windows: r.flavour_options?.windows ?? DEFAULT_WINDOWS,
    };
  }

  // ---- Fallback ---------------------------------------------------------------------------
  // No reading (unavailable, unknown, missing, malformed) or a stale frame: a source never seen
  // since Home Assistant started has never pushed, so its frame is stale from the first step, and
  // a spectrum goes stale after 5 s without a report. A demo always has data.
  _wantsFallback() {
    if (this._config.fallback !== "classic" || this._demo) return false;
    return this._noReading || this._engine.frame.stale;
  }

  _setFallback(on) {
    this._falling = on;
    let icon = this._stage.querySelector(".fallback-icon");
    if (!on) { icon?.remove(); return; }
    if (!icon) {
      icon = document.createElement("ha-icon");
      icon.className = "fallback-icon";
      icon.setAttribute("icon", FALLBACK_ICON);
      this._stage.appendChild(icon);
    }
    const text = t(this._hass, "card.ambient_wave.fallback.no_data");
    if (icon.getAttribute("title") !== text) {
      icon.setAttribute("title", text);
      icon.setAttribute("aria-label", text);
    }
  }

  // Read as Ramka's now-playing card reads it, so the two strips match under any theme.
  _primaryColour() {
    this._primary ??= (getComputedStyle(this).getPropertyValue("--primary-color") || "#03a9f4").trim();
    return this._primary;
  }

  _measure() {
    const w = this._stage.clientWidth;
    const h = this._stage.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (w === this._w && h === this._h && dpr === this._dpr) return;
    this._w = w; this._h = h; this._dpr = dpr;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    // Resizing clears the canvas; a stopped loop (asleep, hidden, off-screen) would leave it blank.
    if (this._config && !this._raf) {
      if (!this._engine.frame.palette) this._engine.step(0, Date.now(), this._palette, this._engineOpts());
      this._draw(this._isActive());
      this._console?.update(this._engine.frame, this._unit);
    }
  }

  _draw(active) {
    const { _w: w, _h: h } = this;
    if (!w || !h) return;
    const ctx = this._canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Real time, like the now-playing wave, rather than the reduced-motion drift of the flavours.
    if (this._falling && active) { drawClassic(ctx, w, h, this._clock, this._primaryColour()); return; }
    const flavour = (active && FLAVOURS[this._resolved.flavour]) || FLAVOURS.still;
    const options = { ...flavour.defaults, ...this._resolved.flavour_options,
      lineWidth: this._resolved.style.line_width };
    flavour.draw(ctx, w, h, this._drift, this._engine.frame, options);
  }

  _aria(active) {
    if (this._ariaAt !== undefined && this._clock - this._ariaAt < ARIA_MS / 1000) return;
    this._ariaAt = this._clock;
    const label = this._summary(active);
    if (label !== this._canvas.getAttribute("aria-label")) this._canvas.setAttribute("aria-label", label);
  }

  _summary(active) {
    const hass = this._hass;
    const f = this._engine.frame;
    if (!active) return t(hass, "card.ambient_wave.aria.still");
    if (this._falling) return t(hass, "card.ambient_wave.fallback.no_data");
    if (f.stale) return t(hass, "card.ambient_wave.aria.calm");
    const fmt = new Intl.NumberFormat(language(hass), { maximumFractionDigits: 1 });
    const unit = this._unit ?? "";
    if (f.kind === "spectrum") {
      const from = this._show[0] ?? 0;
      const to = this._show[1] ?? f.smooth.length - 1;
      let loudest = from;
      for (let i = from; i <= to; i++) if (f.smooth[i] > f.smooth[loudest]) loudest = i;
      return t(hass, "card.ambient_wave.aria.spectrum", {
        frequency: fmt.format(THIRD_OCTAVE[loudest]), level: Math.round(f.smooth[loudest]), unit,
      }).trim();
    }
    return t(hass, "card.ambient_wave.aria.scalar", { level: fmt.format(f.smoothValue), unit }).trim();
  }
}

if (!customElements.get("ambient-wave-card")) customElements.define("ambient-wave-card", AmbientWaveCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "ambient-wave-card")) {
  window.customCards.push({
    type: "ambient-wave-card",
    name: t(null, "card.ambient_wave.name"),
    description: t(null, "card.ambient_wave.description"),
    preview: true,
  });
}
