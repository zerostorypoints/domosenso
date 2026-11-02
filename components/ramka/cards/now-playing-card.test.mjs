import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./now-playing-card.js";

// Connected cards are removed after each test, which stops their timers and loops.
afterEach(() => { document.body.replaceChildren(); mock.timers.reset(); });

const NOW = "2026-10-20T12:00:00Z";
const ENTITY = "media_player.living_room";

// Only what a Chromecast or DLNA player reports: no app_name, volume, quality or source.
const generic = (state, extra = {}) => ({
  state, attributes: { media_title: "Blue in Green", media_artist: "Miles Davis", ...extra },
});

// The card has no hass getter: `given` keeps the last hass a test passed in.
const given = new WeakMap();
const feed = (card, hass) => { given.set(card, hass); card.hass = hass; };

function makeCard({ lang = "en", player = generic("playing"), states = {}, config = {}, connect = false } = {}) {
  mock.timers.reset();
  // setInterval too: a connected card starts its progress timer.
  mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date(NOW) });
  const card = document.createElement("now-playing-card");
  card.setConfig({ entity: ENTITY, ...config });
  feed(card, { locale: { language: lang }, hassUrl: (p) => `http://ha.local${p}`, states: { [ENTITY]: player, ...states } });
  // Home Assistant sets hass before it puts the card on the page.
  if (connect) document.body.appendChild(card);
  return card;
}

const q = (card, sel) => card.shadowRoot.querySelector(sel);

test("a generic player with only title, artist and state renders without error", () => {
  for (const state of ["playing", "paused", "idle", "standby", "off"]) {
    const card = makeCard({ player: generic(state) });
    assert.equal(q(card, ".title").textContent, "Blue in Green", state);
    assert.equal(q(card, ".artist").textContent, "Miles Davis", state);
    assert.equal(q(card, ".album").textContent, "", state);
    assert.equal(q(card, ".meta").textContent, "", state);
    assert.equal(q(card, ".vpct").textContent, "", state);
    assert.equal(q(card, ".art").hidden, true, state);
  }
});

test("idle and paused show the same card in every language: no state word is added", () => {
  for (const state of ["idle", "paused"]) {
    const texts = ["en", "de", "pl", "fr"].map((lang) => shadowText(makeCard({ lang, player: generic(state) })));
    assert.equal(new Set(texts).size, 1, state);
  }
});

test("artwork comes from entity_picture through hassUrl", () => {
  const card = makeCard({ player: generic("playing", { entity_picture: "/api/media_player_proxy/x?token=1" }) });
  assert.equal(q(card, ".art").getAttribute("src"), "http://ha.local/api/media_player_proxy/x?token=1");
  assert.equal(q(card, ".art").hidden, false);
});

test("album, service and volume appear when the player reports them", () => {
  const card = makeCard({ player: generic("playing", {
    media_album_name: "Kind of Blue", app_name: "Spotify", volume_level: 0.42, is_volume_muted: false,
  }) });
  assert.match(q(card, ".album").textContent, /Kind of Blue/);
  assert.equal(q(card, ".album ha-icon").getAttribute("icon"), "mdi:spotify");
  assert.equal(q(card, ".vpct").textContent, "42 %");
  assert.equal(q(card, ".vfill").style.width, "42%");
});

test("an amplifier's quality, source and detail sensors still show on the quality line", () => {
  const states = {
    "sensor.q": { state: "hi_res", attributes: {} },
    "sensor.src": { state: "Turntable", attributes: {} },
    "sensor.bits": { state: "24", attributes: { unit_of_measurement: "bit" } },
    "sensor.rate": { state: "48", attributes: { unit_of_measurement: "kHz" } },
    "sensor.gone": { state: "unavailable", attributes: {} },
  };
  const card = makeCard({ states, config: { quality: "sensor.q", source: "sensor.src", details: ["sensor.bits", "sensor.rate", "sensor.gone"] } });
  const meta = q(card, ".meta");
  assert.equal(meta.textContent.replace(/\s+/g, " ").trim(), "Hi-Res·Turntable·24 bit / 48 kHz");
  assert.equal(meta.querySelector("ha-icon").getAttribute("icon"), "mdi:record-player");
});

test("the quality words come from card.now_playing.quality, in every language", () => {
  for (const lang of ["en", "de", "pl"]) {
    for (const [state, word] of [["hi_res", "Hi-Res"], ["lossless", "Lossless"], ["lossy", "Lossy"]]) {
      const card = makeCard({ lang, states: { "sensor.q": { state, attributes: {} } }, config: { quality: "sensor.q" } });
      assert.equal(q(card, ".meta").textContent, word, `${lang} ${state}`);
    }
  }
  const card = makeCard({ states: { "sensor.q": { state: "dsd", attributes: {} } }, config: { quality: "sensor.q" } });
  assert.equal(q(card, ".meta").textContent, "dsd");
});

test("a source equal to the streaming service is not repeated on the quality line", () => {
  const card = makeCard({
    player: generic("playing", { app_name: "Qobuz" }),
    states: { "sensor.src": { state: "qobuz", attributes: {} } }, config: { source: "sensor.src" },
  });
  assert.equal(q(card, ".meta").textContent, "");
});

test("text from the player is shown as text, never as markup", () => {
  const card = makeCard({ player: generic("playing", { media_album_name: "<b>Hello</b>", app_name: "<i>x</i>" }),
    states: { "sensor.q": { state: "<u>q</u>", attributes: {} } }, config: { quality: "sensor.q" } });
  assert.equal(q(card, ".album b"), null);
  assert.match(q(card, ".album").textContent, /<b>Hello<\/b>/);
  assert.equal(q(card, ".meta u"), null);
  assert.equal(q(card, ".meta").textContent, "<u>q</u>");
});

test("progress follows the clock while playing and stands still while paused", () => {
  const attrs = { media_duration: 200, media_position: 60, media_position_updated_at: "2026-10-20T11:59:50Z" };
  const playing = makeCard({ player: generic("playing", attrs) });
  assert.equal(q(playing, ".pos").textContent, "1:10");
  assert.equal(q(playing, ".dur").textContent, "3:20");
  assert.equal(q(playing, ".fill").style.width, "35%");
  const paused = makeCard({ player: generic("paused", attrs) });
  assert.equal(q(paused, ".pos").textContent, "1:00");
  assert.equal(q(paused, ".fill").style.width, "30%");
  const none = makeCard({ player: generic("playing") });
  assert.equal(q(none, ".pos").textContent, "");
  assert.equal(q(none, ".fill").style.width, "0%");
});

test("the entity is required, and a missing entity leaves the card blank", () => {
  assert.throws(() => document.createElement("now-playing-card").setConfig({}), /entity is required/);
  const card = makeCard({ states: { [ENTITY]: undefined } });
  assert.doesNotThrow(() => { card.hass = { locale: { language: "en" }, states: {} }; });
});

// ---- visual: the room's music visual in the wave strip ---------------------------------------
// The card's own wave asks for animation frames; a hosted visual does not. Counting the requests
// tells which one draws, without reaching into the card.
let frames = 0;
globalThis.requestAnimationFrame = () => ++frames;
globalThis.cancelAnimationFrame = () => {};

// Stands in for audio-sensor's ambient-wave-card: records its config and every hass it gets.
class StubVisual extends HTMLElement {
  setConfig(config) { this.config = config; }
  set hass(hass) { this.hassCount = (this.hassCount ?? 0) + 1; this._hass = hass; }
  get hass() { return this._hass; }
}
if (!customElements.get("ambient-wave-card")) customElements.define("ambient-wave-card", StubVisual);

const SELECT = "input_select.music_visual";
const VISUAL = {
  select: SELECT,
  spectrum: { type: "custom:ambient-wave-card", source: { kind: "spectrum", entity: "sensor.music_spectrum" }, active: "binary_sensor.playing" },
  level: { type: "custom:ambient-wave-card", source: { kind: "scalar", entity: "sensor.music_level" }, active: "binary_sensor.playing" },
};
const withSelect = (option) => (option === undefined ? {} : { [SELECT]: { state: option, attributes: {} } });
const visualCard = (option, config = {}) => {
  frames = 0;
  return makeCard({ states: withSelect(option), config: { wave: true, visual: VISUAL, ...config }, connect: true });
};
const children = (card) => [...q(card, ".eq").children].filter((el) => el.tagName !== "CANVAS");
const ownWave = (card) => q(card, ".eq canvas").style.display !== "none" && frames > 0;
const setSelect = (card, option, extra = {}) => {
  const hass = given.get(card);
  feed(card, { ...hass, states: { ...hass.states, ...withSelect(option), ...extra } });
};

test("visual spectrum creates the ambient card in the strip", () => {
  const card = visualCard("spectrum");
  const kids = children(card);
  assert.equal(kids.length, 1);
  assert.equal(kids[0].localName, "ambient-wave-card");
  assert.deepEqual(kids[0].config, VISUAL.spectrum);
  assert.equal(kids[0].hass, given.get(card));
  assert.equal(q(card, ".eq").style.display, "block");
  assert.equal(q(card, ".eq canvas").style.display, "none");
  assert.equal(frames, 0, "the own wave does not draw");
  // It fills the strip and brings no card chrome that would change the strip's height.
  assert.equal(kids[0].style.width, "100%");
  assert.equal(kids[0].style.height, "100%");
  assert.equal(kids[0].style.getPropertyValue("--ha-card-border-width"), "0");
});

test("the hosted visual gets hass on every update", () => {
  const card = visualCard("level");
  const kid = children(card)[0];
  assert.deepEqual(kid.config, VISUAL.level);
  const before = kid.hassCount;
  setSelect(card, "level", { "sensor.music_level": { state: "61", attributes: {} } });
  assert.equal(children(card)[0], kid, "the same child stays");
  assert.equal(kid.hassCount, before + 1);
  assert.equal(kid.hass, given.get(card));
});

test("select on classic keeps the own wave and creates no card", () => {
  const card = visualCard("classic");
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));
});

test("select unavailable keeps the own wave", () => {
  for (const option of ["unavailable", "unknown", "something-else", "select", undefined]) {
    const card = visualCard(option);
    assert.equal(children(card).length, 0, String(option));
    assert.ok(ownWave(card), String(option));
  }
});

test("switching level→spectrum replaces the child", () => {
  const card = visualCard("level");
  const level = children(card)[0];
  setSelect(card, "spectrum");
  const kids = children(card);
  assert.equal(kids.length, 1);
  assert.notEqual(kids[0], level);
  assert.deepEqual(kids[0].config, VISUAL.spectrum);
  assert.equal(level.isConnected, false);
});

test("switching to classic removes the child and starts the own wave; back again stops it", () => {
  const card = visualCard("spectrum");
  setSelect(card, "classic");
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));
  frames = 0;
  setSelect(card, "spectrum");
  assert.equal(children(card).length, 1);
  assert.equal(q(card, ".eq canvas").style.display, "none");
  setSelect(card, "spectrum");
  assert.equal(frames, 0, "the own wave stays stopped");
});

test("without visual nothing changes", () => {
  frames = 0;
  const card = makeCard({ states: withSelect("spectrum"), config: { wave: true }, connect: true });
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));
  frames = 0;
  const still = makeCard({ states: withSelect("spectrum"), connect: true });
  assert.equal(children(still).length, 0);
  assert.equal(q(still, ".eq").style.display, "");
  assert.equal(frames, 0);
});

const LIVE = "input_boolean.music_live";
test("with live: the visual only while the switch is on; off or missing keeps the own wave", () => {
  const live = { visual: { ...VISUAL, live: LIVE } };
  for (const state of ["off", "unavailable", "unknown", undefined]) {
    frames = 0;
    const extra = state === undefined ? {} : { [LIVE]: { state, attributes: {} } };
    const card = makeCard({ states: { ...withSelect("spectrum"), ...extra }, config: { wave: true, ...live }, connect: true });
    assert.equal(children(card).length, 0, String(state));
    assert.ok(ownWave(card), String(state));
  }
  frames = 0;
  const card = makeCard({ states: { ...withSelect("level"), [LIVE]: { state: "on", attributes: {} } }, config: { wave: true, ...live }, connect: true });
  assert.equal(children(card).length, 1);
  assert.deepEqual(children(card)[0].config, VISUAL.level);
  // Switching live off removes the child and starts the wave; on again brings the visual back.
  setSelect(card, "level", { [LIVE]: { state: "off", attributes: {} } });
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));
  setSelect(card, "level", { [LIVE]: { state: "on", attributes: {} } });
  assert.equal(children(card).length, 1);
});

test("a live that is no entity id is refused", () => {
  assert.throws(() => document.createElement("now-playing-card").setConfig({ entity: ENTITY, visual: { ...VISUAL, live: true } }), /visual\.live/);
});

test("a visual without a select is refused", () => {
  assert.throws(() => document.createElement("now-playing-card").setConfig({ entity: ENTITY, visual: { spectrum: VISUAL.spectrum } }), /visual\.select/);
});

test("element not defined yet: the own wave, then the visual once it is defined", async () => {
  // Another element name than the stub's: the registry is shared by every test in this file.
  const late = { ...VISUAL.spectrum, type: "custom:late-wave-card" };
  const card = visualCard("spectrum", { visual: { ...VISUAL, spectrum: late } });
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));
  customElements.define("late-wave-card", class extends StubVisual {});
  await customElements.whenDefined("late-wave-card");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const kids = children(card);
  assert.equal(kids.length, 1);
  assert.equal(kids[0].localName, "late-wave-card");
  assert.deepEqual(kids[0].config, late);
  assert.equal(kids[0].hass, given.get(card));
  assert.equal(q(card, ".eq canvas").style.display, "none");
});

test("with Home Assistant's card helpers the visual comes from createCardElement", async () => {
  const made = [];
  window.loadCardHelpers = async () => ({
    createCardElement: (config) => {
      made.push(config);
      const el = document.createElement("ambient-wave-card");
      el.setConfig(config);
      return el;
    },
  });
  try {
    const card = visualCard("level");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(made, [VISUAL.level]);
    const kids = children(card);
    assert.equal(kids.length, 1);
    assert.equal(kids[0].hass, given.get(card));
    // A switch while the helpers load creates only the selected config.
    setSelect(card, "spectrum");
    setSelect(card, "level");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(children(card).length, 1);
    assert.deepEqual(children(card)[0].config, VISUAL.level);
  } finally {
    delete window.loadCardHelpers;
  }
});

// ---- The visual inside the card's lifecycle: a kiosk tablet rebuilds its dashboard for weeks ----
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("built while detached, nothing draws until the card is connected", () => {
  frames = 0;
  const card = makeCard({ states: withSelect("spectrum"), config: { wave: true, visual: VISUAL } });
  assert.equal(children(card).length, 0);
  assert.equal(frames, 0);
  document.body.appendChild(card);
  assert.equal(children(card).length, 1);
});

test("disconnect then reconnect with a mounted child: one child, no loop while detached", () => {
  const card = visualCard("spectrum");
  const kid = children(card)[0];
  card.remove();
  frames = 0;
  setSelect(card, "spectrum");
  assert.equal(frames, 0);
  document.body.appendChild(card);
  assert.deepEqual(children(card), [kid]);
  assert.equal(frames, 0, "the own wave stays stopped");
});

test("a select change while disconnected starts no loop; reconnecting resumes from the current state", () => {
  const card = visualCard("spectrum");
  card.remove();
  frames = 0;
  setSelect(card, "classic");
  assert.equal(frames, 0, "no loop on the detached card");
  document.body.appendChild(card);
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));

  const other = visualCard("classic");
  other.remove();
  frames = 0;
  setSelect(other, "level");
  assert.equal(children(other).length, 0, "nothing mounted while detached");
  assert.equal(frames, 0);
  document.body.appendChild(other);
  assert.deepEqual(children(other)[0].config, VISUAL.level);
});

test("whenDefined resolving after disconnect mounts nothing, and the wait comes back on reconnect", async () => {
  const late = { ...VISUAL.spectrum, type: "custom:late-wave-card-detached" };
  const card = visualCard("spectrum", { visual: { ...VISUAL, spectrum: late } });
  card.remove();
  customElements.define("late-wave-card-detached", class extends StubVisual {});
  await tick();
  assert.equal(children(card).length, 0);
  document.body.appendChild(card);
  assert.equal(children(card)[0].localName, "late-wave-card-detached");
});

test("whenDefined resolving after a switch to classic mounts nothing", async () => {
  const late = { ...VISUAL.spectrum, type: "custom:late-wave-card-classic" };
  const card = visualCard("spectrum", { visual: { ...VISUAL, spectrum: late } });
  setSelect(card, "classic");
  customElements.define("late-wave-card-classic", class extends StubVisual {});
  await tick();
  assert.equal(children(card).length, 0);
  assert.ok(ownWave(card));
});

test("a loadCardHelpers rejection falls back to direct creation", async () => {
  window.loadCardHelpers = () => Promise.reject(new Error("no helpers"));
  try {
    const card = visualCard("level");
    assert.ok(ownWave(card), "the own wave draws meanwhile");
    await tick();
    const kids = children(card);
    assert.equal(kids.length, 1);
    assert.deepEqual(kids[0].config, VISUAL.level);
    assert.equal(kids[0].hass, given.get(card));
  } finally {
    delete window.loadCardHelpers;
  }
});

test("helpers resolving after disconnect mount nothing until the card is back", async () => {
  window.loadCardHelpers = async () => ({ createCardElement: (config) => {
    const el = document.createElement("ambient-wave-card"); el.setConfig(config); return el;
  } });
  try {
    const card = visualCard("level");
    card.remove();
    await tick();
    assert.equal(children(card).length, 0);
    document.body.appendChild(card);
    await tick();
    assert.equal(children(card).length, 1);
  } finally {
    delete window.loadCardHelpers;
  }
});
