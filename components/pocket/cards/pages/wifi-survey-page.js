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
  parseScans, phoneEntities, androidCollector, markReturn, saveOutcome, loadOutcome } from "../lib/wifi-capture.js";
import { checkReading, sampleWithBand } from "../lib/wifi-checks.js";

export const SNAP_M = 1;
export const SLOW_MS = 30_000;           // a reading this late: the Shortcut may be missing or its Server unset
const READING = "sensor.domosenso_wifi_reading";
const KEY = { room: "pocket.wifi.room", method: "pocket.wifi.method", phone: "pocket.wifi.phone", ssid: "pocket.wifi.ssid", installed: "pocket.wifi.installed" };
// The Shortcuts tools/pocket_shortcuts.py writes, served beside the cards: the Companion app's (event) and
// Safari's (x-callback).
// Shortcuts names an imported file after the file, so each is named as Pocket runs it.
const SHORTCUT_FILE = { "shortcut-event": new URL(`../shortcuts/${SHORTCUT}.shortcut`, import.meta.url).href,
  "shortcut-callback": new URL(`../shortcuts/${SHORTCUT} Safari.shortcut`, import.meta.url).href };
const SHORTCUT_NAME = { "shortcut-event": SHORTCUT, "shortcut-callback": `${SHORTCUT} Safari` };
// Installed by downloading the file and opening it in Shortcuts: Shortcuts refuses its import-shortcut link
// for a file served by Home Assistant ("The shortcut URL provided was invalid", verified on an iPhone).

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
  .wifi-survey .status { font-size: 15px; }
  .wifi-survey .status .dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; background: var(--mut); }
  .wifi-survey .status.ok .dot { background: var(--good, #2e9d58); }
  .wifi-survey .status.warn .dot { background: var(--warn); }
  .wifi-survey .status.bad .dot { background: var(--bad); }
  .wifi-survey .status .status-text { flex: 1 1 10em; overflow-wrap: break-word; }
  .wifi-survey .readings { margin: 12px 0 0; padding: 4px 14px; background: var(--card); border: 1px solid var(--line);
                            border-radius: 18px; }
  .wifi-survey .readings h3 { margin: 10px 0 4px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .wifi-survey .reading { box-sizing: border-box; width: 100%; min-height: 48px; margin: 0; padding: 6px 0; border: 0;
                          border-top: 1px solid var(--line); background: none; color: var(--fg); font: inherit; font-size: 15px;
                          display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; cursor: pointer; }
  .wifi-survey .reading .label { flex: 1 1 8em; overflow-wrap: break-word; }
  .wifi-survey .reading small { display: block; font-size: 12.5px; color: var(--mut); }
  .wifi-survey .reading .v { font-weight: 600; }
  .wifi-survey .readings .empty { margin: 6px 0 10px; font-size: 13px; color: var(--mut); }
  .wifi-survey .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .wifi-survey .progress { font-size: 13px; color: var(--mut); }
  .wifi-survey .value { font-size: 28px; font-weight: 650; }
  .wifi-survey .facts, .wifi-survey .checks { margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--mut);
                                               display: flex; flex-direction: column; gap: 4px; overflow-wrap: break-word; }
  .wifi-survey .checks .bad { color: var(--bad); }
  .wifi-survey .checks .warn { color: var(--warn); }
  .wifi-survey .install a { color: var(--acc); font-size: 15px; min-height: 44px; display: flex; align-items: center; }
  .wifi-survey .install p { margin: 0; font-size: 13px; color: var(--mut); overflow-wrap: break-word; }
  .wifi-survey select { min-height: 44px; font: inherit; }
  .wifi-survey .room-pick { width: 100%; margin: 0 0 8px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--line);
                            background: var(--card); color: var(--fg); font-size: 15px; }
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
    <select class="room-pick" hidden></select>
    <div class="box" hidden></div>
    <div class="install" hidden><b class="install-title"></b><p class="install-text"></p><a class="install-link" target="_blank"></a>
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
      <div class="row status" hidden><span class="dot"></span><span class="status-text"></span>
        <button class="act undo" type="button" hidden></button></div>
    </div>
    <div class="readings" hidden><h3></h3><div class="list"></div><p class="empty"></p></div>`;
  const s = { ctx, card: null, loading: true, spot: null, why: null, pending: loadPending(store(), Date.now()), result: null,
    seen: null, kept: null, collector: null, timer: null, failure: null };
  // The outcome of a Measure that ended just before this page was built (the Companion app's return builds
  // it anew): shown again, never kept again.
  const before = loadOutcome(store(), Date.now());
  if (before) {
    s.kept = before.kept ?? null;
    s.result = before.result ?? null;
  }
  // Remembers the outcome for the page built on the app's return; null forgets it.
  const persist = () => saveOutcome(store(), s.kept || s.result ? { kept: s.kept, result: s.result } : null, Date.now());
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
  // The room the person stands in: the plan zooms to it, so a tap is big enough on a phone.
  $(".room-pick").addEventListener("change", (e) => {
    s.room = e.target.value || null;
    put(KEY.room, s.room);
    s.card?.focusRoom(s.room);
    update(root, s.ctx);
  });
  // A tap on a reading opens its details; another tap, or another reading, closes them.
  $(".readings .list").addEventListener("click", (e) => {
    const row = e.target.closest?.(".reading");
    if (!row) return;
    s.open = s.open === row.dataset.key ? null : row.dataset.key;
    s.readingsKey = null;
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
    s.kept = null;
    persist();
    update(root, s.ctx);
  });
  $(".keep").addEventListener("click", () => keep(null));
  for (const b of root.querySelectorAll(".bands [data-band]")) b.addEventListener("click", () => keep(b.dataset.band));
  $(".undo").addEventListener("click", async () => {
    const kept = s.kept;
    s.kept = null;
    s.result = null;
    persist();
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
    persist();
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
    s.result = { ...result, sample: null, kept: true };
    if (!s.ctx.config?.wifi_ssid && !get(KEY.ssid)) {
      const ssid = sample.scans.find((x) => x.ssid)?.ssid;
      if (ssid) put(KEY.ssid, ssid);
    }
    // Shown as kept at once (Pocket's optimistic pattern); a failed save takes it back with the reason.
    s.kept = sample;
    update(root, s.ctx);
    persist();
    try {
      await s.card.addSamples([sample]);
      forgetPlan();
    } catch (err) {
      s.kept = null;
      s.failure = err?.message || String(err);
      persist();
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
    if (pending.method !== "companion") markReturn(store(), Date.now());
    persist();
    // Every check passed: kept at once (a green dot); a warning waits for the person (amber), a failure keeps
    // nothing (red).
    if (sample && s.result.checks.every((c) => c.ok)) keep(null);
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
    s.rooms = plan.floors.flatMap((f) => f.rooms.map((r) => r.area_id));
    s.plan = plan;
    // The room picked on this phone, kept across a reload.
    const room = get(KEY.room);
    if (room && s.rooms.includes(room)) {
      s.room = room;
      card.focusRoom(room);
    }
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
  roomPick(root, ctx);
  readings(root, ctx);
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
    const shown = sample ?? s.kept;
    const dbm = shown?.dbm ?? null;
    setText($(".value"), dbm == null ? t("card.pocket.wifi.no_value") : dbmText(dbm));
    const facts = [];
    if (shown?.band) facts.push(t("card.pocket.wifi.band", { band: shown.band, channel: shown.channel ?? "?" }));
    if (shown) facts.push(shown.ap ? t("card.pocket.wifi.ap", { name: hass?.devices?.[shown.ap]?.name_by_user ?? hass?.devices?.[shown.ap]?.name ?? shown.ap })
      : t("card.pocket.wifi.ap_unknown"));
    if (shown?.noise != null) facts.push(t("card.pocket.wifi.noise", { noise: dbmText(shown.noise) }));
    if (r.rates.rx != null) facts.push(t("card.pocket.wifi.rates", { rx: r.rates.rx, tx: r.rates.tx ?? "?" }));
    if (shown) facts.push(t("card.pocket.wifi.spread", { spread: shown.spread }));
    if (r.prediction != null) facts.push(t("card.pocket.wifi.model", { dbm: dbmText(r.prediction) }));
    $(".facts").replaceChildren(...facts.map((f) => textNode("li", "", f)));
    $(".checks").replaceChildren(...r.checks.filter((c) => !c.ok).map((c) => textNode("li", c.level === "hard" ? "bad" : "warn", t(c.reason))));
    $(".bands").hidden = !(sample && r.needsBand);
    $(".keep").hidden = !sample || r.needsBand;
    $(".retry").hidden = !!r.kept;
    setText($(".keep"), t("card.pocket.wifi.keep"));
    setText($(".retry"), t("card.pocket.wifi.retry"));
  }
  // The outcome, a dot and a line: kept (green), waiting for the person's choice (amber), not kept (red).
  const status = $(".status");
  const tone = s.kept ? "ok" : s.failure || (r && !r.sample && !r.kept) ? "bad" : r?.sample ? "warn" : null;
  status.hidden = !tone;
  const name = `row status${tone ? ` ${tone}` : ""}`;
  if (status.className !== name) status.className = name;
  setText($(".status-text"), tone === "ok" ? t("card.pocket.wifi.kept", { dbm: dbmText(s.kept.dbm) })
    : tone === "warn" ? t("card.pocket.wifi.decide") : tone === "bad" ? (s.failure ? t("card.pocket.wifi.failed", { error: s.failure })
      : t("card.pocket.wifi.not_kept")) : "");
  $(".undo").hidden = tone !== "ok";
  setText($(".undo"), t("card.pocket.wifi.undo"));
}

// Whether [x, y] lies in a polygon (ray casting).
function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// The phone's readings kept in the plan (the card's surveySamples), newest first, of the picked room when
// there is one: time and room, the value; a tap opens the details and every scan. Rebuilt only when the
// readings, the room, the open one or the language change.
function readings(root, ctx) {
  const s = root._survey;
  const box = root.querySelector(".readings");
  box.hidden = !s.card;
  if (!s.card) return;
  const { t, hass } = ctx;
  const roomOf = (x) => s.plan?.floors.find((f) => f.floor_id === x.floor_id)?.rooms.find((r) => inside([x.x, x.y], r.polygon))?.area_id ?? null;
  const list = (s.card.surveySamples?.() ?? []).filter((x) => !s.room || roomOf(x) === s.room);
  const key = JSON.stringify([list.map((x) => [x.t, x.phone, x.dbm]), s.room, s.open, ctx.lang]);
  setText(box.querySelector("h3"), t("card.pocket.wifi.readings", { n: list.length }));
  const empty = box.querySelector(".empty");
  empty.hidden = list.length > 0;
  setText(empty, t("card.pocket.wifi.no_readings"));
  if (s.readingsKey === key) return;
  s.readingsKey = key;
  const time = (iso) => new Date(iso).toLocaleTimeString(ctx.lang, { hour: "2-digit", minute: "2-digit" });
  const nodes = [];
  for (const x of list) {
    const id = `${x.t}|${x.phone}`;
    const row = el("button", "reading", `<span class="label"><span class="n"></span><small></small></span><span class="v"></span>`);
    row.type = "button";
    row.dataset.key = id;
    const room = roomOf(x);
    row.querySelector(".n").textContent = room ? hass?.areas?.[room]?.name ?? room : t("card.pocket.wifi.no_room");
    row.querySelector("small").textContent = `${time(x.t)} · ${x.band ? `${x.band} GHz` : "?"}`;
    row.querySelector(".v").textContent = dbmText(x.dbm);
    nodes.push(row);
    if (s.open !== id) continue;
    const facts = [t("card.pocket.wifi.band", { band: x.band ?? "?", channel: x.channel ?? "?" }),
      x.ap ? t("card.pocket.wifi.ap", { name: hass?.devices?.[x.ap]?.name_by_user ?? hass?.devices?.[x.ap]?.name ?? x.ap }) : t("card.pocket.wifi.ap_unknown"),
      ...(x.noise != null ? [t("card.pocket.wifi.noise", { noise: dbmText(x.noise) })] : []),
      t("card.pocket.wifi.spread", { spread: x.spread ?? 0 }),
      t("card.pocket.wifi.scans", { list: (x.scans ?? []).map((sc) => (sc.dbm == null ? "?" : dbmText(sc.dbm))).join(", ") })];
    const details = el("ul", "facts details");
    details.replaceChildren(...facts.map((f) => textNode("li", "", f)));
    nodes.push(details);
  }
  box.querySelector(".list").replaceChildren(...nodes);
}

// The rooms of the plan by their Home Assistant names, after "Whole floor plan"; built again only when
// the rooms or their names change, so the choice stays.
function roomPick(root, ctx) {
  const s = root._survey;
  const pick = root.querySelector(".room-pick");
  pick.hidden = !s.card;
  if (!s.card) return;
  const rows = [["", ctx.t("card.pocket.wifi.whole_plan")],
    ...(s.rooms ?? []).map((id) => [id, ctx.hass?.areas?.[id]?.name ?? id])];
  const key = JSON.stringify(rows);
  if (pick.dataset.key === key) return;
  const chosen = s.room ?? "";
  pick.dataset.key = key;
  pick.replaceChildren(...rows.map(([value, name]) => {
    const option = textNode("option", "", name);
    option.value = value;
    return option;
  }));
  pick.value = rows.some(([value]) => value === chosen) ? chosen : "";
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
  setAttr(link, "href", SHORTCUT_FILE[kind]);
  setAttr(link, "download", `${SHORTCUT_NAME[kind]}.shortcut`);
  setText(link, t("card.pocket.wifi.install.link"));
  const server = $(".install-server");
  server.hidden = method !== "shortcut-event";
  setText(server, t("card.pocket.wifi.install.server"));
  const done = $(".done");
  done.hidden = false;
  setText(done, t("card.pocket.wifi.install.done"));
}
