// custom:pocket-app, the whole phone view: the shell around the pages. It sits alone in a
// `panel: true` view (Home Assistant's header stays above it) and draws
//   - the page of the current route (lib/router.js: #/, #/rooms, #/room/<id>, #/media, #/settings),
//     taken from pages/index.js, which also states the page contract;
//   - a bottom bar, Home · Rooms · Media · Settings, fixed at the bottom over the phone's safe area;
//   - a thin banner while Home Assistant is not connected (pages then get ctx.offline = true).
// Navigation sets location.hash: no reload, and the browser's back button returns.
//
//   type: custom:pocket-app
//   lang: en                 # the dashboard's language; Home Assistant's when missing
//   rooms: [{id, name, lights?, scenes?, climate?, air?, media?}]
//   outside: ...             # optional
//   weather: weather.home    # optional
//   thresholds: {rooms: {<id>: {temp_low, temp_high, ...}}, air: {<reading>: {fair, poor}}}

import { createT, language } from "./lib/i18n.js";
import { TABS, parseRoute, tabOf } from "./lib/router.js";
import { applyTheme } from "./lib/theme.js";
import { pages } from "./pages/index.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const translate = createT({ en, de, pl });

const STYLE = `
  :host { display: block; height: 100%; }
  .app { --bar: 64px; --safe: env(safe-area-inset-bottom, 0px);
         box-sizing: border-box; min-height: 100%; background: var(--bg); color: var(--fg);
         font-family: -apple-system, "SF Pro Text", Roboto, system-ui, sans-serif; font-weight: 400;
         -webkit-font-smoothing: antialiased; padding-bottom: calc(var(--bar) + var(--safe)); }
  .offline { background: var(--warn); color: #1c1f24; font-size: 12.5px; text-align: center;
             padding: 6px 16px; }
  .offline[hidden] { display: none; }
  main { padding: 12px 16px 16px; }
  .placeholder-text { color: var(--mut); font-size: 15px; margin: 32px 0; text-align: center; }
  nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2; box-sizing: border-box;
        height: calc(var(--bar) + var(--safe)); padding-bottom: var(--safe);
        display: flex; justify-content: space-around; align-items: stretch;
        background: color-mix(in srgb, var(--card) 92%, transparent);
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        border-top: 1px solid var(--line); }
  .tab { flex: 1 1 0; min-width: 44px; min-height: 44px; margin: 0; padding: 6px 0 4px;
         border: 0; background: none; color: var(--mut); font: inherit; font-size: 11px;
         display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
         cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .tab ha-icon { --mdc-icon-size: 24px; }
  .tab.active { color: var(--acc); }
  .tab:focus-visible { outline: 2px solid var(--acc); outline-offset: -4px; border-radius: 12px; }
`;

class PocketApp extends HTMLElement {
  constructor() {
    super();
    this._onHash = () => this._route();
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("pocket-app: a config is required");
    this._config = { ...config, rooms: Array.isArray(config.rooms) ? config.rooms : [] };
    if (this._root) {
      this._key = null;   // a new config (the editor, a reload of the dashboard) renders the page anew
      this._route();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    this._refresh();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 12;
  }

  connectedCallback() {
    window.addEventListener("hashchange", this._onHash);
    if (this._root) this._route();   // the hash may have changed while the card was away
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
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
      hass: this._hass,
      config: this._config,
      t: (key, vars) => this._t(key, vars),
      navigate: (route) => this._navigate(route),
      lang: this._lang(),
      offline: this._hass?.connected === false,
      routeId: this._current?.id,
    };
  }

  _build() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>${STYLE}</style>
      <div class="app">
        <div class="offline" role="status" hidden></div>
        <main></main>
        <nav>
          ${TABS.map((tab) => `
            <button class="tab" type="button" data-page="${tab.page}">
              <ha-icon icon="${tab.icon}"></ha-icon><span class="label"></span>
            </button>`).join("")}
        </nav>
      </div>`;
    this._app = this._root.querySelector(".app");
    this._main = this._root.querySelector("main");
    this._banner = this._root.querySelector(".offline");
    this._tabs = [...this._root.querySelectorAll(".tab")];
    this._tabs.forEach((button, i) => button.addEventListener("click", () => this._navigate(TABS[i].route)));
  }

  _navigate(route) {
    // Setting the hash fires hashchange later; routing now keeps the tap instant, and the later
    // event finds the page already in place (an update, not a new page).
    if (window.location.hash !== route) window.location.hash = route;
    this._route();
  }

  // Shows the page of location.hash: a new element when the route changed, else an update.
  _route() {
    if (!this._root || !this._config) return;
    const route = parseRoute(window.location.hash);
    const key = `${route.page}/${route.id ?? ""}`;
    this._current = route;
    if (key !== this._key) {
      this._key = key;
      this._page = pages[route.page];
      this._pageEl = this._page.render(this._ctx());
      this._main.replaceChildren(this._pageEl);
      this._renderBar();
      return;
    }
    this._page.update(this._pageEl, this._ctx());
  }

  _renderBar() {
    const active = tabOf(this._current?.page);
    TABS.forEach((tab, i) => {
      const button = this._tabs[i];
      const label = this._t(`card.pocket.nav.${tab.page}`);
      button.querySelector(".label").textContent = label;
      button.setAttribute("aria-label", label);
      button.classList.toggle("active", tab.page === active);
      if (tab.page === active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  _refresh() {
    applyTheme(this._app, this._hass);
    const offline = this._hass?.connected === false;
    this._banner.hidden = !offline;
    this._banner.textContent = offline ? this._t("card.pocket.offline") : "";
    this._app.classList.toggle("is-offline", offline);
    this._route();
  }
}

if (!customElements.get("pocket-app")) customElements.define("pocket-app", PocketApp);
