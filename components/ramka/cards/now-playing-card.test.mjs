import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./now-playing-card.js";

afterEach(() => mock.timers.reset());

const NOW = "2026-10-20T12:00:00Z";
const ENTITY = "media_player.living_room";

// Only what a Chromecast or DLNA player reports: no app_name, volume, quality or source.
const generic = (state, extra = {}) => ({
  state, attributes: { media_title: "Blue in Green", media_artist: "Miles Davis", ...extra },
});

function makeCard({ lang = "en", player = generic("playing"), states = {}, config = {} } = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const card = document.createElement("now-playing-card");
  card.setConfig({ entity: ENTITY, ...config });
  card.hass = { locale: { language: lang }, hassUrl: (p) => `http://ha.local${p}`, states: { [ENTITY]: player, ...states } };
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
