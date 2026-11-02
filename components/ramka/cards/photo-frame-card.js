// Full-screen photo for a wall tablet: the image entity fills the whole viewport, edge to edge,
// with a soft cross-fade when the photo changes. The sections grid keeps its paddings and rounded
// cards, so the picture is drawn as a fixed layer over the page instead, and the card hides
// itself from the grid like a false conditional card.
//
//   type: custom:photo-frame-card
//   entity: image.ramka
//   fade: 1200                      # ms, cross-fade between photos
//   fit: contain                    # contain (whole photo, margins for 1:1 or portrait) or cover
//   blur_background: true           # fill the margins with a blurred copy of the same photo
//   path_entity: input_text.ramka_photo_path   # "<event>/<file>" of the photo on screen
//   index: /local/ramka/index.json  # a JSON file {photos: [{path, event, date, camera, lens,
//                                   # focal, aperture, exposure, iso}]}; shown as a caption in
//                                   # the bottom-left corner, the date in the Home Assistant
//                                   # language (en, de, pl; anything else falls back to en)
//   show_when:                      # the layer is on only while every condition holds; the
//     - entity: input_select.ramka_mode        # same conditions as the section's visibility,
//       state: ambient                         # read here directly, because a hidden section
//     - entity: media_player.living_room       # keeps its cards connected
//       state_not: playing
//     - entity: input_select.ramka_ambient
//       state: photos
//   contained: false                # true (the preview's screen-frame-card): the layer fills the
//                                   # nearest positioned box instead of the page, the card stays
//                                   # in the grid, and it does not take the page's one layer

import { formatDate } from "./lib/i18n.js";

class PhotoFrameCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("photo-frame-card: entity is required");
    this._config = { fade: 1200, fit: "contain", blur_background: true, show_when: [], index: "/local/ramka/index.json", contained: false, ...config };
  }

  getCardSize() {
    return 0;
  }

  getGridOptions() {
    return { columns: "full", rows: 1 };
  }

  set hass(hass) {
    this._hass = hass;
    this._hassAt = Date.now();
    if (!this._layer) this._buildLayer();
    this._claim();
    this._update();
  }

  // Hidden like a false conditional card; the sections grid then takes this element out of the
  // page, so the layer's lifetime is not tied to connected/disconnected callbacks.
  connectedCallback() {
    if (this._config && this._config.contained) {
      this.style.display = "block";
      return;
    }
    this.hidden = true;
    this.dispatchEvent(new Event("card-visibility-changed", { bubbles: true, composed: true }));
  }

  // One layer per page, owned by the instance Home Assistant still feeds with hass. A rebuilt
  // dashboard used to leave the old instance's layer and index timer behind (two layers in the
  // page after one rebuild, 2026-10-16); the new owner removes them here. An orphan gets no
  // hass, so it never takes the page back. An owner that still had hass in the last 10 s is
  // left alone, so two live instances could not pass the layer back and forth.
  _claim() {
    if (this._config.contained) {
      if (this._layer.parentNode !== this) this.appendChild(this._layer);
      if (!this._indexTimer) {
        this._loadIndex();
        this._indexTimer = setInterval(() => this._loadIndex(), 300000);
      }
      return;
    }
    const prev = window.__photoFrameOwner;
    if (prev === this && this._layer.isConnected) return;
    if (prev && prev !== this && prev._layer && prev._layer.isConnected && Date.now() - prev._hassAt < 10000) return;
    if (prev && prev !== this) {
      if (prev._layer) prev._layer.remove();
      clearInterval(prev._indexTimer);
      prev._indexTimer = null;
    }
    window.__photoFrameOwner = this;
    document.body.appendChild(this._layer);
    if (!this._indexTimer) {
      this._loadIndex();
      this._indexTimer = setInterval(() => this._loadIndex(), 300000);
    }
    // Navigation inside the app to another dashboard: the layer must not cover it.
    if (!window.__photoFrameNav) {
      window.__photoFrameNav = true;
      const sync = () => { const owner = window.__photoFrameOwner; if (owner && owner._hass) owner._update(); };
      window.addEventListener("location-changed", sync);
      window.addEventListener("popstate", sync);
    }
  }

  _buildLayer() {
    const layer = document.createElement("div");
    Object.assign(layer.style, {
      position: this._config.contained ? "absolute" : "fixed", inset: "0", zIndex: "9000", background: "#000", display: "none",
    });
    // Two slots that cross-fade; each slot is a blurred, enlarged copy behind the photo itself.
    for (let i = 0; i < 2; i++) {
      const slot = document.createElement("div");
      Object.assign(slot.style, {
        position: "absolute", inset: "0", opacity: "0", transition: `opacity ${this._config.fade}ms ease`, overflow: "hidden",
      });
      if (this._config.blur_background && this._config.fit === "contain") {
        const bg = document.createElement("img");
        bg.className = "bg";
        Object.assign(bg.style, {
          position: "absolute", inset: "-6%", width: "112%", height: "112%", objectFit: "cover",
          filter: "blur(28px) brightness(0.55)",
        });
        slot.appendChild(bg);
      }
      const img = document.createElement("img");
      img.className = "photo";
      Object.assign(img.style, {
        position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: this._config.fit,
      });
      slot.appendChild(img);
      layer.appendChild(slot);
    }
    const caption = document.createElement("div");
    caption.className = "caption";
    Object.assign(caption.style, {
      position: "absolute", left: "1.6vw", bottom: "1.6vw", width: "max-content", maxWidth: "calc(100vw - 3.2vw)",
      color: "#fff", boxSizing: "border-box",
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", borderRadius: "1vw",
      padding: "0.8vw 1.4vw 0.4vw", fontFamily: "inherit", lineHeight: "1.25", display: "none", pointerEvents: "none",
    });
    // One line each, the box grows to the screen's width; only past that an ellipsis.
    const line = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis";
    caption.innerHTML = `<div class="c1" style="font-size: clamp(18px, 2.6vw, 48px); font-weight: 600; ${line}"></div>
      <div class="c2" style="font-size: clamp(13px, 1.6vw, 30px); opacity: 0.85; ${line}"></div>`;
    layer.appendChild(caption);
    this._layer = layer;
    this._front = 0;
    // The dashboard this card belongs to: the first two path segments ("/dashboard-ramka").
    this._base = window.location.pathname.split("/").slice(0, 2).join("/");
  }

  async _loadIndex() {
    if (!this._config.index) return;
    this._indexFetched = Date.now();
    try {
      const r = await fetch(`${this._config.index}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      this._index = {};
      for (const ph of data.photos || []) this._index[ph.path] = ph;
      this._caption();
    } catch (e) {
      console.info("photo-frame-card: index not loaded", e);
    }
  }

  _caption() {
    const cap = this._layer && this._layer.querySelector(".caption");
    if (!cap) return;
    const pathState = this._config.path_entity && this._hass && this._hass.states[this._config.path_entity];
    const path = pathState && pathState.state;
    const ph = path && this._index && this._index[path];
    if (!ph) {
      cap.style.display = "none";
      // A photo this copy of the index does not know: its folder is newer than the copy
      // (the picker rebuilds the index on the server before the photo is shown), or the
      // last fetch failed. Fetch again now, not at the next 5-minute tick, which does not count
      // while the tablet sleeps; at most every 10 s, so a photo that cannot be indexed does not
      // loop.
      if (path && Date.now() - (this._indexFetched || 0) > 10000) this._loadIndex();
      return;
    }
    const d = ph.date ? new Date(ph.date) : null;
    const when = d && !isNaN(d) ? formatDate(this._hass, d, { day: "numeric", month: "long", year: "numeric" }) : "";
    cap.querySelector(".c1").textContent = [ph.event, when].filter(Boolean).join(" · ");
    cap.querySelector(".c2").textContent = [ph.camera, ph.lens, ph.focal, ph.aperture, ph.exposure, ph.iso].filter(Boolean).join(" · ");
    cap.style.display = "block";
  }

  _visible() {
    if (!window.location.pathname.startsWith(this._base)) return false;
    for (const c of this._config.show_when) {
      const s = this._hass.states[c.entity];
      const state = s ? s.state : "unavailable";
      if (c.state !== undefined && state !== c.state) return false;
      if (c.state_not !== undefined && state === c.state_not) return false;
    }
    return true;
  }

  _update() {
    const layer = this._layer;
    if (!this._visible()) {
      layer.style.display = "none";
      return;
    }
    const revealed = layer.style.display === "none";
    layer.style.display = "block";
    const s = this._hass.states[this._config.entity];
    const pic = s && s.state !== "unavailable" && s.attributes.entity_picture;
    // The image entity's picture URL carries a fixed token, so two photos in a row look like
    // the same URL; the entity's state is its last-updated time, which does change.
    const url = pic ? this._hass.hassUrl(pic) + (pic.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(s.state) : null;
    const slots = layer.children;
    const current = slots[this._front];
    // Shown again with the last photo of the previous series in front: the loop sets the new
    // photo and the page in the same breath, so the old one stood there while the new one loaded
    // and then cross-faded out of it (2026-10-17). Drop it at once; the new one fades in from black.
    if (revealed && current.dataset.url !== url) {
      current.style.transition = "none";
      current.style.opacity = "0";
      void current.offsetWidth;
      current.style.transition = `opacity ${this._config.fade}ms ease`;
      delete current.dataset.url;
    }
    if (!url || current.dataset.url === url) return;
    const next = slots[1 - this._front];
    next.dataset.url = url;
    const photo = next.querySelector(".photo"), bg = next.querySelector(".bg");
    photo.onload = () => {
      next.style.opacity = "1";
      current.style.opacity = "0";
      this._front = 1 - this._front;
    };
    if (bg) bg.src = url;
    photo.src = url;
    this._caption();
  }
}

customElements.define("photo-frame-card", PhotoFrameCard);
