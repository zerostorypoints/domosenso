// Snappy controls: every control of the pocket (a light tile, All off, a scene, play/pause, any
// switch) sends its service call through one store, which shows the expected state at once,
// before Home Assistant reports it. Plain ES module: no DOM of its own.
//
//   const store = createOptimistic({ timeoutMs, report });
//   store.onChange = () => ...           // redraw: a send, a rollback (the shell re-routes)
//   store.send(el, hass, { domain, service, data, errorKey, expect })
//   store.update(hass) -> changed        // with each new hass: drops what Home Assistant reported
//   store.view(hass) -> hass             // hass with the expected states over the reported ones
//   store.pending(id) -> boolean         // an entity still waits for its report
//
// expect: {<entity id>: {state?, attributes?} | {changed: true}}: the state the call should give.
// {changed: true} is for an entity whose next state cannot be known (a scene's state is the time
// it last ran): it waits for any new state. A light group (an entity_id attribute) also expects
// its available members to follow, so every tile and count agrees at once.
//
// An expected entity is settled when Home Assistant reports
//   - the expected state (attributes within TOLERANCE): confirmed;
//   - a third state, neither the one before the call nor the expected one (a player that goes
//     idle on pause, a light that became unavailable): Home Assistant has spoken, it is followed.
// A report that still shows the state before the call (a group whose members switch one by one)
// keeps waiting. A call that fails, or one whose entities are not all settled after timeoutMs,
// rolls back what it still holds and reports errorKey once (report(el, key), by default the
// pocket-error event of lib/report.js). A later send for the same entity takes it over: the
// earlier call no longer reports for it.

import { reportError } from "./report.js";

export const CONFIRM_MS = 4000;
const TOLERANCE = { brightness: 3 };     // 0-255; brightness_pct rounds to 2.55 steps
const RAW = Symbol("raw hass");
const GONE = new Set(["unavailable", "unknown"]);

const raw = (hass) => hass?.[RAW] ?? hass;

// A light group's members that can follow it (lib/page-kit.js membersOf's attribute).
function membersOf(hass, id) {
  const members = hass?.states?.[id]?.attributes?.entity_id;
  if (!id.startsWith("light.") || !Array.isArray(members)) return [];
  return members.filter((m) => typeof m === "string" && hass.states[m] && !GONE.has(hass.states[m].state));
}

function matches(state, want) {
  if (!state) return false;
  if (want.state != null && state.state !== want.state) return false;
  return Object.entries(want.attributes ?? {}).every(([name, value]) => {
    const got = state.attributes?.[name];
    if (typeof value === "number" && typeof got === "number") return Math.abs(got - value) <= (TOLERANCE[name] ?? 0);
    return got === value;
  });
}

export function createOptimistic({ timeoutMs = CONFIRM_MS, report = reportError } = {}) {
  const held = new Map();      // entity id -> {want, from, sendId}
  let sends = 0;
  let version = 0;
  let cache = null;

  const changed = () => { version += 1; store.onChange?.(); };

  // Drops what call sendId still holds; true when it held anything.
  function rollback(sendId) {
    let dropped = false;
    for (const [id, entry] of held) {
      if (entry.sendId === sendId) { held.delete(id); dropped = true; }
    }
    return dropped;
  }

  function settled(state, entry) {
    if (entry.want.changed) return !!state && state !== entry.fromObject;
    if (matches(state, entry.want)) return true;
    if (!state) return true;
    return entry.want.state != null && state.state !== entry.from && state.state !== entry.want.state;
  }

  const store = {
    onChange: null,
    timeoutMs,

    send(el, hass, { domain, service, data = {}, errorKey, expect = {} }) {
      const real = raw(hass);
      const sendId = ++sends;
      const wanted = { ...expect };
      for (const [id, want] of Object.entries(expect)) {
        if (want.changed) continue;
        for (const member of membersOf(real, id)) wanted[member] ??= want;
      }
      for (const [id, want] of Object.entries(wanted)) {
        const state = real?.states?.[id];
        if (!state || (!want.changed && matches(state, want))) { held.delete(id); continue; }
        held.set(id, { want, from: state.state, fromObject: state, sendId });
      }
      const fail = () => {
        const dropped = rollback(sendId);
        if (dropped) changed();
        report(el, errorKey);
      };
      let result;
      try {
        result = real.callService(domain, service, data);
      } catch (err) {
        result = Promise.reject(err);
      }
      result?.catch?.(() => fail());
      const timer = setTimeout(() => {
        if (!rollback(sendId)) return;
        changed();
        report(el, errorKey);
      }, store.timeoutMs);
      timer?.unref?.();     // node (the tests): a pending check does not hold the process
      changed();
    },

    update(hass) {
      const real = raw(hass);
      let dropped = false;
      for (const [id, entry] of held) {
        if (settled(real?.states?.[id], entry)) { held.delete(id); dropped = true; }
      }
      if (dropped) version += 1;
      return dropped;
    },

    view(hass) {
      const real = raw(hass);
      if (!real || held.size === 0) return real;
      if (cache?.real === real && cache.version === version) return cache.view;
      const states = { ...real.states };
      for (const [id, { want }] of held) {
        const state = states[id];
        if (!state || want.changed) continue;
        states[id] = { ...state, state: want.state ?? state.state,
          attributes: { ...state.attributes, ...want.attributes } };
      }
      const view = { ...real, states, [RAW]: real };
      cache = { real, version, view };
      return view;
    },

    pending(id) {
      return held.has(id);
    },
  };
  return store;
}
