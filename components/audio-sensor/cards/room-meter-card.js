// A live sound level meter for the room: an analog needle (RMS, with VU-like ballistics from a
// CSS transition), a peak-hold marker, an LED ladder of the loudest sample, and a strip of recent
// readings, one bar each. Everything is drawn from the states as they arrive: no history is
// fetched, so nothing waits on the recorder and the strip fills while the page is open. Levels are
// dB SPL (the component's Home Assistant package adds the offset); while the offset is an estimate
// the card says so.
//
// Live tracking: a button on the card turns the sensor's 100 ms readings on (its `live_switch`);
// while they arrive the meter follows them, ten a second, and the strip shows the last
// `live_seconds`. Those readings are dBFS, so the card adds the offset itself rather than have a
// template in Home Assistant run ten times a second. The 1-second readings carry on unchanged.
//
//   type: custom:room-meter-card
//   level: sensor.demo_level               # 1-second RMS, dB SPL
//   peak: sensor.demo_peak                 # loudest sample in that second
//   leq: sensor.demo_leq_1_min             # optional: a marker on the scale
//   offset: sensor.demo_spl_offset         # optional: its `calibrated` attribute, the clip mark
//   live_switch: switch.demo_live_tracking # optional: live tracking
//   live_level: sensor.demo_fast_level     # 100 ms RMS, dBFS
//   live_peak: sensor.demo_fast_peak       # 100 ms peak, dBFS
//   min: 20                                # scale, dB
//   max: 120
//   seconds: 120                           # length of the strip
//   live_seconds: 20                       # length of the strip in live tracking

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const ZONES = [
  // [up to dB, colour, what it sounds like: card.room_meter.zone.<key>]
  [25, "#4fc3f7", "near_silence"],
  [35, "#4fc3f7", "very_quiet"],
  [45, "#26a69a", "quiet"],
  [55, "#66bb6a", "background_music"],
  [65, "#9ccc65", "conversation"],
  [75, "#d4e157", "lively_music"],
  [85, "#ffca28", "loud_music"],
  [95, "#ffa726", "very_loud"],
  [105, "#ff7043", "concert"],
  [Infinity, "#e53935", "painful"],
];

const zoneOf = (db) => ZONES.find(([upTo]) => db < upTo);
const colourOf = (db) => zoneOf(db)[1];

const SWEEP = 240; // degrees of the dial, centred on the top
const CX = 150;
const CY = 150;
const HOLD_MS = 3000; // the peak marker holds this long, then falls
const FALL_DB_PER_S = 8;

const SVG_NS = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}

class RoomMeterCard extends HTMLElement {
  setConfig(config) {
    if (!config.level) throw new Error("room-meter-card: level is required");
    this._config = { min: 20, max: 120, seconds: 120, live_seconds: 20, ...config };
    this._strip = []; // {t, dt, level, peak} per update, newest last
    this._live = false;
    this._hold = null;
    this._holdAt = 0;
    this._lastStamp = null;
    this._lastUpdate = 0;
    if (this.shadowRoot) this._build();
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return { columns: 12, rows: 7, min_columns: 6, min_rows: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this._build();
    }
    const { level, live_level: liveLevel, live_switch: liveSwitch } = this._config;
    const switchState = liveSwitch ? hass.states[liveSwitch] : undefined;
    const live = switchState?.state === "on" && this._num(liveLevel) !== null;
    const source = hass.states[live ? liveLevel : level];
    // Redraw only when the reading in use, the mode or the language changed: hass is set for every
    // state change in Home Assistant.
    const stamp = `${live}|${switchState?.state}|${source ? source.last_updated : ""}|${hass.language}`;
    if (stamp === this._lastStamp) return;
    this._lastStamp = stamp;
    if (live !== this._live) {
      this._live = live;
      this._strip = [];
      this.shadowRoot.querySelector("ha-card").classList.toggle("live", live);
    }
    this._update();
  }

  _toggleLive() {
    const entity = this._config.live_switch;
    const on = this._hass.states[entity]?.state === "on";
    this._hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: entity });
  }

  _angle(db) {
    const { min, max } = this._config;
    const clamped = Math.min(max, Math.max(min, db));
    return -SWEEP / 2 + (SWEEP * (clamped - min)) / (max - min);
  }

  _point(angle, radius) {
    const rad = (angle * Math.PI) / 180;
    return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
  }

  _arc(from, to, radius) {
    const [x1, y1] = this._point(this._angle(from), radius);
    const [x2, y2] = this._point(this._angle(to), radius);
    const large = this._angle(to) - this._angle(from) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  }

  _build() {
    const { min, max } = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card { height: 100%; box-sizing: border-box; padding: 12px 16px 14px; position: relative;
                  display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
        .live-button { position: absolute; top: 10px; left: 12px; z-index: 1; cursor: pointer;
                       font: 600 12px var(--ha-font-family-body, sans-serif); letter-spacing: 0.04em;
                       padding: 5px 10px; border-radius: 14px; background: none;
                       color: var(--secondary-text-color); border: 1px solid var(--divider-color); }
        .live-button[hidden] { display: none; }
        .live .live-button { color: #fff; background: #e53935; border-color: #e53935; }
        .live .live-button::before { content: ""; display: inline-block; width: 7px; height: 7px;
                                     margin-right: 6px; border-radius: 50%; background: #fff;
                                     animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 50% { opacity: 0.25; } }
        .live .needle { transition-duration: 0.25s; }
        .live .seg { transition-duration: 0.05s; }
        .top { display: flex; gap: 12px; align-items: stretch; flex: 1; min-height: 0; }
        .dial { flex: 1; min-width: 0; display: flex; justify-content: center; }
        .dial svg { width: 100%; max-height: 100%; }
        .ladder svg { height: 100%; width: auto; }
        .needle, .hold, .leq { transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
        .needle { transition: transform 0.8s cubic-bezier(0.25, 0.9, 0.35, 1.05); }
        .hold, .leq { transition: transform 0.4s ease-out; }
        .seg { transition: opacity 0.15s linear; }
        .tick { stroke: var(--secondary-text-color); }
        .label { fill: var(--secondary-text-color); font: 10px var(--ha-font-family-body, sans-serif); }
        .value { fill: var(--primary-text-color); font: 600 34px var(--ha-font-family-body, sans-serif);
                 font-variant-numeric: tabular-nums; }
        .unit { fill: var(--secondary-text-color); font: 13px var(--ha-font-family-body, sans-serif); }
        .what { font: 500 13px var(--ha-font-family-body, sans-serif); }
        canvas { width: 100%; height: 110px; display: block; flex: none; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--secondary-text-color);
                 font-size: 13px; }
        .chips b { color: var(--primary-text-color); font-weight: 600; font-variant-numeric: tabular-nums; }
        .estimate { color: var(--warning-color, #ffa726); }
      </style>
      <ha-card>
        <button class="live-button" hidden></button>
        <div class="top">
          <div class="dial"></div>
          <div class="ladder"></div>
        </div>
        <canvas></canvas>
        <div class="chips"></div>
      </ha-card>`;

    // The dial: coloured zones, ticks every 5 dB, labels every 10, the clip mark, the needle.
    const dial = el("svg", { viewBox: "0 0 300 236" });
    for (let i = 0; i < ZONES.length; i++) {
      const from = Math.max(min, i === 0 ? min : ZONES[i - 1][0]);
      const to = Math.min(max, ZONES[i][0]);
      if (to <= from) continue;
      el("path", { d: this._arc(from, to, 118), stroke: ZONES[i][1], "stroke-width": 8,
                   fill: "none", opacity: 0.85 }, dial);
    }
    for (let db = min; db <= max; db += 5) {
      const major = db % 10 === 0;
      const [x1, y1] = this._point(this._angle(db), major ? 104 : 108);
      const [x2, y2] = this._point(this._angle(db), 113);
      el("line", { x1, y1, x2, y2, class: "tick", "stroke-width": major ? 2 : 1 }, dial);
      if (major) {
        const [lx, ly] = this._point(this._angle(db), 92);
        const text = el("text", { x: lx, y: ly + 3.5, "text-anchor": "middle", class: "label" }, dial);
        text.textContent = db;
      }
    }
    this._clipMark = el("path", { fill: "none", stroke: "#e53935", "stroke-width": 4 }, dial);
    this._leq = el("g", { class: "leq" }, dial);
    el("path", { d: `M ${CX} ${CY - 126} l -4 -7 h 8 z`, fill: "var(--info-color, #039be5)" }, this._leq);
    this._holdMark = el("g", { class: "hold" }, dial);
    el("path", { d: `M ${CX} ${CY - 112} l -5 -9 h 10 z`, fill: "#e53935" }, this._holdMark);
    this._needle = el("g", { class: "needle" }, dial);
    el("path", { d: `M ${CX - 2.5} ${CY} L ${CX} ${CY - 112} L ${CX + 2.5} ${CY} Z`,
                 fill: "var(--primary-text-color)" }, this._needle);
    el("circle", { cx: CX, cy: CY, r: 7, fill: "var(--primary-text-color)" }, dial);
    this._what = el("text", { x: CX, y: 176, "text-anchor": "middle", class: "what" }, dial);
    this._value = el("text", { x: CX, y: 212, "text-anchor": "middle", class: "value" }, dial);
    this._unit = el("text", { x: CX, y: 230, "text-anchor": "middle", class: "unit" }, dial);
    this.shadowRoot.querySelector(".dial").appendChild(dial);

    // The LED ladder: 2 dB per segment, lit to the loudest sample, the held peak lit apart.
    const ladder = el("svg", { viewBox: "0 0 46 236" });
    const segments = Math.round((max - min) / 2);
    const top = 8;
    const height = 220;
    const step = height / segments;
    this._segments = [];
    for (let i = 0; i < segments; i++) {
      const db = min + i * 2 + 1;
      const y = top + height - (i + 1) * step;
      this._segments.push(el("rect", { x: 24, y: y + 0.6, width: 18, height: step - 1.2, rx: 1,
                                       fill: colourOf(db), opacity: 0.12, class: "seg" }, ladder));
    }
    for (let db = min; db <= max; db += 20) {
      const y = top + height - ((db - min) / (max - min)) * height;
      const text = el("text", { x: 19, y: y + 3.5, "text-anchor": "end", class: "label" }, ladder);
      text.textContent = db;
    }
    this.shadowRoot.querySelector(".ladder").appendChild(ladder);

    this._canvas = this.shadowRoot.querySelector("canvas");
    this._chips = this.shadowRoot.querySelector(".chips");
    this._liveButton = this.shadowRoot.querySelector(".live-button");
    this._liveButton.addEventListener("click", () => this._toggleLive());
    new ResizeObserver(() => this._drawStrip()).observe(this._canvas);
  }

  _num(entity) {
    if (!entity || !this._hass) return null;
    const state = this._hass.states[entity];
    const value = state ? parseFloat(state.state) : NaN;
    return Number.isFinite(value) ? value : null;
  }

  _update() {
    const { level: levelId, peak: peakId, leq: leqId, offset: offsetId, live_switch: liveSwitch } =
      this._config;
    const live = this._live;
    const offset = this._num(offsetId);
    // Live readings are dBFS: on the dB SPL scale they sit at the offset (0 without one).
    const spl = (id) => {
      const value = this._num(id);
      return value === null ? null : value + (offset ?? 0);
    };
    const level = live ? spl(this._config.live_level) : this._num(levelId);
    const peak = live ? spl(this._config.live_peak) : this._num(peakId);
    const leq = this._num(leqId);
    const now = Date.now();

    const hass = this._hass;
    const switchState = liveSwitch ? hass.states[liveSwitch]?.state : undefined;
    this._liveButton.hidden = !switchState || switchState === "unavailable";
    this._liveButton.textContent = t(hass, `card.room_meter.live.${live ? "fast" : switchState === "on" ? "waiting" : "off"}`);
    this._liveButton.title = t(hass, `card.room_meter.live.${live ? "to_slow" : "to_fast"}`);

    if (level === null) {
      this._value.textContent = "—";
      this._what.textContent = t(hass, "card.room_meter.no_reading");
      this._what.setAttribute("fill", "var(--secondary-text-color)");
      return;
    }

    // Peak hold: a new maximum holds HOLD_MS, then falls at FALL_DB_PER_S down to the current peak.
    const loud = peak ?? level;
    if (this._hold === null || loud >= this._hold) {
      this._hold = loud;
      this._holdAt = now;
    } else {
      const fallFrom = Math.max(this._holdAt + HOLD_MS, this._lastUpdate);
      if (now > fallFrom) this._hold = Math.max(loud, this._hold - (FALL_DB_PER_S * (now - fallFrom)) / 1000);
    }
    this._lastUpdate = now;

    this._needle.style.transform = `rotate(${this._angle(level)}deg)`;
    this._holdMark.style.transform = `rotate(${this._angle(this._hold)}deg)`;
    this._leq.style.display = leq === null ? "none" : "";
    if (leq !== null) this._leq.style.transform = `rotate(${this._angle(leq)}deg)`;

    const [, colour, what] = zoneOf(level);
    this._value.textContent = level.toFixed(1);
    this._what.textContent = t(hass, `card.room_meter.zone.${what}`);
    this._what.setAttribute("fill", colour);

    const calibrated = offsetId ? hass.states[offsetId]?.attributes?.calibrated : true;
    const measuredOver = live ? "100 ms" : "1 s";
    this._unit.textContent = t(hass, `card.room_meter.${calibrated ? "unit" : "unit_estimated"}`, { window: measuredOver });

    // 0 dBFS, where the sensor clips, sits at the offset on this scale.
    const clipOnScale = offset !== null && offset >= this._config.min && offset < this._config.max;
    this._clipMark.setAttribute("d", clipOnScale ? this._arc(offset, offset + 1.5, 125) : "");

    const lit = (loud - this._config.min) / 2;
    const held = Math.floor((this._hold - this._config.min) / 2);
    this._segments.forEach((seg, i) => {
      seg.setAttribute("opacity", i < lit ? 0.95 : i === held ? 0.95 : 0.12);
    });

    const last = this._strip[this._strip.length - 1];
    const dt = Math.min(2000, Math.max(50, last ? now - last.t : live ? 100 : 1000));
    this._strip.push({ t: now, dt, level, peak: loud });
    const span = (live ? this._config.live_seconds : this._config.seconds) * 1000;
    while (this._strip.length && this._strip[0].t < now - span) this._strip.shift();
    this._drawStrip();

    const chip = (name, value, unit = "dB") =>
      value === null ? "" : `<span>${name} <b>${value.toFixed(1)}</b> ${unit}</span>`;
    const crest = peak !== null ? peak - level : null;
    const headroom = offset !== null && peak !== null ? offset - peak : null;
    this._chips.innerHTML = [
      chip(t(hass, "card.room_meter.chip.leq"), leq),
      chip(t(hass, "card.room_meter.chip.peak"), peak),
      chip(t(hass, "card.room_meter.chip.hold"), this._hold),
      chip(t(hass, "card.room_meter.chip.crest"), crest),
      chip(t(hass, "card.room_meter.chip.headroom"), headroom),
      calibrated ? "" : `<span class="estimate">${t(hass, "card.room_meter.offset_estimated")}</span>`,
    ].join("");
  }

  // One bar per reading, oldest left: the RMS as the bar, the peak as a dot above it.
  _drawStrip() {
    const canvas = this._canvas;
    if (!canvas || !canvas.clientWidth) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { min, max } = this._config;
    const span = (this._live ? this._config.live_seconds : this._config.seconds) * 1000;
    const y = (db) => height - ((Math.min(max, Math.max(min, db)) - min) / (max - min)) * height;
    const styles = getComputedStyle(this);
    ctx.strokeStyle = styles.getPropertyValue("--divider-color") || "rgba(127,127,127,0.25)";
    ctx.lineWidth = 1;
    ctx.fillStyle = styles.getPropertyValue("--secondary-text-color") || "#888";
    ctx.font = "10px sans-serif";
    for (let db = min + 20; db < max; db += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y(db) + 0.5);
      ctx.lineTo(width, y(db) + 0.5);
      ctx.stroke();
      ctx.fillText(db, 2, y(db) - 2);
    }

    // Each bar is as wide as the time its reading covers: one second, or 100 ms in live tracking.
    const now = Date.now();
    for (const { t, dt, level, peak } of this._strip) {
      const barWidth = (width * dt) / span;
      const x = width - (width * (now - t)) / span - barWidth;
      const w = barWidth > 2 ? barWidth - 1 : Math.max(1, barWidth);
      ctx.fillStyle = colourOf(level);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y(level), w, height - y(level));
      ctx.globalAlpha = 1;
      ctx.fillStyle = colourOf(peak);
      ctx.fillRect(x, y(peak) - 1, w, 2);
    }
  }
}

if (!customElements.get("room-meter-card")) customElements.define("room-meter-card", RoomMeterCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "room-meter-card")) {
  window.customCards.push({
    type: "room-meter-card",
    name: t(null, "card.room_meter.name"),
    description: t(null, "card.room_meter.description"),
  });
}
