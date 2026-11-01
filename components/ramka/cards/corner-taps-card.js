// Two invisible tap targets in the top corners of the screen, the way out of the kiosk
// dashboard once the Companion app is pinned: the kiosk user has no sidebar there, and app
// pinning takes the Android buttons away. Optionally a third in the bottom-right corner that
// pauses and resumes the rotation (SPEC-026), and the tap and swipe gestures of the whole screen.
//
//   type: custom:corner-taps-card
//   left: /lovelace/0                       # tap the top-left corner: the Overview, with the sidebar
//   right: /dashboard-ramka/ramka?disable_km   # top-right: this dashboard with kiosk-mode off
//   size: 72                                # px, square, default 72
//   padding: 8                              # px, optional: the sections view's outer padding
//                                           # and its gaps, all set to this (HA's own are 32 px
//                                           # at the sides, 24 px top and between rows)
//   tap:                                    # optional: a tap anywhere else on the screen
//     entity: input_select.ramka_mode
//     states: [ambient, controls]           # ... while this entity is in one of these states
//     script: script.ramka_show_controls   # ... runs this script (shows / keeps the controls)
//     shows: controls                       # optional: the state the script leads to. A tap made
//                                           # while the entity is in another state lays a clear
//                                           # shield over the screen, so the same touch cannot
//                                           # land on a card the new page draws under the finger;
//     shield_ms: 700                        # it lifts this long after the entity reaches `shows`
//                                           # (or after 3 s at the most)
//   swipe:                                  # optional: a swipe (80 px or more, under 1.5 s,
//     - conditions:                         # 1.5 times more along its direction than across)
//         - entity: input_select.ramka_mode   # anywhere; a list of rules, the first whose
//           states: [controls]              # conditions all hold wins (one rule may also be
//                                           # given on its own)
//       up: script.ramka_swipe_up   # ... finger moved up: this script
//       down: script.ramka_swipe_down   # ... finger moved down: this one (each is optional)
//     - conditions: [{entity: input_select.ramka_mode, states: [ambient]}]
//       up: script.ramka_ambient_next
//       left: script.ramka_view_next    # ... finger moved to the left
//       right: script.ramka_view_prev   # ... finger moved to the right
//   pause:                                  # optional: a target in the bottom-right corner,
//     entity: input_boolean.ramka_paused    # there while the conditions hold; a tap runs `resume`
//     conditions: [{entity: input_select.ramka_mode, states: [ambient]}]   # while the entity is
//     pause: script.ramka_pause             # on (a play button shows then), else `pause`. Never
//     resume: script.ramka_resume           # a tap anywhere. Size: `size`.
//   reload: input_button.ramka_reload   # optional: a press reloads this page in place
//                                           # (after a deploy). The Companion app's
//                                           # command_webview would open a new hidden copy of
//                                           # the app instead, on every call.
//
// The targets are appended to document.body (fixed position, above everything); the card
// itself hides like a false conditional card, so the grid gives it no row. Navigation is a full
// page load inside the app's WebView (pushState + reload), which is what kiosk-mode needs to
// read ?disable_km.
//
// The document listeners and the corner targets exist once per page, not per card instance,
// and act only while the page is on the dashboard the card was first seen on. Home Assistant
// builds a new instance whenever it rebuilds the dashboard, and takes the hidden card out of
// the page while its connectedCallback is still running, so disconnectedCallback came first
// and the listeners added after it were never removed: each rebuild left one more listener
// (2026-10-16: every tap ran show_controls twice, and an orphan whose hass no longer updated
// sent the controls back to ambient). The handlers now work through the instance that
// Home Assistant still feeds with hass; an orphan gets no hass and drops out by itself.

function cornerTapsPage() {
  return (window.__cornerTapsPage ??= { card: null, installed: false, base: null, els: [], pause: null });
}

// The play button: a dimmed circle with a triangle, small enough not to spoil a photo.
const PLAY = `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
  <circle cx="20" cy="20" r="20" fill="rgba(0,0,0,0.45)"/><path d="M16 12v16l13-8z" fill="rgba(255,255,255,0.85)"/></svg>`;

class CornerTapsCard extends HTMLElement {
  setConfig(config) {
    this._config = { size: 72, ...config };
  }

  // Finds the sections view this card lives in and gives it one tight padding everywhere. The
  // view re-renders on navigation, so this runs on every connect and retries until the view
  // exists.
  _tighten() {
    if (this._config.padding == null) return;
    const px = `${this._config.padding}px`;
    const find = () => {
      try {
        return document.querySelector("home-assistant").shadowRoot.querySelector("home-assistant-main").shadowRoot
          .querySelector("ha-panel-lovelace").shadowRoot.querySelector("hui-root").shadowRoot.querySelector("hui-sections-view");
      } catch (e) { return null; }
    };
    let tries = 0;
    const apply = () => {
      const view = find();
      if (!view || !view.shadowRoot) { if (tries++ < 20) setTimeout(apply, 250); return; }
      if (view.shadowRoot.querySelector("#ramka-tight")) return;
      const style = document.createElement("style");
      style.id = "ramka-tight";
      style.textContent = `.wrapper { padding: 0 ${px} !important; max-width: none !important; }
        .container { padding: ${px} 0 !important; row-gap: ${px} !important; column-gap: ${px} !important; }
        .content { row-gap: ${px} !important; column-gap: ${px} !important; }`;
      view.shadowRoot.appendChild(style);
    };
    apply();
  }

  getCardSize() {
    return 0;
  }

  getGridOptions() {
    return { columns: "full", rows: 1 };
  }

  set hass(hass) {
    this._hass = hass;
    cornerTapsPage().card = this;
    this._install();
    this._syncPause();
    this._maybeLiftShield();
    this._maybeReload();
  }

  // Once per page: the tap, swipe and corner handlers, each passing the event to the live
  // instance. The dashboard is the first two path segments ("/dashboard-ramka").
  _install() {
    const page = cornerTapsPage();
    if (page.installed) return;
    page.installed = true;
    page.base = window.location.pathname.split("/").slice(0, 2).join("/");
    const onBoard = () => window.location.pathname.startsWith(page.base);
    const live = (fn) => (ev) => { if (page.card && onBoard()) fn(page.card, ev); };
    const c = this._config;
    if (c.tap) document.addEventListener("click", live((card, ev) => card._onTap(ev)), true);
    if (c.swipe) {
      for (const [type, fn] of [
        ["touchstart", (card, ev) => card._onTouchStart(ev)], ["touchend", (card, ev) => card._onTouchEnd(ev)],
        ["pointerdown", (card, ev) => card._onPointerDown(ev)], ["pointerup", (card, ev) => card._onPointerUp(ev)],
      ]) document.addEventListener(type, live(fn), { capture: true, passive: true });
    }
    for (const side of ["left", "right"]) {
      if (!c[side]) continue;
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed", top: "0", [side]: "0", width: `${c.size}px`, height: `${c.size}px`,
        zIndex: "9999", background: "transparent", touchAction: "manipulation",
      });
      // Not location.assign: the Companion app treats that as an external link and opens the
      // system browser. pushState keeps it inside the WebView; the reload makes it a full load,
      // which kiosk-mode needs to read ?disable_km.
      el.addEventListener("click", () => {
        window.history.pushState(null, "", page.card._config[side]);
        window.location.reload();
      });
      document.body.appendChild(el);
      page.els.push(el);
    }
    if (c.pause) {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed", bottom: "0", right: "0", width: `${c.size}px`, height: `${c.size}px`,
        zIndex: "9999", background: "transparent", touchAction: "manipulation", display: "none",
        alignItems: "center", justifyContent: "center",
      });
      el.innerHTML = PLAY;
      el.firstElementChild.style.visibility = "hidden";
      el.addEventListener("click", () => { if (page.card && onBoard()) page.card._onPause(); });
      document.body.appendChild(el);
      page.els.push(el);
      page.pause = el;
    }
    // Off this dashboard (navigation inside the app) the corners must not cover anything.
    const sync = () => {
      for (const el of page.els) el.style.display = onBoard() ? "block" : "none";
      if (page.card) page.card._syncPause();
    };
    window.addEventListener("location-changed", sync);
    window.addEventListener("popstate", sync);
  }

  // The reload button's state when this page loaded is the baseline (kept on window, so every
  // instance on the page shares it); a later, different state is a press. unknown and
  // unavailable never count, so a reconnect or a restart of Home Assistant reloads nothing.
  _maybeReload() {
    const id = this._config.reload;
    if (!id) return;
    const s = this._hass.states[id];
    const state = s ? s.state : undefined;
    if (!("__cornerTapsReloadSeen" in window)) {
      window.__cornerTapsReloadSeen = state;
      return;
    }
    if (!state || state === "unknown" || state === "unavailable" || state === window.__cornerTapsReloadSeen) return;
    window.__cornerTapsReloadSeen = state;
    window.location.reload();
  }

  // All of a rule's conditions hold: {entity, states} pairs, or the rule's own entity/states.
  _holds(rule) {
    if (!rule || !this._hass) return false;
    const conds = rule.conditions || [{ entity: rule.entity, states: rule.states }];
    return conds.every((c) => {
      const state = this._hass.states[c.entity];
      return state && (c.states || []).map(String).includes(state.state);
    });
  }

  // The pause target is there only while its conditions hold (the rotation shows), so it covers
  // nothing on the controls; the play button shows while paused.
  _syncPause() {
    const page = cornerTapsPage();
    const el = page.pause;
    const pause = this._config.pause;
    if (!el || !pause || !this._hass) return;
    const here = window.location.pathname.startsWith(page.base) && this._holds({ conditions: pause.conditions || [] });
    el.style.display = here ? "flex" : "none";
    el.firstElementChild.style.visibility = this._paused() ? "visible" : "hidden";
  }

  _paused() {
    const s = this._hass && this._hass.states[this._config.pause.entity];
    return !!s && s.state === "on";
  }

  _onPause() {
    const pause = this._config.pause;
    if (!pause || !this._hass) return;
    const script = this._paused() ? pause.resume : pause.pause;
    if (!script) return;
    const [domain, name] = script.split(".");
    this._hass.callService(domain, name, {});
  }

  _runWhen(rule, script) {
    if (!script || !this._holds(rule)) return false;
    const [domain, name] = script.split(".");
    this._hass.callService(domain, name, {});
    return true;
  }

  // A swipe: down and up within 1.5 s, 80 px or more apart along one axis and 1.5 times more
  // along it than across; vertical runs up / down, horizontal left / right. Touch events, not pointer events: in the Companion app's WebView a vertical drag
  // becomes a scroll gesture and ends in pointercancel, never pointerup (2026-10-15), while
  // touchend still arrives. Pointer events stay for a mouse; a touch that already counted
  // makes the pointer pair that follows it ignored.
  _swipeBegin(x, y) {
    this._swipeStart = { x, y, t: Date.now() };
  }

  _swipeEnd(x, y) {
    const s = this._swipeStart;
    this._swipeStart = null;
    if (!s || Date.now() - s.t > 1500 || Date.now() - (this._swiped || 0) < 1000) return;
    const dx = x - s.x, dy = y - s.y;
    let dir;
    if (Math.abs(dy) >= 80 && Math.abs(dy) >= 1.5 * Math.abs(dx)) dir = dy < 0 ? "up" : "down";
    else if (Math.abs(dx) >= 80 && Math.abs(dx) >= 1.5 * Math.abs(dy)) dir = dx < 0 ? "left" : "right";
    else return;
    const rules = Array.isArray(this._config.swipe) ? this._config.swipe : [this._config.swipe];
    const rule = rules.find((r) => this._holds(r));
    if (rule && this._runWhen(rule, rule[dir])) this._swiped = Date.now();
  }

  _onTouchStart(ev) {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (t) this._swipeBegin(t.clientX, t.clientY);
  }

  _onTouchEnd(ev) {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (t) this._swipeEnd(t.clientX, t.clientY);
  }

  _onPointerDown(ev) {
    if (ev.pointerType !== "touch") this._swipeBegin(ev.clientX, ev.clientY);
  }

  _onPointerUp(ev) {
    if (ev.pointerType !== "touch") this._swipeEnd(ev.clientX, ev.clientY);
  }

  // A tap (or click) anywhere on the page. Listened to on the document in the capture phase,
  // so taps inside other cards' shadow roots count too; the corner targets (and the play button
  // inside one) are left alone.
  _onTap(ev) {
    const tap = this._config.tap;
    if (!tap || !this._hass || cornerTapsPage().els.some((el) => el.contains(ev.target))) return;
    // An element marked data-own-tap handles its own taps (the floor plan's layer chips): a tap on it
    // is not a tap on the page. composedPath reaches into open shadow roots, where cards draw.
    if ((ev.composedPath?.() || []).some((n) => n.hasAttribute?.("data-own-tap"))) return;
    const now = Date.now();
    if (now - (this._lastTap || 0) < 1000 || now - (this._swiped || 0) < 1000) return;  // once a second; never right after a swipe
    this._lastTap = now;
    const state = this._hass.states[tap.entity];
    if (tap.shows && state && state.state !== tap.shows && this._holds(tap)) this._raiseShield();
    this._runWhen(tap, tap.script);
  }

  // A transparent layer over everything but the corner targets that swallows the rest of the
  // touch that opened the controls: on 2026-10-16 a tap on the ambient page went on to switch
  // whatever tile the controls drew under the finger. Lifted shield_ms after the entity
  // reports the target state, so the page has settled; 3 s at the most if it never does.
  _raiseShield() {
    if (this._shield) return;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", inset: "0", zIndex: "9998", background: "transparent" });
    const swallow = (ev) => { ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); };
    for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"]) {
      el.addEventListener(type, swallow, { capture: true, passive: false });
    }
    document.body.appendChild(el);
    this._shield = el;
    this._shieldMax = setTimeout(() => this._lowerShield(), 3000);
  }

  _maybeLiftShield() {
    const tap = this._config && this._config.tap;
    if (!this._shield || this._shieldLifting || !tap || !this._hass) return;
    const state = this._hass.states[tap.entity];
    if (!state || state.state !== tap.shows) return;
    this._shieldLifting = setTimeout(() => this._lowerShield(), tap.shield_ms ?? 700);
  }

  _lowerShield() {
    clearTimeout(this._shieldMax);
    clearTimeout(this._shieldLifting);
    this._shieldLifting = null;
    if (this._shield) this._shield.remove();
    this._shield = null;
  }

  connectedCallback() {
    // Hidden like a conditional card whose condition is false: the sections grid then drops
    // the wrapper entirely instead of keeping an empty row for it (and takes this element out
    // of the page; the listeners live in _install, not here).
    this.hidden = true;
    this.dispatchEvent(new Event("card-visibility-changed", { bubbles: true, composed: true }));
    this._tighten();
  }

  disconnectedCallback() {
    this._lowerShield();
  }
}

customElements.define("corner-taps-card", CornerTapsCard);
