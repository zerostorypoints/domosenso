// The facts about the home's media players the Media page and its picker share. Plain ES module:
// no DOM.
//
//   playersOf(config, hass) -> [{id, room}] every area's `media` player (the home's inputs), in the
//       rooms' order, then every other media player Home Assistant places in a room's HA area (its
//       own area, else its device's: the registries, as the area page finds sensors), in the same
//       order; once each. A found player that is unavailable, hidden, disabled or a diagnostic
//       entity is left out; a named one always stays.
//   chosenPlayer({config, settings, routeId, picked, hass}) -> {id, room} | undefined
//       the player the page shows: the one just picked on the page, else that of the area in the
//       route (#/media/<id>: Home's now playing), else the person's last choice (settings field
//       mediaPlayer), else the first one playing, else the first one
//   can(state, feature) -> boolean           whether the player reports that feature (FEATURES,
//       Home Assistant's MediaPlayerEntityFeature bits in supported_features)
//   progressOf(state, now) -> {position, duration} | null   the position now: media_position plus
//       the time since media_position_updated_at while playing, within the duration; null without
//       a duration
//   clock(seconds) -> "m:ss" or "h:mm:ss"

import { entityArea, haAreaOf, shownEntity } from "./sensors.js";

const GONE = new Set(["unavailable", "unknown"]);

export const FEATURES = Object.freeze({
  pause: 1, seek: 2, volume_set: 4, volume_mute: 8, previous: 16, next: 32, turn_on: 128, turn_off: 256, select_source: 2048, play: 16384,
});

// The media players of the entity registry with the HA area each stands in, once per registry.
const registered = new WeakMap();   // hass.entities -> {devices, list: [{id, areaId}]}

function registeredPlayers(hass) {
  const entities = hass?.entities;
  if (!entities) return [];
  const hit = registered.get(entities);
  if (hit && hit.devices === hass.devices) return hit.list;
  const list = [];
  for (const reg of Object.values(entities)) {
    if (!reg?.entity_id?.startsWith("media_player.") || !shownEntity(reg)) continue;
    const areaId = entityArea(hass, reg);
    if (areaId) list.push({ id: reg.entity_id, areaId });
  }
  registered.set(entities, { devices: hass.devices, list });
  return list;
}

export function playersOf(config, hass) {
  const seen = new Set();
  const players = [];
  const rooms = config?.rooms ?? [];
  for (const room of rooms) {
    for (const id of [room.media ?? []].flat()) {
      if (typeof id !== "string" || !id || seen.has(id)) continue;
      seen.add(id);
      players.push({ id, room });
    }
  }
  const found = registeredPlayers(hass);
  for (const room of rooms) {
    const areaId = haAreaOf(config, room);
    for (const { id, areaId: at } of found) {
      if (at !== areaId || seen.has(id)) continue;
      const state = hass.states?.[id];
      if (!state || GONE.has(state.state)) continue;
      seen.add(id);
      players.push({ id, room });
    }
  }
  return players;
}

export function chosenPlayer({ config, settings, routeId, picked, hass }) {
  const players = playersOf(config, hass);
  const byId = (id) => players.find((player) => player.id === id);
  return byId(picked)
    ?? players.find((player) => routeId != null && player.room.id === routeId)
    ?? byId(settings?.mediaPlayer)
    ?? players.find((player) => hass?.states?.[player.id]?.state === "playing")
    ?? players[0];
}

export function can(state, feature) {
  const bits = Number(state?.attributes?.supported_features);
  return Number.isFinite(bits) && (bits & FEATURES[feature]) !== 0;
}

export function progressOf(state, now = Date.now()) {
  const a = state?.attributes ?? {};
  const duration = Number(a.media_duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  let position = Number(a.media_position);
  if (!Number.isFinite(position)) position = 0;
  const at = Date.parse(a.media_position_updated_at);
  if (state.state === "playing" && Number.isFinite(at)) position += Math.max(0, (now - at) / 1000);
  return { position: Math.min(duration, Math.max(0, position)), duration };
}

export function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
