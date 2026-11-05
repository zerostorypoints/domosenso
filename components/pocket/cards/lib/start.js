// "Open Pocket when the app starts" on one device. Home Assistant (2026.9) keeps the default
// dashboard per user (hass.userData.default_panel): it follows the person to every phone and
// browser. This is per device: the choice lives in this browser's (this Companion app's) local
// storage, and pocket-app.js, a dashboard resource that every Lovelace dashboard loads, moves to
// the pocket once when the app has just started on another dashboard. Turning it off removes the
// key: Home Assistant opens as it would. Plain ES module; the window is passed in for the tests.
//
//   startTarget(win) -> path | null     the pocket's dashboard this device opens at start
//   setStartHere(win, on)               on: this dashboard (its first path segment); off: none
//   redirectAtStart(win) -> boolean     moves to the target when (all of) the device has one, this
//       is the first dashboard of this app session (sessionStorage), the page loaded less than
//       START_WINDOW_MS ago (a later visit to a dashboard is the person's choice), and it is
//       neither the target nor a settings or profile page; HA's own navigation (location-changed),
//       no reload

export const KEY = "domosenso-pocket-start";
const SESSION_KEY = "domosenso-pocket-started";
export const START_WINDOW_MS = 15000;

const store = (win, kind) => {
  try {
    return win[kind];
  } catch {
    return null;   // storage blocked (a private window)
  }
};

export function startTarget(win) {
  const value = store(win, "localStorage")?.getItem(KEY);
  return typeof value === "string" && /^\/[\w-]+$/.test(value) ? value : null;
}

export function setStartHere(win, on) {
  const local = store(win, "localStorage");
  if (!local) return;
  if (on) local.setItem(KEY, `/${win.location.pathname.split("/")[1]}`);
  else local.removeItem(KEY);
}

export function redirectAtStart(win) {
  const target = startTarget(win);
  const session = store(win, "sessionStorage");
  if (!target || !session || session.getItem(SESSION_KEY)) return false;
  session.setItem(SESSION_KEY, "1");
  if ((win.performance?.now?.() ?? Infinity) > START_WINDOW_MS) return false;
  const path = win.location.pathname;
  if (path === target || path.startsWith(`${target}/`) || /^\/(config|profile|developer-tools)(\/|$)/.test(path)) return false;
  win.history.replaceState(null, "", target);
  const event = new Event("location-changed", { bubbles: true, composed: true });
  event.detail = { replace: true };
  win.dispatchEvent(event);
  return true;
}
