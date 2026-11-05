// custom:pocket-app, the whole phone view: the shell around the pages. It sits alone in a
// `panel: true` view (Home Assistant's header stays above it) and draws
//   - the page of the current route (lib/router.js: #/, #/areas, #/area/<id>, #/climate, #/media,
//     #/power, #/plants, #/settings, #/floorplan), taken from pages/index.js, which also states the
//     page contract; the first version's #/rooms and #/room/<id> are replaced by their new hash;
//   - a bottom bar fixed to the bottom of the screen: Home, the person's chosen pages (their
//     settings, lib/settings.js, read once from Home Assistant; the home's defaults until then,
//     lib/router.js defaultBar) and
//     Settings, at most five;
//   - the colours of the person's Appearance (lib/theme.js): System follows the phone's
//     prefers-color-scheme, and a change of it repaints at once;
//   - a thin banner while Home Assistant is not connected (pages then get ctx.offline = true);
//   - a short toast above the bar when an action fails: a page or tile fires pocket-error with a
//     translation key (lib/report.js), the shell shows its text for TOAST_MS;
//   - snappy controls: one optimistic store (lib/optimistic.js) for every page; pages get hass
//     with the states their controls expect over the reported ones (ctx.hass) and the store
//     (ctx.optimistic); a send or a rollback redraws the page, each hass drops what it reports;
//   - one bottom sheet over the page and the bar (lib/sheet.js): a page opens it with
//     ctx.openSheet(spec), its content chosen by spec.kind (SHEETS: "trend", lib/trend-sheet.js;
//     "checks", "air", "lights", lib/detail-sheets.js; "forecast", lib/weather.js; "layers", the
//     floor plan's layer chips, lib/layer-sheet.js; "players", Media's player picker,
//     lib/player-sheet.js; "power", the meters behind the Power page's Now, pages/power-page.js), closed again with ctx.closeSheet(); the content is
//     updated with the page, and a new route closes it. Back closes it first. A route taken while a sheet is open takes the
//     place of the sheet's history entry, and a sheet's entry left behind (a reload, a return to
//     the dashboard) is cleared, so Back never stops at a sheet that is no longer there.
// Navigation sets location.hash: no reload, and the browser's back button returns.
//
//   type: custom:pocket-app
//   lang: en                 # the dashboard's language; Home Assistant's when missing
//   rooms: [{id, name, area, lights?, scenes?, climate?, air?, media?}]
//   outside: ...             # optional; with weather, the Outside pseudo-area (lib/areas.js)
//   weather: weather.home    # optional
//   thresholds: {rooms: {<id>: {temp_low, temp_high, ...}}, outside: {...}, air: {<reading>: {fair, poor}}}
//   floorplan: true          # optional: the home has the floorplan component (its card, floorplan-card,
//                            # on the area pages and the floor plan view; the bar may offer the view)
//   plants: true             # optional: the home has the plants component; Plants is on the default bar
//   sound: {level, offset?, averages?}   # optional: the home has audio-sensor; Media's Sound tab
//                            # (lib/sound-panel.js, its card room-meter-card)

import { createT, language } from "./lib/i18n.js";
import { barTabs, defaultBar, legacyRoute, optionalPages, parseRoute, tabOf } from "./lib/router.js";
import { areasOf } from "./lib/areas.js";
import { readSettings, saveSettings, withDefaults } from "./lib/settings.js";
import { setText } from "./lib/page-kit.js";
import { applyTheme } from "./lib/theme.js";
import { createOptimistic } from "./lib/optimistic.js";
import { SHEET_STYLE, createSheet } from "./lib/sheet.js";
import * as trendSheet from "./lib/trend-sheet.js";
import { checks, air, lights } from "./lib/detail-sheets.js";
import { forecastSheet } from "./lib/weather.js";
import * as layerSheet from "./lib/layer-sheet.js";
import * as playerSheet from "./lib/player-sheet.js";
import * as sourceSheet from "./lib/source-sheet.js";
import * as sceneSheet from "./lib/scene-sheet.js";
import { powerSheet } from "./pages/power-page.js";
import { forgetPlan } from "./lib/plan-cache.js";
import { pages } from "./pages/index.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const translate = createT({ en, de, pl });
const TOAST_MS = 3000;

// The sheets a page can open, by spec.kind; each on the page contract with the spec as well:
// render(ctx, spec) -> HTMLElement, update(el, ctx).
const SHEETS = { trend: trendSheet, checks, air, lights, forecast: forecastSheet, layers: layerSheet,
  players: playerSheet, power: powerSheet, sources: sourceSheet, scenes: sceneSheet };

const STYLE = `
  :host { display: block; }
  /* No horizontal scroll anywhere: nothing in the app is wider than the screen (clip, not hidden:
     no scroll container, so the page's vertical scroll and HA's pull-to-refresh stay HA's), and
     no sideways scroller inside it hands its overscroll on to the page. */
  .app { --bar: 64px; --safe: env(safe-area-inset-bottom, 0px);
         box-sizing: border-box; min-height: 100vh;
         /* The view sits under HA's header; dvh follows the phone's collapsing browser bars. */
         min-height: calc(100dvh - var(--kiosk-header-height, var(--header-height, 56px)) - env(safe-area-inset-top, 0px));
         overflow-x: clip; overscroll-behavior: none;
         background: var(--bg); color: var(--fg);
         font-family: -apple-system, "SF Pro Text", Roboto, system-ui, sans-serif; font-weight: 400;
         -webkit-font-smoothing: antialiased; }
  .app * { overscroll-behavior-x: none; }
  .offline { background: var(--warn); color: var(--on-warn); font-size: 12.5px; text-align: center;
             padding: 6px 16px; }
  .offline[hidden] { display: none; }
  /* Room under the page for the fixed bar and the phone's home indicator. A finger moves the page
     only up and down (pinch zoom stays); the pages' own sideways gestures handle themselves. */
  main { padding: 12px 16px calc(var(--bar) + var(--safe) + 16px); touch-action: pan-y pinch-zoom;
         padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .headless main { padding-top: max(12px, calc(env(safe-area-inset-top, 0px) + 4px)); }
  .ha-menu { position: absolute; left: -6px; top: 50%; transform: translateY(-50%); width: 44px; height: 44px;
             margin: 0; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--fg); cursor: pointer;
             display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px;
             -webkit-tap-highlight-color: transparent; }
  .ha-menu:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  /* The toast rides on the bar: absolute inside the fixed nav, just above its top edge. */
  .toast { position: absolute; left: 16px; right: 16px; bottom: calc(100% + 8px); box-sizing: border-box;
           padding: 12px 16px; border-radius: 14px; font-size: 16px; line-height: 1.3;
           background: var(--fg); color: var(--bg); box-shadow: 0 4px 16px rgba(0, 0, 0, .18); }
  /* Hidden visually, not display:none: the role=alert element must stay in the layout for screen
     readers to announce its text when it changes. */
  .toast:not(.show) { opacity: 0; pointer-events: none; }
  /* Fixed to the screen, not sticky in the card: a sticky bar drifted with iOS's rubber-band
     scroll and with sideways drags. It spans the card's own box (--bar-left, --bar-width:
     _placeBar measures it), so beside HA's sidebar (a phone in landscape, a wide screen) it starts
     where the sidebar ends; HA sets no variable for that width. Its background runs to the very
     bottom: the safe area is padding inside it, and the phone's side insets in landscape too. */
  nav { position: fixed; left: var(--bar-left, 0px); width: var(--bar-width, 100%); bottom: 0; z-index: 4;
        box-sizing: border-box; height: calc(var(--bar) + var(--safe)); padding-bottom: var(--safe);
        padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px);
        display: flex; justify-content: space-around; align-items: stretch;
        touch-action: none; overscroll-behavior: none;
        background: var(--card);
        background: color-mix(in srgb, var(--card) 92%, transparent);
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        border-top: 1px solid var(--line); }
  .tab { flex: 1 1 0; min-width: 44px; min-height: 44px; margin: 0; padding: 6px 0 4px;
         border: 0; background: none; color: var(--mut); font: inherit; font-size: 11.5px;
         display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
         cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .tab ha-icon { --mdc-icon-size: 24px; }
  .tab.active { color: var(--acc); }
  .tab:focus-visible { outline: 2px solid var(--acc); outline-offset: -4px; border-radius: 12px; }
${SHEET_STYLE}
`;

class PocketApp extends HTMLElement {
  constructor() {
    super();
    this._onHash = () => this._route();
    this._onScheme = () => this._paint();
    this._onPop = () => this._sheet?.onPopState();
    this._onResize = () => this._placeBar();
    this.toastMs = TOAST_MS;
    this._settings = withDefaults({});
    this._saveQueue = Promise.resolve();
    this._savesApplied = 0;
    // A failure or a silence after the page that sent it has gone: the toast still shows.
    this._optimistic = createOptimistic({ report: (_el, key) => this._showToast(key) });
    this._optimistic.onChange = () => this._route();
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("pocket-app: a config is required");
    this._config = { ...config, rooms: Array.isArray(config.rooms) ? config.rooms : [] };
    // Until the person's settings are read, the home's default bar (Plants with plants).
    if (!this._settingsRead) this._settings = withDefaults({}, defaultBar(this._config));
    if (this._root) {
      this._key = null;   // a new config (the editor, a reload of the dashboard) renders the page anew
      this._route();
    }
  }

  set hass(hass) {
    this._hass = hass;
    // Offline: the floor plan is read again after the reconnect (lib/plan-cache.js).
    if (hass?.connected === false) forgetPlan();
    this._optimistic.update(hass);
    if (!this._root) this._build();
    const retry = this._settingsRetry && hass?.connected !== false;
    if (!this._settingsAsked || retry) this._loadSettings(hass);
    this._refresh();
  }

  // Reads the settings once. A read that fails while Home Assistant is not connected is tried
  // again with the next hass that is. A read that lands after a save has been applied is older
  // than what the bar shows, and is dropped.
  _loadSettings(hass) {
    this._settingsAsked = true;
    this._settingsRetry = false;
    const saves = this._savesApplied;
    readSettings(hass, defaultBar(this._config)).then(
      (settings) => {
        this._settingsRead = true;
        if (this._savesApplied === saves) this._applySettings(settings);
      },
      () => { if (hass?.connected === false) this._settingsRetry = true; });
  }

  // Saves run one after another (each reads, merges and writes), so two saves never interleave
  // and lose a field; a failed save does not stop the next one.
  _saveSettings(patch) {
    const run = this._saveQueue.then(() => saveSettings(this._hass, patch, defaultBar(this._config))).then((settings) => {
      this._savesApplied += 1;
      this._settingsRead = true;
      return this._applySettings(settings);
    });
    this._saveQueue = run.catch(() => {});
    return run;
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 12;
  }

  connectedCallback() {
    window.addEventListener("hashchange", this._onHash);
    window.addEventListener("resize", this._onResize);
    if (typeof ResizeObserver === "function") {
      this._resize ??= new ResizeObserver(this._onResize);
      this._resize.observe(this);
    }
    this._placeBar();
    window.addEventListener("popstate", this._onPop);
    this._scheme = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    this._scheme?.addEventListener?.("change", this._onScheme);
    this._sheet?.clearStale();
    if (this._root) this._paint();
    if (this._root) this._route();   // the hash may have changed while the card was away
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    window.removeEventListener("resize", this._onResize);
    this._resize?.disconnect();
    window.removeEventListener("popstate", this._onPop);
    this._sheet?.dismiss();
    this._scheme?.removeEventListener?.("change", this._onScheme);
  }

  // The fixed bar over the card's own box: left and width in the viewport (HA's sidebar, when it
  // stands beside the view, moves the box). An unmeasured box (0 wide) keeps the last values.
  _placeBar() {
    const box = this.getBoundingClientRect?.();
    if (!box || !(box.width > 0)) return;
    const left = `${Math.round(box.left)}px`;
    const width = `${Math.round(box.width)}px`;
    if (this.style.getPropertyValue("--bar-left") !== left) this.style.setProperty("--bar-left", left);
    if (this.style.getPropertyValue("--bar-width") !== width) this.style.setProperty("--bar-width", width);
    // Without HA's header above it (kiosk-mode hides it on a phone) the card starts at the top of
    // the screen: the page then keeps clear of the status bar and the notch itself.
    const headless = box.top + (window.scrollY || 0) < 8;
    this._app?.classList.toggle("headless", headless);
  }

  // The menu button left of a page's title (its first .top row): it opens Home Assistant's own
  // sidebar (the hass-toggle-menu event, as HA's header button does), so HA's menu is at hand
  // where kiosk-mode hides the header; elsewhere it is there too, for one behaviour everywhere.
  _addMenu(pageEl) {
    const top = pageEl?.querySelector?.(".top");
    if (!top || top.querySelector(":scope > .ha-menu")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ha-menu";
    button.innerHTML = `<ha-icon icon="mdi:menu"></ha-icon>`;
    button.setAttribute("aria-label", this._t("card.pocket.menu"));
    button.addEventListener("click", () =>
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })));
    // Inline: it wins over every page's own .top padding, whatever its selector.
    top.style.position = "relative";
    top.style.paddingLeft = "44px";
    top.prepend(button);
  }

  // The language of every word: the dashboard's (config.lang), else Home Assistant's.
  _lang() {
    return this._config?.lang || language(this._hass);
  }

  _t(key, vars) {
    return translate({ locale: { language: this._lang() } }, key, vars);
  }

  // The page contract's ctx (pages/index.js), built fresh for each render and update.
  _ctx() {
    return {
      hass: this._optimistic.view(this._hass),
      optimistic: this._optimistic,
      config: this._config,
      t: (key, vars) => this._t(key, vars),
      navigate: (route, options) => this._navigate(route, options),
      lang: this._lang(),
      offline: this._hass?.connected === false,
      routeId: this._current?.id,
      settings: this._settings,
      saveSettings: (patch) => this._saveSettings(patch),
      openSheet: (spec, options) => this._openSheet(spec, options),
      closeSheet: () => { if (this._sheet?.isOpen) this._sheet.close(); },
    };
  }

  // The person's settings, read or just saved: the bar follows them.
  _applySettings(settings) {
    this._settings = settings;
    if (this._root) {
      this._paint();
      this._renderBar();
      // The page shows them too (Settings): an update of the page in place, never a new one, so a
      // save does not rebuild the page under the finger.
      if (this.isConnected && this._page && this._pageEl) this._page.update(this._pageEl, this._ctx());
    }
    return settings;
  }

  _build() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>${STYLE}</style>
      <div class="app">
        <div class="offline" role="status" hidden></div>
        <main></main>
        <nav>
          <div class="toast" role="alert"></div>
        </nav>
      </div>`;
    this._app = this._root.querySelector(".app");
    this._main = this._root.querySelector("main");
    this._banner = this._root.querySelector(".offline");
    this._toast = this._root.querySelector(".toast");
    this._nav = this._root.querySelector("nav");
    this._app.addEventListener("pocket-error", (e) => this._showToast(e.detail?.key));
    this._sheet = createSheet(this._app, { t: (key, vars) => this._t(key, vars) });
    this._sheet.clearStale();   // a reload while a sheet was open
    this._sheet.onRestore = (content) => this._updateSheet(content);
    this._tabs = [];
  }

  // A #/area/<id> whose id is none of the areas (lib/areas.js: the rooms and the Outside).
  _unknownArea(route) {
    return route.page === "area" && !areasOf(this._config).some((area) => area.id === route.id);
  }

  // options.replace: the route takes the place of the current history entry (area-to-area swipes,
  // so Back returns to Areas rather than through every area).
  _navigate(route, { replace = false } = {}) {
    route = legacyRoute(route) ?? route;
    if (this._unknownArea(parseRoute(route))) route = "#/areas";
    // From an open sheet: the route takes the sheet's entry, so Back goes to the page under it.
    if (this._sheet?.ownsEntry()) replace = true;
    if (replace && window.location.hash !== route) {
      window.history.replaceState(window.history.state, "", route);
      this._route();
      return;
    }
    // Setting the hash fires hashchange later; routing now keeps the tap instant, and the later
    // event finds the page already in place (an update, not a new page).
    if (window.location.hash !== route) window.location.hash = route;
    this._route();
  }

  // Shows the page of location.hash: a new element when the route changed, else an update.
  _route() {
    if (!this._root || !this._config) return;
    // A link of the first version (#/rooms, #/room/<id>): its new hash, in place of the old entry.
    const legacy = legacyRoute(window.location.hash);
    if (legacy) window.history.replaceState(window.history.state, "", legacy);
    let route = parseRoute(window.location.hash);
    if (this._unknownArea(route)) {
      // An area this dashboard does not have (an old link, a removed room): Areas instead, in place
      // of the bad entry so back does not return to it. Pages never see an unknown routeId.
      window.history.replaceState(window.history.state, "", "#/areas");
      route = parseRoute("#/areas");
    }
    const key = `${route.page}/${route.id ?? ""}`;
    this._current = route;
    if (key !== this._key) {
      this._key = key;
      this._page = pages[route.page];
      this._pageEl = this._page.render(this._ctx());
      this._sheet.dismiss();
      this._main.replaceChildren(this._pageEl);
      this._addMenu(this._pageEl);
      this._renderBar();
      return;
    }
    if (this._barLang !== this._lang()) this._renderBar();
    const ctx = this._ctx();
    this._page.update(this._pageEl, ctx);
    if (this._sheet.isOpen) this._updateSheet(this._sheet.content, ctx);
  }

  // A page's ctx.openSheet(spec, {stack?}): the sheet of spec.kind, in place of any open one, or
  // with stack on top of it (Back returns to it). False for a kind the shell does not know.
  _openSheet(spec, { stack = false } = {}) {
    const kind = SHEETS[spec?.kind];
    if (!kind || !this._sheet) return false;
    const content = kind.render(this._ctx(), spec);
    content._sheetKind = kind;
    this._sheet.open(content, spec.title, { stack });
    return true;
  }

  // The shown sheet's content, patched by its own kind (a stacked sheet that comes back too).
  _updateSheet(content, ctx = this._ctx()) {
    content?._sheetKind?.update(content, ctx);
  }

  // The bar's buttons are rebuilt only when the person's choice of pages changes.
  _renderBar() {
    const tabs = barTabs(this._settings?.bar ?? defaultBar(this._config), { without: optionalPages(this._config) });
    const ids = tabs.map((tab) => tab.page).join(" ");
    if (ids !== this._barIds) {
      this._barIds = ids;
      this._tabs = tabs.map((tab) => {
        const button = document.createElement("button");
        button.className = "tab";
        button.type = "button";
        button.dataset.page = tab.page;
        button.innerHTML = `<ha-icon icon="${tab.icon}"></ha-icon><span class="label"></span>`;
        button.addEventListener("click", () => this._navigate(tab.route));
        return button;
      });
      this._nav.replaceChildren(this._toast, ...this._tabs);
    }
    const active = tabOf(this._current?.page, tabs.map((tab) => tab.page));
    this._barLang = this._lang();
    tabs.forEach((tab, i) => {
      const button = this._tabs[i];
      const label = this._t(`card.pocket.nav.${tab.page}`);
      button.querySelector(".label").textContent = label;
      button.setAttribute("aria-label", label);
      button.classList.toggle("active", tab.page === active);
      if (tab.page === active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  _showToast(key) {
    if (!key) return;
    this._toast.textContent = this._t(key);
    this._toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast.classList.remove("show");
      this._toast.textContent = "";
    }, this.toastMs);
  }

  // The person's Appearance over the phone's scheme (read now: the card may be built before it is
  // connected) and Home Assistant's theme.
  _paint() {
    const scheme = this._scheme ?? window.matchMedia?.("(prefers-color-scheme: dark)");
    applyTheme(this._app, this._hass, { mode: this._settings?.theme, systemDark: scheme?.matches === true });
  }

  _refresh() {
    this._paint();
    const offline = this._hass?.connected === false;
    this._banner.hidden = !offline;
    setText(this._banner, offline ? this._t("card.pocket.offline") : "");
    this._app.classList.toggle("is-offline", offline);
    this._route();
  }
}

if (!customElements.get("pocket-app")) customElements.define("pocket-app", PocketApp);
