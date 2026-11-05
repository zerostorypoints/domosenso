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
//   - the expected state, attributes within TOLERANCE (a light that clamps the brightness it is
//     sent lands close to it); an attribute the light does not report at all (an on/off light in
//     a dimmed group) is not waited for, and an entity that cannot dim (supported_color_modes is
//     onoff alone) is only expected on;
//   - a third state, neither the one before the call nor the expected one (a player that goes
//     idle on pause, a light that became unavailable): Home Assistant has spoken, it is followed.
// A report that still shows the state before the call (a group whose members switch one by one)
// keeps waiting. A call that fails, or one whose entities are not all settled after timeoutMs,
// rolls back what it still holds and reports errorKey once (report(el, key), by default the
// pocket-error event of lib/report.js). A later send for the same entity takes it over: the
// earlier call no longer rolls it back or reports for it. A rejected call reports unless a later
// one took over one of its entities (even one that held nothing: a call to an entity already in
// the expected state can still fail); a timeout reports only when it drops something still held.
// A send whose expected state is already the reported one while an earlier call still holds the
// entity (a second tap before the first one's report) keeps holding it quietly: the first call's
// late report does not flash on screen. It settles on a new report of the expected state; when
// none comes, the wait ends without a toast (the reported state was right all along).

import { reportError } from "./report.js";

export const CONFIRM_MS = 4000;
const TOLERANCE = { brightness: 8 };     // 0-255: about 3 %, for rounding and lights that clamp
const RAW = Symbol("raw hass");
const GONE = new Set(["unavailable", "unknown"]);

const raw = (hass) => hass?.[RAW] ?? hass;

// A light group's members that can follow it (lib/page-kit.js membersOf's attribute).
function membersOf(hass, id) {
  const members = hass?.states?.[id]?.attributes?.entity_id;
  if (!id.startsWith("light.") || !Array.isArray(members)) return [];
  return members.filter((m) => typeof m === "string" && hass.states[m] && !GONE.has(hass.states[m].state));
}

// What an entity can be expected to report: an on/off-only light reports no brightness.
function wantFor(state, want) {
  const modes = state?.attributes?.supported_color_modes;
  const onOff = Array.isArray(modes) && modes.length > 0 && modes.every((mode) => mode === "onoff");
  if (!onOff || want.attributes?.brightness == null) return want;
  const { brightness, ...attributes } = want.attributes;
  return { ...want, attributes };
}

function matches(state, want) {
  if (!state) return false;
  if (want.state != null && state.state !== want.state) return false;
  return Object.entries(want.attributes ?? {}).every(([name, value]) => {
    const got = state.attributes?.[name];
    if (got == null) return true;      // not reported by this entity: nothing to wait for
    if (typeof value === "number" && typeof got === "number") return Math.abs(got - value) <= (TOLERANCE[name] ?? 0);
    return got === value;
  });
}

export function createOptimistic({ timeoutMs = CONFIRM_MS, report = reportError } = {}) {
  const held = new Map();      // entity id -> {want, from, fromObject, sendId, quiet}
  let sends = 0;
  let version = 0;
  let cache = null;
  // Both bounded by the calls in flight: a send leaves them when its call settles.
  const inFlight = new Set();    // sends whose service call has not settled yet
  const overtaken = new Set();   // of those, the ones a later send took an entity over from

  const changed = () => { version += 1; store.onChange?.(); };

  // Drops what call sendId still holds. Returns whether it held anything that tells of a
  // failure: on a timeout, a quiet hold (the reported state was already the expected one) does not.
  function rollback(sendId, { timeout = false } = {}) {
    let dropped = false;
    let failed = false;
    for (const [id, entry] of held) {
      if (entry.sendId !== sendId) continue;
      held.delete(id);
      dropped = true;
      if (!timeout || !entry.quiet) failed = true;
    }
    return { dropped, failed };
  }

  function settled(state, entry) {
    if (entry.want.changed) return !!state && state !== entry.fromObject;
    if (entry.quiet) return !state || (state !== entry.fromObject && matches(state, entry.want));
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
      for (const [id, given] of Object.entries(wanted)) {
        const state = real?.states?.[id];
        const want = given.changed ? given : wantFor(state, given);
        const earlier = held.get(id);
        if (earlier && inFlight.has(earlier.sendId)) overtaken.add(earlier.sendId);
        if (!state) { held.delete(id); continue; }
        if (!want.changed && matches(state, want)) {
          // Already reported as wanted: hold it only while an earlier call's report may still come.
          if (earlier) held.set(id, { want, from: state.state, fromObject: state, sendId, quiet: true });
          continue;
        }
        held.set(id, { want, from: state.state, fromObject: state, sendId, quiet: false });
      }
      let reported = false;
      const end = ({ timeout = false } = {}) => {
        const { dropped, failed } = rollback(sendId, { timeout });
        if (dropped) changed();
        const tell = timeout ? failed : !overtaken.has(sendId);
        if (tell && !reported) {
          reported = true;
          report(el, errorKey);
        }
      };
      let result;
      try {
        result = real.callService(domain, service, data);
      } catch (err) {
        result = Promise.reject(err);
      }
      // The taken-over mark lives as long as the call: a rejection after the timeout still
      // knows whether a later send owns the entity now.
      const settle = () => { inFlight.delete(sendId); overtaken.delete(sendId); };
      if (typeof result?.then === "function") {
        inFlight.add(sendId);
        result.then(settle, () => { end(); settle(); });
      }
      const timer = setTimeout(() => end({ timeout: true }), store.timeoutMs);
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
