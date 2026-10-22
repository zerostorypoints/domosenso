// The probe page's only card (SPEC-011 section 7.3): measures what a wall tablet's WebView offers a
// dashboard and reports it to Home Assistant, so onboarding reads the screen instead of asking.
//
//   type: custom:domosenso-probe-card
//
// `domosenso probe <target> --install` puts it on a dashboard of its own; the person opens that
// page in the tablet's Companion app. The card measures once, shows the numbers large and calls
// `logbook.log` (name `domosenso-probe`, the measurements as JSON in `message`): `fire_event` needs
// an admin and the tablet's user usually is not one. `domosenso probe <target> --read` waits for
// that logbook entry.
//
// JSON modules are tried for real: the card's own strings are imported `with { type: "json" }`
// after it loaded, so a WebView without them still reports (in English) that it lacks them.

export const NAME = "domosenso-probe";
const FALLBACK = {
  title: "Domosenso probe",
  sent: "Measured and reported. The setup can go on; this page is removed afterwards.",
  failed: "Measured, but the report failed:",
};

// What the dashboard depends on: the viewport in CSS px and the pixel ratio (the layout), the
// Chromium major (JSON modules need 123, dvh 108), and whether the page runs in an Android WebView.
export function measure(win, { jsonModules, admin }) {
  const agent = win.navigator?.userAgent ?? "";
  const chromium = agent.match(/Chrome\/(\d+)/);
  const orientation = win.screen?.orientation?.type
    ?? (win.innerWidth >= win.innerHeight ? "landscape" : "portrait");
  return {
    viewport: [win.innerWidth, win.innerHeight],
    dpr: win.devicePixelRatio,
    screen: [win.screen?.width ?? null, win.screen?.height ?? null],
    orientation: orientation.split("-")[0],
    chromium: chromium ? Number(chromium[1]) : null,
    webview: /; wv\)/.test(agent),
    dvh: Boolean(win.CSS?.supports?.("height", "100dvh")),
    json_modules: jsonModules,
    admin: Boolean(admin),
  };
}

export async function loadStrings(importer = (path) => import(path, { with: { type: "json" } })) {
  try {
    return { strings: (await importer("./probe.json")).default, jsonModules: true };
  } catch {
    return { strings: null, jsonModules: false };
  }
}

class DomosensoProbeCard extends HTMLElement {
  setConfig() {}

  set hass(hass) {
    this._hass = hass;
    if (!this._started) {
      this._started = true;
      this._run();
    }
  }

  async _run() {
    const { strings, jsonModules } = await loadStrings();
    const language = (this._hass.locale?.language ?? this._hass.language ?? "en").split("-")[0];
    const text = strings?.[language] ?? strings?.en ?? FALLBACK;
    const result = measure(window, { jsonModules, admin: this._hass.user?.is_admin });
    let status = text.sent;
    try {
      await this._hass.callService("logbook", "log", { name: NAME, message: JSON.stringify(result) });
    } catch (err) {
      status = `${text.failed} ${err?.message ?? err}`;
    }
    this._render(text.title, result, status);
  }

  _render(title, result, status) {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const rows = Object.entries(result)
      .map(([key, value]) => `<tr><th>${key}</th><td>${Array.isArray(value) ? value.join(" × ") : value}</td></tr>`)
      .join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 24px; font-size: 28px; }
        table { border-collapse: collapse; } th { text-align: left; padding-right: 24px; font-weight: 400; opacity: .7; }
        h1 { font-size: 36px; margin: 0 0 16px; } p { font-size: 22px; }
      </style>
      <h1></h1><table>${rows}</table><p class="status"></p>`;
    this.shadowRoot.querySelector("h1").textContent = title;
    this.shadowRoot.querySelector(".status").textContent = status;
  }
}

if (!customElements.get("domosenso-probe-card")) customElements.define("domosenso-probe-card", DomosensoProbeCard);
