// "Open Pocket when the app starts" on one device (lib/start.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY, START_WINDOW_MS, redirectAtStart, setStartHere, startTarget } from "./start.js";

function fakeWindow(path, { now = 1000 } = {}) {
  const storage = () => {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  };
  const events = [];
  const win = {
    localStorage: storage(), sessionStorage: storage(), performance: { now: () => now },
    location: { pathname: path },
    history: { replaceState: (_s, _t, url) => { win.location.pathname = url; } },
    dispatchEvent: (event) => events.push(event.type),
    events,
  };
  return win;
}

test("on: this dashboard is the device's start; off: none", () => {
  const win = fakeWindow("/dashboard-pocket/home");
  assert.equal(startTarget(win), null);
  setStartHere(win, true);
  assert.equal(win.localStorage.getItem(KEY), "/dashboard-pocket");
  assert.equal(startTarget(win), "/dashboard-pocket");
  setStartHere(win, false);
  assert.equal(startTarget(win), null);
});

test("at the app's start on another dashboard: once to the pocket, by HA's navigation", () => {
  const win = fakeWindow("/home/overview");
  win.localStorage.setItem(KEY, "/dashboard-pocket");
  assert.equal(redirectAtStart(win), true);
  assert.equal(win.location.pathname, "/dashboard-pocket");
  assert.deepEqual(win.events, ["location-changed"]);
  win.location.pathname = "/home/overview";
  assert.equal(redirectAtStart(win), false, "once per app session: a later visit is the person's");
});

test("never: without the choice, late in the session, on the pocket itself or on a settings page", () => {
  assert.equal(redirectAtStart(fakeWindow("/home/overview")), false);
  for (const [path, now] of [["/home/overview", START_WINDOW_MS + 1], ["/dashboard-pocket/home", 10], ["/config/areas", 10], ["/profile/general", 10]]) {
    const win = fakeWindow(path, { now });
    win.localStorage.setItem(KEY, "/dashboard-pocket");
    assert.equal(redirectAtStart(win), false, path);
    assert.equal(win.location.pathname, path);
  }
});
