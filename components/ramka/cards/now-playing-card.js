// Lovelace card for a wall tablet: what a media player plays, readable from across the room.
// Artwork on the left, title / artist / album in large type on the right, a progress bar that
// moves on its own between state updates, the volume, and a quality line. Sizes scale with the
// card's own height (cqh), so a tablet and a desktop window both fill their box.
//
//   type: custom:now-playing-card
//   entity: media_player.living_room
//   quality: sensor.amp_audio_quality            # optional, shown bottom right (hi_res → Hi-Res)
//   source: sensor.amp_source                    # optional, shown bottom right
//   details:                                     # optional sensors shown after them when they
//     - sensor.amp_bit_depth                     # have a value (some streaming services send
//     - sensor.amp_sample_rate                   # these, others do not), as "24 bit / 48 kHz"
//   wave: true                                   # optional: a slow, soft sine-wave animation
//                                                # between the album line and the progress bar
//                                                # while the player is playing (still otherwise)
//   visual:                                      # optional: the room's music in the wave strip,
//     select: input_select.music_visual          # in place of the wave; the select's state picks
//     spectrum: {type: custom:ambient-wave-card, ...}  # the card config shown (spectrum or level);
//     level: {type: custom:ambient-wave-card, ...}     # classic or anything else keeps the wave
//   debug: true                                  # optional: viewport and card size in a corner,
//                                                # to read the tablet's real CSS size once
//   height: calc(100vh - 304px)                  # optional, with grid_options rows: auto: the
//                                                # card's own height, so it fills the screen
//                                                # whatever the tablet's CSS size turns out to be
//
// Only `entity` is required. Everything else the card shows is optional, so a player that reports
// just a title, an artist and a state (a Chromecast, a DLNA renderer) renders as it is: the
// album and service line, the volume and the quality line stay empty when their attributes or
// sensors are missing. The quality words come from card.now_playing.quality.* in the Home
// Assistant language (en, de, pl; anything else falls back to en).
//
// The wave is decoration, not a level meter: a media player exposes no audio signal. Three
// sines of different periods drift at a few pixels a second; the loop stops when playback does.
// A `visual` is another card (audio-sensor's ambient-wave-card) drawing a real signal there; it
// decides itself when to be still (its own `active:`), so this card only creates and feeds it.

import { createT } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Icon for the service or input. Spotify and SoundCloud exist in MDI; Qobuz does not, so it is
// a small inline SVG monogram; anything else is picked from the input's name.
const SERVICE_ICONS = [
  [/spotify/i, "mdi:spotify"], [/soundcloud/i, "mdi:soundcloud"], [/qobuz/i, "svg:qobuz"],
  [/tidal/i, "mdi:waves"], [/airplay/i, "mdi:apple"], [/cast|chromecast/i, "mdi:cast-audio"],
  [/turntable|phono|gramofon/i, "mdi:record-player"], [/optical|toslink/i, "mdi:toslink"],
  [/coax|bnc|spdif/i, "mdi:audio-input-rca"], [/xlr|balanced/i, "mdi:audio-input-xlr"],
  [/usb/i, "mdi:usb"], [/network|lan|upnp|dlna|roon/i, "mdi:lan"], [/bluetooth/i, "mdi:bluetooth-audio"],
  [/tv|hdmi|arc/i, "mdi:television"], [/analog/i, "mdi:audio-input-stereo-minijack"],
];
const QOBUZ_SVG = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 6.3 17.8l2.3 2.2 1.4-1.4-2.2-2.2A10 10 0 0 0 12 2m0 2.5a7.5 7.5 0 0 1 5.9 12.1l-2-2-1.4 1.4 2 2A7.5 7.5 0 1 1 12 4.5"/></svg>`;
const serviceIcon = (name) => {
  if (!name) return null;
  for (const [re, icon] of SERVICE_ICONS) if (re.test(name)) return icon;
  return "mdi:audio-input-rca";
};
const iconHtml = (icon, title) => icon === "svg:qobuz"
  ? `<span class="svgicon" title="${esc(title)}">${QOBUZ_SVG}</span>`
  : `<ha-icon icon="${icon}" title="${esc(title)}"></ha-icon>`;

// The select options that name a card config under `visual`; any other state keeps the own wave.
const VISUAL_OPTIONS = ["spectrum", "level"];
// The hosted card fills the strip without card chrome: a border would add to its 100 % height
// and a background or radius would frame it inside this card.
const VISUAL_STYLE = {
  display: "block", width: "100%", height: "100%", "--ha-card-background": "transparent",
  "--ha-card-border-width": "0", "--ha-card-border-radius": "0", "--ha-card-box-shadow": "none",
};

const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

class NowPlayingCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("now-playing-card: entity is required");
    if (config.visual !== undefined && typeof config.visual?.select !== "string") {
      throw new Error("now-playing-card: visual.select is required");
    }
    this._config = config;
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: "full", rows: this._config.height ? "auto" : 8, min_rows: 5 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
    this._visualSync();
  }

  connectedCallback() {
    this._connected = true;
    this._timer = setInterval(() => this._progress(), 1000);
    if (this._built) this._visualSync(true);
  }

  // A kiosk rebuilds its dashboard for weeks and drops the old cards: nothing of a detached card
  // may keep running or be kept alive. A mounted child stays (reconnecting reuses it); a creation
  // still in flight and the element waits are dropped and come back on reconnect.
  disconnectedCallback() {
    this._connected = false;
    clearInterval(this._timer);
    this._waveStop();
    this._visualWaits = null;
    if (!this._visualChild) {
      this._visualKey = undefined;
      this._visualToken = null;
    }
  }

  // ---- Wave: a soft animation while the music plays ------------------------------
  _waveStart() {
    if (!this._config.wave || this._waveRunning) return;
    this._waveRunning = true;
    this._q(".eq").style.display = "block";
    const canvas = this._q(".eq canvas");
    const color = (getComputedStyle(this).getPropertyValue("--primary-color") || "#03a9f4").trim();
    const t0 = performance.now();
    const step = (now) => {
      if (!this._waveRunning) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w && h) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        const g = canvas.getContext("2d");
        g.clearRect(0, 0, w, h);
        const t = (now - t0) / 1000, mid = h / 2;
        // period in px, speed in px/s, amplitude as a share of the height, opacity
        for (const [period, speed, amp, alpha] of [[260, 28, 0.34, 0.55], [170, -40, 0.22, 0.35], [110, 55, 0.12, 0.22]]) {
          g.beginPath();
          g.lineWidth = Math.max(1.5, h * 0.045);
          g.strokeStyle = color;
          g.globalAlpha = alpha;
          for (let x = 0; x <= w; x += 2) {
            const y = mid + Math.sin((x + speed * t) / period * 2 * Math.PI) * amp * h * (0.75 + 0.25 * Math.sin(t / 3));
            x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      const s = this._hass && this._hass.states[this._config.entity];
      if (s && s.state === "playing") this._waveFrame = requestAnimationFrame(step);
      else { this._waveFrame = null; this._waveIdle = true; }
    };
    this._waveStep = step;
    this._waveFrame = requestAnimationFrame(step);
  }

  _waveStop() {
    this._waveRunning = false;
    if (this._waveFrame) cancelAnimationFrame(this._waveFrame);
    this._waveFrame = null;
  }

  // ---- Visual: another card in the strip, in place of the wave ---------------------
  // The card config the select names, or null for the own wave. A card whose element is not
  // defined yet (its resource still loading, or not installed) counts as null until it is.
  _visualWanted() {
    const visual = this._config.visual;
    if (!visual) return null;
    const option = this._hass?.states[visual.select]?.state;
    const config = VISUAL_OPTIONS.includes(option) ? visual[option] : null;
    if (typeof config?.type !== "string") return null;
    const tag = config.type.replace(/^custom:/, "");
    if (customElements.get(tag)) return option;
    // The registry keeps the wait until the element is defined, perhaps never (no audio-sensor):
    // it holds the card only weakly, and a disconnect makes it stale.
    this._visualWaits ??= new Set();
    if (!this._visualWaits.has(tag)) {
      const waits = this._visualWaits.add(tag), ref = new WeakRef(this);
      customElements.whenDefined(tag).then(() => {
        const card = ref.deref();
        if (card && card._visualWaits === waits) { waits.delete(tag); card._visualSync(); }
      });
    }
    return null;
  }

  // Shows the wanted visual or the own wave, only while connected: a detached card only feeds a
  // child it already has, and reconnecting (`restart`) resumes from the state as it is then.
  _visualSync(restart = false) {
    if (!this._connected) {
      if (this._visualChild) this._visualChild.hass = this._hass;
      return;
    }
    const key = this._visualWanted();
    if (key !== this._visualKey) {
      this._visualKey = key;
      const token = (this._visualToken = {});
      if (this._visualChild) {
        this._visualChild.remove();
        this._visualChild = null;
        this._q(".eq").style.display = "";
      }
      if (key) this._visualCreate(this._config.visual[key], token);
      // Until the visual is in the strip (the helpers load asynchronously), the wave draws.
      if (!this._visualChild) {
        this._q(".eq canvas").style.display = "";
        this._waveStart();
      }
    } else if (this._visualChild) {
      this._visualChild.hass = this._hass;
    } else if (restart) {
      this._waveStart();
    }
  }

  // Home Assistant's own createCardElement where it exists (error cards, its card handling);
  // the element directly otherwise, or when the helpers fail. `token` drops a creation that a
  // later switch or a disconnect has superseded. If both ways fail, the own wave keeps drawing.
  _visualCreate(config, token) {
    const direct = () => {
      const el = document.createElement(config.type.replace(/^custom:/, ""));
      el.setConfig(config);
      return el;
    };
    const mount = (helpers) => {
      if (token !== this._visualToken || !this._connected) return;
      let el;
      try {
        el = helpers ? helpers.createCardElement(config) : direct();
      } catch {
        if (!helpers) return;
        try { el = direct(); } catch { return; }
      }
      for (const [name, value] of Object.entries(VISUAL_STYLE)) el.style.setProperty(name, value);
      this._waveStop();
      this._q(".eq canvas").style.display = "none";
      this._q(".eq").style.display = "block";
      this._q(".eq").appendChild(el);
      this._visualChild = el;
      el.hass = this._hass;
    };
    if (window.loadCardHelpers) window.loadCardHelpers().then(mount, () => mount(null));
    else mount(null);
  }

  _build() {
    this._built = true;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        /* Every size is a share of the card's own height (cqh), so the card fits whatever box
           the sections grid gives it: 6 rows on the tablet, more or less elsewhere. Widths that
           do not fit end in an ellipsis. */
        ha-card { height: 100%; box-sizing: border-box; padding: 4cqh 2.5cqw; overflow: hidden;
                  container-type: size; }
        :host { display: block; height: 100%; container-type: size; }
        .row { display: flex; height: 100%; gap: 2.5cqw; align-items: stretch; }
        .art { flex: 0 0 auto; height: 100%; aspect-ratio: 1 / 1; border-radius: 3cqh;
               background: var(--secondary-background-color); object-fit: cover; }
        .art[hidden] { display: none; }
        .text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
        /* The title starts at 21cqh and _fitTitle() shrinks it until it fits one line. */
        .title { font-size: 21cqh; font-weight: 600; line-height: 1.05; white-space: nowrap; overflow: hidden; }
        .artist { font-size: 13cqh; line-height: 1.15; margin-top: 0.5cqh;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .album { font-size: 8cqh; color: var(--secondary-text-color); margin-top: 0.5cqh;
                 white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 1.2cqw; }
        .album span, .meta span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        ha-icon, .svgicon { --mdc-icon-size: 1.2em; flex: none; vertical-align: middle; }
        .svgicon { display: inline-block; width: 1.2em; height: 1.2em; }
        .svgicon svg { width: 100%; height: 100%; display: block; }
        .bar { position: relative; height: 3cqh; min-height: 6px; border-radius: 2cqh;
               background: var(--divider-color, rgba(128,128,128,0.35)); overflow: hidden; }
        .bar > div { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--primary-color); border-radius: 2cqh; }
        .times { display: flex; justify-content: space-between; font-size: 6.5cqh;
                 color: var(--secondary-text-color); margin-top: 1cqh; font-variant-numeric: tabular-nums; }
        .bottom { display: flex; align-items: center; gap: 2cqw; font-size: 8cqh; margin-top: 1.5cqh; }
        .vol { display: flex; align-items: center; gap: 1.5cqw; flex: 1 1 auto; min-width: 0; }
        .vol .bar { flex: 1 1 auto; height: 2.2cqh; }
        .vol ha-icon { --mdc-icon-size: 9cqh; }
        .vol .vpct { white-space: nowrap; }
        .meta { color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                font-size: 5.8cqh; margin-top: 0.5cqh; display: flex; justify-content: flex-end; align-items: center; gap: 1.2cqw; }
        .eq { flex: none; height: 14cqh; margin: 1cqh 0; display: none; overflow: hidden; }
        .eq canvas { width: 100%; height: 100%; display: block; }
        .debug { position: absolute; left: 1cqw; bottom: 0.5cqh; font-size: 11px; opacity: 0.6;
                 font-family: monospace; display: none; }
      </style>
      <ha-card>
        <div class="debug"></div>
        <div class="row">
          <img class="art" alt="">
          <div class="text">
            <div>
              <div class="title"></div>
              <div class="artist"></div>
              <div class="album"></div>
            </div>
            <div class="eq"><canvas></canvas></div>
            <div>
              <div class="bar"><div class="fill"></div></div>
              <div class="times"><span class="pos">0:00</span><span class="dur">0:00</span></div>
              <div class="bottom">
                <div class="vol"><ha-icon icon="mdi:volume-high"></ha-icon><div class="bar"><div class="vfill"></div></div><span class="vpct"></span></div>
              </div>
              <div class="meta"></div>
            </div>
          </div>
        </div>`;
    this._q = (sel) => root.querySelector(sel);
    if (this._config.height) this.style.height = this._config.height;
    if (window.ResizeObserver) new ResizeObserver(() => this._fitTitle()).observe(this);
  }

  _update() {
    const s = this._hass.states[this._config.entity];
    if (!s) return;
    const a = s.attributes;
    const title = this._q(".title");
    if (title.textContent !== (a.media_title || "")) title.textContent = a.media_title || "";
    this._fitTitle();
    this._q(".artist").textContent = a.media_artist || "";
    const service = a.app_name || "";
    const sIcon = serviceIcon(service);
    this._q(".album").innerHTML = [a.media_album_name ? `<span>${esc(a.media_album_name)}</span>` : "",
                                   sIcon ? iconHtml(sIcon, service) : ""].filter(Boolean).join("<span>·</span>");
    const img = this._q(".art");
    if (a.entity_picture) {
      const url = this._hass.hassUrl(a.entity_picture);
      if (img.getAttribute("src") !== url) img.setAttribute("src", url);
      img.hidden = false;
    } else {
      img.hidden = true;
    }
    const vol = a.volume_level == null ? null : Math.round(a.volume_level * 100);
    this._q(".vfill").style.width = vol == null ? "0%" : `${vol}%`;
    this._q(".vpct").textContent = vol == null ? "" : `${vol} %`;
    this._q(".vol ha-icon").setAttribute("icon", a.is_volume_muted ? "mdi:volume-off" : "mdi:volume-high");
    const known = (id) => {
      const e = id && this._hass.states[id];
      return e && !["unknown", "unavailable", ""].includes(e.state) ? e : null;
    };
    const meta = [];
    const q = known(this._config.quality);
    if (q) {
      const key = `card.now_playing.quality.${q.state}`;
      const word = t(this._hass, key);
      meta.push(`<span>${esc(word === key ? q.state : word)}</span>`);
    }
    const src = known(this._config.source);
    // The source as an icon, with its name only when it is not the streaming service already
    // shown on the album line (e.g. Turntable, Optical 1).
    if (src && !(service && src.state.toLowerCase() === service.toLowerCase())) {
      meta.push(iconHtml(serviceIcon(src.state), src.state) + `<span>${esc(src.state)}</span>`);
    }
    const details = [];
    for (const id of this._config.details || []) {
      const e = known(id);
      if (!e) continue;
      const n = parseFloat(e.state);
      const value = Number.isFinite(n) ? String(Math.round(n * 10) / 10) : e.state;
      details.push(`${value} ${e.attributes.unit_of_measurement || ""}`.trim());
    }
    if (details.length) meta.push(`<span>${esc(details.join(" / "))}</span>`);
    this._q(".meta").innerHTML = meta.join("<span>·</span>");
    if (this._waveRunning && this._waveIdle && s.state === "playing" && !this._waveFrame) {
      this._waveIdle = false;
      this._waveFrame = requestAnimationFrame(this._waveStep);
    }
    if (this._config.debug) {
      const dbg = this._q(".debug"), r = this.getBoundingClientRect();
      dbg.style.display = "block";
      dbg.textContent = `viewport ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio} · card ${Math.round(r.width)}×${Math.round(r.height)}`;
    }
    this._progress();
  }

  // Shrink the title's font until the text fits its box on one line (down to 40 % of the
  // base size, then the ellipsis takes over). Re-run on every update and on resize.
  _fitTitle() {
    const title = this._q(".title");
    title.style.fontSize = "";
    const base = parseFloat(getComputedStyle(title).fontSize);
    const box = title.clientWidth;
    if (!base || !box) return;
    let size = base;
    for (let i = 0; i < 6 && title.scrollWidth > box; i++) {
      size = Math.max(base * 0.4, size * (box / title.scrollWidth) * 0.97);
      title.style.fontSize = `${size}px`;
      if (size <= base * 0.4) break;
    }
    title.style.textOverflow = title.scrollWidth > box ? "ellipsis" : "clip";
  }

  _progress() {
    if (!this._hass || !this._built) return;
    const s = this._hass.states[this._config.entity];
    if (!s) return;
    const a = s.attributes;
    const dur = a.media_duration;
    if (!dur) {
      this._q(".fill").style.width = "0%";
      this._q(".pos").textContent = "";
      this._q(".dur").textContent = "";
      return;
    }
    let pos = a.media_position || 0;
    if (s.state === "playing" && a.media_position_updated_at) {
      pos += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
    }
    pos = Math.min(Math.max(pos, 0), dur);
    this._q(".fill").style.width = `${(100 * pos) / dur}%`;
    this._q(".pos").textContent = mmss(pos);
    this._q(".dur").textContent = mmss(dur);
  }
}

customElements.define("now-playing-card", NowPlayingCard);
