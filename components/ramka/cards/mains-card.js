// Mains power and voltage of a power strip for a wall tablet: the two live values in
// large type on the left, a smoothed line of the voltage over the last hour on the right. No
// legend, no axis labels beyond the range at the left edge; the history comes from HA's history
// API once a minute and is resampled to a moving average.
//
//   type: custom:mains-card
//   power: sensor.hifi_mains_power
//   voltage: sensor.hifi_mains_voltage
//   hours: 1
//   smooth: 9                  # moving-average window, samples (odd)
//   baseline: 230              # V, drawn as a thin reference line; the voltage line is a soft
//                              # stroke that gets darker the farther it is from it
//   below: 8                   # V the chart spans under the baseline by default
//   above: 2                   # V over it by default; either side grows when the data leaves it

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

class MainsCard extends HTMLElement {
  setConfig(config) {
    if (!config.power || !config.voltage) throw new Error("mains-card: power and voltage are required");
    this._config = { hours: 1, smooth: 9, baseline: 230, below: 8, above: 2, ...config };
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 4, min_rows: 3 };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
    if (first) this._fetch();
  }

  connectedCallback() {
    this._timer = setInterval(() => this._fetch(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _build() {
    this._built = true;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card { height: 100%; box-sizing: border-box; padding: 5cqh 3cqw; container-type: size;
                  display: flex; gap: 3cqw; overflow: hidden; }
        .values { flex: 0 0 auto; display: flex; flex-direction: column; justify-content: space-around; }
        .value { font-size: 30cqh; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .value small { font-size: 13cqh; font-weight: 400; color: var(--secondary-text-color); margin-left: 0.5cqw; }
        .chart { flex: 1 1 auto; min-width: 0; position: relative; }
        canvas { width: 100%; height: 100%; display: block; }
        .range { position: absolute; left: 0; font-size: 8cqh; color: var(--secondary-text-color); line-height: 1; opacity: 0.6; }
        .max { top: 0; } .min { bottom: 0; }
      </style>
      <ha-card>
        <div class="values">
          <div class="value power"></div>
          <div class="value voltage"></div>
        </div>
        <div class="chart"><canvas></canvas><div class="range max"></div><div class="range min"></div></div>
      </ha-card>`;
    this._q = (sel) => root.querySelector(sel);
    if (window.ResizeObserver) new ResizeObserver(() => this._draw()).observe(this);
  }

  _num(id) {
    const s = this._hass.states[id];
    const v = s ? parseFloat(s.state) : NaN;
    return Number.isFinite(v) ? v : null;
  }

  _update() {
    const p = this._num(this._config.power), v = this._num(this._config.voltage);
    const none = t(this._hass, "card.common.noValue");
    this._q(".power").innerHTML = p == null ? none : `${Math.round(p)}<small>W</small>`;
    this._q(".voltage").innerHTML = v == null ? none : `${Math.round(v)}<small>V</small>`;
    if (v != null && this._series && this._series.length) {
      const last = this._series[this._series.length - 1];
      if (Date.now() - last.t > 30000) { this._series.push({ t: Date.now(), v }); this._draw(); }
    }
  }

  async _fetch() {
    if (!this._hass) return;
    const start = new Date(Date.now() - this._config.hours * 3600000).toISOString();
    try {
      const data = await this._hass.callApi(
        "GET", `history/period/${start}?filter_entity_id=${this._config.voltage}&minimal_response&no_attributes`);
      const rows = (data && data[0]) || [];
      this._series = rows.map((r) => ({ t: Date.parse(r.last_changed), v: parseFloat(r.state) }))
                         .filter((r) => Number.isFinite(r.v));
      this._draw();
    } catch (e) {
      console.info("mains-card: history fetch failed", e);
    }
  }

  _draw() {
    const canvas = this._q("canvas");
    if (!canvas || !this._series || this._series.length < 2) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const now = Date.now(), span = this._config.hours * 3600000, t0 = now - span;
    // Resample to one value per pixel-ish bucket (step function held between samples), then
    // a centred moving average over `smooth` buckets.
    const n = Math.max(40, Math.floor(w / 3));
    const raw = new Array(n);
    let i = 0, cur = this._series[0].v;
    for (let k = 0; k < n; k++) {
      const tt = t0 + (k / (n - 1)) * span;
      while (i < this._series.length && this._series[i].t <= tt) { cur = this._series[i].v; i++; }
      raw[k] = cur;
    }
    const smoothed = (win) => {
      const half = Math.floor(win / 2), out = new Array(n);
      for (let k = 0; k < n; k++) {
        let sum = 0, c = 0;
        for (let j = Math.max(0, k - half); j <= Math.min(n - 1, k + half); j++) { sum += raw[j]; c++; }
        out[k] = sum / c;
      }
      return out;
    };
    const sm = smoothed(this._config.smooth);
    const base = this._config.baseline;
    const lo = Math.min(...sm), hi = Math.max(...sm);
    // Little room above the baseline by default (mains voltage tends to sit under its nominal value); either edge
    // moves out when the data crosses it.
    const ymin = Math.min(base - this._config.below, Math.floor(lo - 1));
    const ymax = Math.max(base + this._config.above, Math.ceil(hi + 1));
    const range = Math.max(ymax - base, base - ymin);
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, w, h);
    const color = (getComputedStyle(this).getPropertyValue("--primary-color") || "#03a9f4").trim();
    const x = (k) => (k / (n - 1)) * w, y = (v) => h - ((Math.min(ymax, Math.max(ymin, v)) - ymin) / (ymax - ymin)) * h;
    // The reference line, always.
    g.save();
    g.setLineDash([6, 6]);
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y(base)); g.lineTo(w, y(base)); g.stroke();
    g.restore();
    // The voltage as a soft stroke, one segment at a time: full brightness of the theme colour
    // at the baseline, fading towards black as the value moves away from it.
    // One line in the hand of a single strand of the now-playing wave: thin, smooth, no blur,
    // translucent. Its colour is the gradient: the theme colour at the baseline, darkening
    // towards the edge of the range, segment by segment.
    const rgb = (() => {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = color; const hex = c.fillStyle;  // normalised to #rrggbb
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    })();
    const shade = (dev) => {
      const k = 1 - 0.6 * Math.pow(dev, 0.8);  // 1 at the baseline, 0.4 at the edge
      return `rgb(${rgb.map((v) => Math.round(v * k)).join(",")})`;
    };
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = Math.max(1.5, h * 0.045);
    g.globalAlpha = 0.6;
    for (let k = 1; k < n; k++) {
      const dev = Math.min(1, Math.abs((sm[k - 1] + sm[k]) / 2 - base) / range);
      g.strokeStyle = shade(dev);
      g.beginPath(); g.moveTo(x(k - 1), y(sm[k - 1])); g.lineTo(x(k), y(sm[k])); g.stroke();
    }
    g.restore();
    this._q(".max").textContent = `${ymax} V`;
    this._q(".min").textContent = `${ymin} V`;
    this._q(".range.max").title = t(this._hass, "card.mains.max", { value: hi.toFixed(1) });
    this._q(".range.min").title = t(this._hass, "card.mains.min", { value: lo.toFixed(1) });
  }
}

customElements.define("mains-card", MainsCard);
