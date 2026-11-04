// custom:pocket-app, the whole phone view. Placeholder of the pocket's first task: it registers the
// element so the dashboard and the catalog checks have their card; the shell replaces it.
class PocketApp extends HTMLElement {
  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get("pocket-app")) customElements.define("pocket-app", PocketApp);
