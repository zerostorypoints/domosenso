// The Wi-Fi survey (#/wifi-survey, SPEC-045), on the page contract of pages/index.js: an administrator
// walks the home with the phone, taps where they stand on the floor plan (the floorplan card in its phone
// survey mode: the next spots numbered, a tap within SNAP_M of one snaps to it) and presses Measure. The
// phone reads its Wi-Fi link (lib/wifi-capture.js: the iPhone Shortcut, or the Companion app's sensors on
// Android), the reading is checked (lib/wifi-checks.js) and shown beside the model, and Keep saves it into
// the plan as a sample (the card's addSamples, administrators only); Undo takes the last one out.
//
// The iPhone leaves the page for Shortcuts and the Companion app reloads it on the return: the Measure
// waiting for its reading lives in localStorage (lib/wifi-capture.js), the reading in
// sensor.domosenso_wifi_reading (Pocket's package), so the page picks both up when it is built again.
// Reached from the System page; its back returns there. Per device (localStorage): the method, the
// Android phone, the expected network name when the home sets none, whether the Shortcut is installed.

import { el, setAttr, setText } from "../lib/page-kit.js";
import { ELEMENT } from "../lib/area-plan.js";
import { loadPlan, forgetPlan } from "../lib/plan-cache.js";
import { PENDING_MS, SHORTCUT, detectMethod, newCode, savePending, loadPending, clearPending, shortcutUrl, readingFromSensor, callbackResult,
  parseScans, phoneEntities, androidCollector } from "../lib/wifi-capture.js";
import { checkReading, sampleWithBand } from "../lib/wifi-checks.js";

export const SNAP_M = 1;
export const SLOW_MS = 30_000;           // a reading this late: the Shortcut may be missing or its Server unset
const READING = "sensor.domosenso_wifi_reading";
const KEY = { method: "pocket.wifi.method", phone: "pocket.wifi.phone", ssid: "pocket.wifi.ssid", installed: "pocket.wifi.installed" };
// The Shortcuts tools/pocket_shortcuts.py writes, served beside the cards: the Companion app's (event) and
// Safari's (x-callback).
// Shortcuts names an imported file after the file, so each is named as Pocket runs it.
const SHORTCUT_FILE = { "shortcut-event": new URL(`../shortcuts/${SHORTCUT}.shortcut`, import.meta.url).href,
  "shortcut-callback": new URL(`../shortcuts/${SHORTCUT} Safari.shortcut`, import.meta.url).href };
const SHORTCUT_NAME = { "shortcut-event": SHORTCUT, "shortcut-callback": `${SHORTCUT} Safari` };
// Shortcuts' own import: it fetches the file and opens the import, no download in Safari between.
const importUrl = (file, name) => `shortcuts://import-shortcut?url=${encodeURIComponent(file)}&name=${encodeURIComponent(name)}`;

const STYLE = `
  .wifi-survey .top { display: flex; align-items: center; gap: 8px; padding: 0 4px 8px; }
  .wifi-survey .back { min-height: 44px; margin: 0 0 0 -8px; padding: 0 8px 0 0; border: 0; background: none; color: var(--fg);
                       font: inherit; display: flex; align-items: center; cursor: pointer; }
  .wifi-survey .back b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .wifi-survey .back ha-icon { --mdc-icon-size: 28px; flex: 0 0 auto; }
  .wifi-survey [hidden] { display: none !important; }
  .wifi-survey .box { --floorplan-target: 44px; height: 52vh; min-height: 300px; border-radius: 18px; overflow: hidden;
                      border: 1px solid var(--line); }
  .wifi-survey .none { color: var(--mut); font-size: 15px; margin: 32px 0; text-align: center; }
  .wifi-survey .panel, .wifi-survey .install { margin: 12px 0 0; padding: 12px 14px; background: var(--card);
                      border: 1px solid var(--line); border-radius: 18px; display: flex; flex-direction: column; gap: 10px; }
  .wifi-survey .method { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
                         font-size: 13px; color: var(--mut); }
  .wifi-survey .why { font-size: 15px; overflow-wrap: break-word; }
  .wifi-survey button.act { min-height: 44px; min-width: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--line);
                            background: var(--chip); color: var(--fg); font: inherit; font-size: 15px; cursor: pointer; }
  .wifi-survey button.primary { background: var(--acc); border-color: var(--acc); color: var(--on-acc, #fff); }
  .wifi-survey button.act:disabled { opacity: .5; cursor: default; }
  .wifi-survey button.link { min-height: 44px; border: 0; background: none; color: var(--acc); font: inherit; font-size: 13px; cursor: pointer; }
  .wifi-survey .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .wifi-survey .progress { font-size: 13px; color: var(--mut); }
  .wifi-survey .value { font-size: 28px; font-weight: 650; }
  .wifi-survey .facts, .wifi-survey .checks { margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--mut);
                                               display: flex; flex-direction: column; gap: 4px; overflow-wrap: break-word; }
  .wifi-survey .checks .bad { color: var(--bad); }
  .wifi-survey .checks .warn { color: var(--warn); }
  .wifi-survey .install a.install-file { font-size: 13px; }
  .wifi-survey .install a { color: var(--acc); font-size: 15px; min-height: 44px; display: flex; align-items: center; }
  .wifi-survey .install p { margin: 0; font-size: 13px; color: var(--mut); overflow-wrap: break-word; }
  .wifi-survey select { min-height: 44px; font: inherit; }
`;

const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const get = (key) => {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const put = (key, value) => {
  try {
    if (value == null) store()?.removeItem(key);
    else store()?.setItem(key, value);
  } catch {
    // blocked storage: the choice lasts while the page is open
  }
};
// A node with text (page-kit's el takes HTML).
const textNode = (tag, className, text) => {
  const node = el(tag, className);
  node.textContent = text;
  return node;
};
const dbmText = (v) => `${v < 0 ? "−" : ""}${Math.abs(v)} dBm`;
const isAdmin = (ctx) => ctx.hass?.user?.is_admin === true;
// The notify service of a mobile_app device: Home Assistant names it after the device's name, slugified.
function notifyService(hass, deviceId) {
  const name = String(hass.devices?.[deviceId]?.name_by_user ?? hass.devices?.[deviceId]?.name ?? "").toLowerCase();
  const slugs = [name.replace(/[^a-z0-9]+/g, "_"), name.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_")]
    .map((s) => `mobile_app_${s.replace(/^_+|_+$/g, "")}`);
  return slugs.find((s) => hass.services?.notify?.[s]) ?? slugs[0];
}
// Android phones: mobile_app devices with the Companion app's Wi-Fi signal sensor.
const androidPhones = (hass) => Object.keys(hass?.devices || {}).filter((id) => phoneEntities(hass, id));

export function render(ctx) {
  const root = el("section", "wifi-survey");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><button class="back" type="button"><ha-icon icon="mdi:chevron-left"></ha-icon><b></b></button></div>
    <p class="none" hidden></p>
    <div class="box" hidden></div>
    <div class="install" hidden><b class="install-title"></b><p class="install-text"></p><a class="install-link" target="_blank"></a><a class="install-file" target="_blank"></a>
      <p class="install-server"></p><select class="phone-pick" hidden></select><button class="act done" type="button"></button></div>
    <div class="panel" hidden>
      <div class="method"><span class="method-name"></span><button class="link change" type="button"></button></div>
      <div class="why"></div>
      <div class="row"><button class="act primary measure" type="button"></button><button class="act cancel" type="button" hidden></button>
        <span class="progress"></span></div>
      <div class="result" hidden>
        <div class="value"></div><ul class="facts"></ul><ul class="checks"></ul>
        <div class="row bands" hidden><button class="act" type="button" data-band="2.4">2.4 GHz</button>
          <button class="act" type="button" data-band="6">6 GHz</button></div>
        <div class="row"><button class="act primary keep" type="button"></button><button class="act retry" type="button"></button></div>
      </div>
      <div class="row kept" hidden><span class="kept-text"></span><button class="act undo" type="button"></button></div>
    </div>`;
  const s = { ctx, card: null, loading: true, spot: null, why: null, pending: loadPending(store(), Date.now()), result: null,
    seen: null, kept: null, collector: null, timer: null, failure: null };
  root._survey = s;
  const $ = (sel) => root.querySelector(sel);
  $(".back").addEventListener("click", () => s.ctx.navigate("#/system"));
  $(".change").addEventListener("click", () => {
    const next = methodOf() === "companion" ? "shortcut-event" : "companion";
    put(KEY.method, next);
    update(root, s.ctx);
  });
  $(".done").addEventListener("click", () => {
    put(KEY.installed, "1");
    update(root, s.ctx);
  });
  $(".phone-pick").addEventListener("change", (e) => {
    put(KEY.phone, e.target.value || null);
    update(root, s.ctx);
  });
  $(".measure").addEventListener("click", () => measure());
  $(".cancel").addEventListener("click", () => {
    stop(null);
    update(root, s.ctx);
  });
  $(".retry").addEventListener("click", () => {
    s.result = null;
    s.failure = null;
    update(root, s.ctx);
  });
  $(".keep").addEventListener("click", () => keep(null));
  for (const b of root.querySelectorAll(".bands [data-band]")) b.addEventListener("click", () => keep(b.dataset.band));
  $(".undo").addEventListener("click", async () => {
    const kept = s.kept;
    s.kept = null;
    if (kept) await s.card?.removeSample(kept.t, kept.phone);
    forgetPlan();
    update(root, s.ctx);
  });

  const methodOf = () => {
    const chosen = get(KEY.method);
    if (chosen === "companion") return "companion";
    const found = detectMethod(window);
    if (chosen === "shortcut-event") return found === "shortcut-callback" ? "shortcut-callback" : "shortcut-event";
    return found ?? "shortcut-event";
  };
  s.methodOf = methodOf;

  function measure() {
    if (!s.spot) return;
    const method = methodOf();
    const hass = s.ctx.hass;
    const phone = method === "companion" ? get(KEY.phone) : "ios";
    if (method === "companion" && !phone) return void update(root, s.ctx);
    s.result = null;
    s.failure = null;
    s.note = null;
    s.kept = null;
    s.pending = { code: newCode(), ...s.spot, at: Date.now(), method, phone };
    savePending(store(), s.pending);
    const n = s.ctx.config?.wifi_scans ?? 5;
    if (method === "companion") {
      const entities = phoneEntities(hass, phone);
      s.collector = entities ? androidCollector({ n, startedAt: s.pending.at, entities }) : null;
      send(phone);
      clearInterval(s.timer);
      s.timer = setInterval(() => tick(), 1000);
    } else if (method === "shortcut-callback") {
      const back = `${window.location.origin}${window.location.pathname}`;
      window.location.assign(shortcutUrl({ code: s.pending.code, n, mode: "callback", returnUrl: back }));
    } else {
      const back = `homeassistant://navigate${window.location.pathname}`;
      window.open(shortcutUrl({ code: s.pending.code, n, mode: "event", returnUrl: back }), "_blank");
    }
    update(root, s.ctx);
  }
  s.measure = measure;

  // The waiting Measure ends without a reading: cancelled (note null) or given up.
  function stop(note) {
    s.pending = null;
    s.collector = null;
    s.note = note;
    clearInterval(s.timer);
    clearPending(store());
  }
  s.stop = stop;

  function send(phone) {
    const hass = s.ctx.hass;
    hass?.callService?.("notify", notifyService(hass, phone), { message: "command_update_sensors" })?.catch?.(() => {});
  }
  s.send = send;

  function tick() {
    // The page left the screen, or nothing is collected: the timer stops.
    if (!root.isConnected || !s.collector || !s.pending) return void clearInterval(s.timer);
    const state = s.collector.state(Date.now());
    if (state === "collecting") return;
    clearInterval(s.timer);
    evaluate(s.collector.scans, null);
    s.collector = null;
    update(root, s.ctx);
  }

  async function keep(band) {
    const result = s.result;
    if (!result?.sample) return;
    const sample = band ? sampleWithBand(result.sample, band) : result.sample;
    s.result = null;
    if (!s.ctx.config?.wifi_ssid && !get(KEY.ssid)) {
      const ssid = sample.scans.find((x) => x.ssid)?.ssid;
      if (ssid) put(KEY.ssid, ssid);
    }
    try {
      await s.card.addSamples([sample]);
      s.kept = sample;
      forgetPlan();
    } catch (err) {
      s.failure = err?.message || String(err);
    }
    update(root, s.ctx);
  }

  function evaluate(scans, readingUserId) {
    const hass = s.ctx.hass;
    const pending = s.pending;
    s.result = checkReading(scans, { pending, now: Date.now(), userId: hass?.user?.id ?? null, readingUserId,
      ssid: s.ctx.config?.wifi_ssid ?? get(KEY.ssid), resolve: (r) => s.card?.resolveReading(r) ?? { ap: null, band: null, via: null } });
    const sample = s.result.sample;
    s.result.prediction = sample?.ap && sample.band ? s.card?.predictionAt(pending, sample.ap, sample.band) ?? null : null;
    s.pending = null;
    clearPending(store());
  }
  s.evaluate = evaluate;

  // The x-callback route (an iPhone without the Companion app): the Shortcut's result is in the address.
  const result = callbackResult(window.location);
  if (result && s.pending) {
    try {
      const data = JSON.parse(result);
      if (data?.code === s.pending.code) s.callback = parseScans(data.scans);
    } catch {
      // not the Shortcut's result
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}#/wifi-survey`);
  }

  const attach = (plan) => {
    s.loading = false;
    if (s.card || !plan) return void update(root, s.ctx);
    const card = document.createElement(ELEMENT);
    card.setConfig({ plan, edit: false, chips: false, values: false, maps: true, zoom: true, survey: "phone" });
    card.addEventListener("floorplan-tap", (e) => {
      const tapped = e.detail;
      const near = (card.surveySpots?.() ?? []).find((p) => p.floor_id === tapped.floor_id && Math.hypot(p.x - tapped.x, p.y - tapped.y) <= SNAP_M);
      s.spot = near ? { floor_id: near.floor_id, x: near.x, y: near.y } : { floor_id: tapped.floor_id, x: tapped.x, y: tapped.y };
      s.why = near?.why ?? null;
      card.setSurveySpot(s.spot);
      update(root, s.ctx);
    });
    card.hass = s.ctx.hass;
    s.card = card;
    root.querySelector(".box").append(card);
    if (s.pending) card.setSurveySpot({ floor_id: s.pending.floor_id, x: s.pending.x, y: s.pending.y });
    update(root, s.ctx);
  };
  if (ctx.config?.floorplan && isAdmin(ctx)) {
    const defined = customElements.get(ELEMENT) ? Promise.resolve() : customElements.whenDefined(ELEMENT);
    Promise.all([loadPlan(ctx.hass), defined]).then(([plan]) => attach(plan));
  } else s.loading = false;
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const s = root._survey;
  s.ctx = ctx;
  const { t, hass } = ctx;
  const $ = (sel) => root.querySelector(sel);
  setText($(".back b"), t("card.pocket.wifi.title"));
  setAttr($(".back"), "aria-label", t("card.pocket.wifi.back"));
  const none = $(".none");
  const admin = isAdmin(ctx);
  const noPlan = admin && !s.loading && !s.card;
  none.hidden = admin && !noPlan;
  setText(none, !admin ? t("card.pocket.wifi.admin_only") : t("card.pocket.wifi.no_plan"));
  $(".box").hidden = !s.card;
  $(".panel").hidden = !s.card;
  // Each part's hidden is set once per update, to its final value: hiding one for a moment while the
  // floorplan card measures itself (its hass) shortens the page and the browser scrolls it to the top.
  if (!s.card) {
    $(".install").hidden = true;
    return;
  }
  s.card.hass = hass;

  // A reading that arrived: the Shortcut's (sensor or address) or nothing yet; each code once.
  if (s.pending && s.pending.method !== "companion") {
    if (s.callback) {
      const scans = s.callback;
      s.callback = null;
      s.evaluate(scans, null);
    } else {
      const got = readingFromSensor(hass?.states?.[READING], s.pending);
      if (got && s.seen !== s.pending.code) {
        s.seen = s.pending.code;
        s.evaluate(got.scans, got.user_id);
      }
    }
  }
  if (s.collector && s.collector.offer(hass)) s.send(s.pending?.phone);
  const waited = s.pending ? Date.now() - s.pending.at : 0;
  if (s.pending && !s.collector && waited > PENDING_MS) s.stop("none_arrived");

  const method = s.methodOf();
  installCard(root, ctx, method);
  setText($(".method-name"), t(`card.pocket.wifi.method.${method}`));
  setText($(".change"), t("card.pocket.wifi.change"));
  setText($(".why"), s.why ? t(`card.pocket.wifi.why.${s.why}`) : s.spot ? t("card.pocket.wifi.here") : t("card.pocket.wifi.pick"));
  const measure = $(".measure");
  setText(measure, t("card.pocket.wifi.measure"));
  measure.disabled = !s.spot || !!s.pending || (method === "companion" && !get(KEY.phone));
  const cancel = $(".cancel");
  cancel.hidden = !s.pending;
  setText(cancel, t("card.pocket.wifi.cancel"));
  setText($(".progress"), s.pending ? (s.collector ? t("card.pocket.wifi.reading", { n: s.collector.scans.length,
    total: ctx.config?.wifi_scans ?? 5 }) : t(waited > SLOW_MS ? "card.pocket.wifi.slow" : "card.pocket.wifi.waiting"))
    : s.failure ? t("card.pocket.wifi.failed", { error: s.failure }) : s.note ? t(`card.pocket.wifi.${s.note}`) : "");

  const box = $(".result");
  const r = s.result;
  box.hidden = !r;
  if (r) {
    const sample = r.sample;
    const dbm = sample?.dbm ?? null;
    setText($(".value"), dbm == null ? t("card.pocket.wifi.no_value") : dbmText(dbm));
    const facts = [];
    if (sample?.band) facts.push(t("card.pocket.wifi.band", { band: sample.band, channel: sample.channel ?? "?" }));
    if (sample) facts.push(sample.ap ? t("card.pocket.wifi.ap", { name: hass?.devices?.[sample.ap]?.name_by_user ?? hass?.devices?.[sample.ap]?.name ?? sample.ap })
      : t("card.pocket.wifi.ap_unknown"));
    if (sample?.noise != null) facts.push(t("card.pocket.wifi.noise", { noise: dbmText(sample.noise) }));
    if (r.rates.rx != null) facts.push(t("card.pocket.wifi.rates", { rx: r.rates.rx, tx: r.rates.tx ?? "?" }));
    if (sample) facts.push(t("card.pocket.wifi.spread", { spread: sample.spread }));
    if (r.prediction != null) facts.push(t("card.pocket.wifi.model", { dbm: dbmText(r.prediction) }));
    $(".facts").replaceChildren(...facts.map((f) => textNode("li", "", f)));
    $(".checks").replaceChildren(...r.checks.filter((c) => !c.ok).map((c) => textNode("li", c.level === "hard" ? "bad" : "warn", t(c.reason))));
    $(".bands").hidden = !(sample && r.needsBand);
    $(".keep").hidden = !sample || r.needsBand;
    setText($(".keep"), t("card.pocket.wifi.keep"));
    setText($(".retry"), t("card.pocket.wifi.retry"));
  }
  $(".kept").hidden = !s.kept;
  if (s.kept) {
    setText($(".kept-text"), t("card.pocket.wifi.kept", { dbm: dbmText(s.kept.dbm) }));
    setText($(".undo"), t("card.pocket.wifi.undo"));
  }
}

// First use on this phone: the Shortcut to install (iPhone), or the Companion app's sensors and the phone
// (Android).
function installCard(root, ctx, method) {
  const { t, hass } = ctx;
  const $ = (sel) => root.querySelector(sel);
  const box = $(".install");
  const pick = $(".phone-pick");
  if (method === "companion") {
    const phone = get(KEY.phone);
    box.hidden = !!phone && !!phoneEntities(hass, phone);
    setText($(".install-title"), t("card.pocket.wifi.install.android_title"));
    setText($(".install-text"), t("card.pocket.wifi.install.android"));
    $(".install-link").hidden = true;
    $(".install-file").hidden = true;
    $(".install-server").hidden = true;
    $(".done").hidden = true;
    pick.hidden = false;
    const ids = androidPhones(hass);
    const key = ids.join(" ");
    if (pick.dataset.key !== key) {
      pick.dataset.key = key;
      pick.replaceChildren(textNode("option", "", t("card.pocket.wifi.install.phone")),
        ...ids.map((id) => {
          const o = textNode("option", "", hass.devices[id].name_by_user ?? hass.devices[id].name ?? id);
          o.value = id;
          return o;
        }));
    }
    pick.value = phone ?? "";
    return;
  }
  box.hidden = get(KEY.installed) === "1";
  pick.hidden = true;
  setText($(".install-title"), t("card.pocket.wifi.install.title"));
  setText($(".install-text"), t("card.pocket.wifi.install.iphone"));
  const link = $(".install-link");
  link.hidden = false;
  const kind = SHORTCUT_FILE[method] ? method : "shortcut-event";
  setAttr(link, "href", importUrl(SHORTCUT_FILE[kind], SHORTCUT_NAME[kind]));
  setText(link, t("card.pocket.wifi.install.link"));
  const file = $(".install-file");
  file.hidden = false;
  setAttr(file, "href", SHORTCUT_FILE[kind]);
  setText(file, t("card.pocket.wifi.install.file"));
  const server = $(".install-server");
  server.hidden = method !== "shortcut-event";
  setText(server, t("card.pocket.wifi.install.server"));
  const done = $(".done");
  done.hidden = false;
  setText(done, t("card.pocket.wifi.install.done"));
}
