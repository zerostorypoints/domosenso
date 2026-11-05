// The bottom sheet: one shown at a time (others may wait under it), owned by the shell (pocket-app.js), which puts it over the page
// and the bar. A page opens one through ctx.openSheet(spec); the shell picks the sheet's content by
// spec.kind (lib/trend-sheet.js for "trend") and hands it here.
//
//   createSheet(host, {t}) -> sheet       builds the layer once, inside host (the shell's .app)
//   sheet.open(content, label, {stack?}) shows content (an element) under a grab handle and a
//                                         close button; label names the dialog for screen readers.
//                                         stack: on top of the open sheet (a detail sheet's row
//                                         opening its trend): a close or Back comes back to the one
//                                         under it, its content as it was, focus on what opened
//                                         the top one; without, in place of the open sheet
//   sheet.close()                         closes the top sheet as the person would (Back's history
//                                         entry too)
//   sheet.dismiss()                       closes it without going back (the route changed); a
//                                         sheet's state left on the current entry is replaced away
//   sheet.ownsEntry()                     whether the current history entry is the open sheet's
//   sheet.clearStale()                    with no sheet open, replaces a sheet's state left on the
//                                         current entry (a reload, a return to the dashboard)
//   sheet.isOpen, sheet.content           whether a sheet shows, and its content element
//   sheet.onClose                         called after every close
//   sheet.onRestore                       called with the content shown again when a stacked sheet
//                                         closes (the shell patches it with the current state)
//
// It closes by
//   - a drag down of at least CLOSE_PX (shorter ones spring back): on the grab handle, or a finger
//     anywhere on the sheet while its content is scrolled to the top (a drag that starts sideways,
//     or on a control that drags itself, a [data-drag] slider, is left to it). While the sheet is
//     open a finger on it or on the dimmed page never reaches the page behind, so the phone's
//     pull-to-refresh does not start under it;
//   - the close button (44 px), a tap on the dimmed page above it, Escape,
//   - the phone's back gesture: open pushes a history entry (same URL, a state that names this
//     sheet), so Back pops it and the sheet closes; Back again leaves as before. A close by the
//     button or the handle goes back over that entry, so it never lingers.

const CLOSE_PX = 72;
const STATE_KEY = "pocketSheet";

export const SHEET_STYLE = `
  .sheet-layer { position: fixed; inset: 0; z-index: 6; }
  .sheet-layer[hidden] { display: none; }
  .sheet-layer .scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .32); }
  .sheet-layer .sheet { position: absolute; left: var(--mdc-drawer-width, 0px); right: 0; bottom: 0;
                        box-sizing: border-box; max-height: 88vh; max-height: 88dvh; overflow-y: auto;
                        overscroll-behavior: none; padding: 0 16px calc(16px + var(--safe, 0px));
                        background: var(--card); color: var(--fg); border-radius: 22px 22px 0 0;
                        box-shadow: 0 -8px 30px rgba(0, 0, 0, .18);
                        animation: pocket-sheet-up .22s ease-out; }
  .sheet-layer .sheet.dragging { animation: none; transition: none; }
  .sheet-layer .sheet.settle { transition: transform .18s ease-out; }
  @keyframes pocket-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .sheet-layer .sheet { animation: none; } }
  .sheet-layer .head { display: flex; align-items: center;
                       margin: 0 -16px; background: var(--card); }
  /* The handle is the whole strip left of the close button: a finger finds it without aiming. */
  .sheet-layer .grab { flex: 1; min-height: 44px; display: flex; align-items: center; justify-content: center;
                       padding-left: 60px; touch-action: none; cursor: grab; }
  .sheet-layer .grab i { width: 38px; height: 5px; border-radius: 3px; background: var(--line); }
  .sheet-layer .close { flex: 0 0 auto; width: 44px; height: 44px; margin: 0 8px 0 8px; padding: 0; border: 0;
                        border-radius: 50%; background: none; color: var(--mut); cursor: pointer;
                        display: flex; align-items: center; justify-content: center; --mdc-icon-size: 22px; }
  .sheet-layer .close:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
`;

let serial = 0;

export function createSheet(host, { t } = {}) {
  const layer = document.createElement("div");
  layer.className = "sheet-layer";
  layer.hidden = true;
  layer.innerHTML = `
    <div class="scrim"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="head"><div class="grab" data-drag><i></i></div>
        <button class="close" type="button"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="body"></div>
    </div>`;
  host.append(layer);
  const panel = layer.querySelector(".sheet");
  const body = layer.querySelector(".body");
  const grab = layer.querySelector(".grab");
  const closeButton = layer.querySelector(".close");

  const sheet = {
    isOpen: false,
    content: null,
    onClose: null,
    token: null,
    t,
    open(content, label, { stack = false } = {}) {
      // On top of the open sheet: it is kept, with its history entry, under a new one.
      if (stack && sheet.isOpen) {
        layers.push({ content: sheet.content, label: panel.getAttribute("aria-label") ?? "", token: sheet.token,
          focus: activeIn(host) });
        show(content, label, false);
        return;
      }
      // A sheet in place of an open one takes over its history entry: one Back still closes it.
      const replace = sheet.isOpen && window.history.state?.[STATE_KEY] === sheet.token;
      if (sheet.isOpen) hide();
      sheet.opener = activeIn(host);
      show(content, label, replace);
    },
    close() {
      if (!sheet.isOpen) return;
      const ours = window.history.state?.[STATE_KEY] === sheet.token;
      if (layers.length) pop();
      else hide();
      // The popstate this fires finds the sheet under it (its own entry) or none, and does nothing.
      if (ours) window.history.back();
    },
    dismiss() {
      if (sheet.isOpen) hide();
      sheet.clearStale();
    },
    ownsEntry() {
      return sheet.isOpen && window.history.state?.[STATE_KEY] === sheet.token;
    },
    clearStale() {
      if (sheet.isOpen || !window.history.state?.[STATE_KEY]) return;
      try {
        window.history.replaceState(null, "", window.location.href);
      } catch { /* nothing to clear */ }
    },
  };

  const layers = [];          // the sheets under the top one: {content, label, token, focus}

  function show(content, label, replace) {
    sheet.isOpen = true;
    sheet.content = content;
    sheet.token = `s${++serial}`;
    body.replaceChildren(content);
    panel.setAttribute("aria-label", label ?? "");
    closeButton.setAttribute("aria-label", sheet.t ? sheet.t("card.pocket.sheet.close") : "");
    panel.style.transform = "";
    layer.hidden = false;
    // A state of its own, not a copy of the current one: Home Assistant reads a "dialog" key in
    // history states, and a copied one would open that dialog again on Back.
    try {
      const state = { [STATE_KEY]: sheet.token };
      if (replace) window.history.replaceState(state, "", window.location.href);
      else window.history.pushState(state, "", window.location.href);
    } catch { /* a history without pushState: Back simply leaves the page */ }
    closeButton.focus?.();
  }

  // The sheet under the top one comes back as it was; focus returns to the row that opened the top.
  function pop() {
    const layer = layers.pop();
    const top = sheet.content;
    sheet.content = layer.content;
    sheet.token = layer.token;
    body.replaceChildren(layer.content);
    panel.setAttribute("aria-label", layer.label);
    panel.style.transform = "";
    sheet.onClose?.(top);
    sheet.onRestore?.(layer.content);
    (layer.focus?.isConnected ? layer.focus : closeButton).focus?.();
  }

  function hide() {
    layers.length = 0;
    sheet.isOpen = false;
    sheet.token = null;
    layer.hidden = true;
    const content = sheet.content;
    sheet.content = null;
    body.replaceChildren();
    sheet.onClose?.(content);
    sheet.opener?.focus?.();
    sheet.opener = null;
  }

  closeButton.addEventListener("click", () => sheet.close());
  layer.querySelector(".scrim").addEventListener("click", () => sheet.close());
  layer.addEventListener("keydown", (e) => { if (e.key === "Escape") sheet.close(); });
  // Back: to the stacked sheet whose entry it lands on, else closed.
  sheet.onPopState = () => {
    if (!sheet.isOpen) return;
    const token = window.history.state?.[STATE_KEY];
    if (token === sheet.token) return;
    const at = layers.findIndex((layer) => layer.token === token);
    if (at === -1) {
      hide();
      return;
    }
    layers.length = at + 1;
    pop();
  };

  // The drag down: the sheet follows the finger, never above where it opened.
  let drag = null;
  grab.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.pointerType === "touch") return;     // a finger: the touch drag below
    drag = { y: e.clientY, dy: 0 };
    grab.setPointerCapture?.(e.pointerId);
    panel.classList.remove("settle");
    panel.classList.add("dragging");
  });
  grab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    panel.style.transform = `translateY(${drag.dy}px)`;
  });
  const end = (e, cancelled) => {
    if (!drag) return;
    const dy = cancelled ? 0 : Math.max(0, e.clientY - drag.y);
    drag = null;
    panel.classList.remove("dragging");
    if (dy >= CLOSE_PX) {
      sheet.close();
      return;
    }
    panel.classList.add("settle");
    panel.style.transform = "";
  };
  grab.addEventListener("pointerup", (e) => end(e, false));
  grab.addEventListener("pointercancel", (e) => end(e, true));

  // A finger: the whole sheet drags it down while its content is at the top. Non-passive, so the
  // move can be kept from the page (its scroll and pull-to-refresh).
  let touch = null;
  const ownDrag = (e) => e.composedPath().some((node) => node !== grab && node?.hasAttribute?.("data-drag"));
  panel.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest?.(".close") || ownDrag(e)) {
      touch = null;
      return;
    }
    const p = e.touches[0];
    touch = { x: p.clientX, y: p.clientY, top: panel.scrollTop <= 0, dragging: false, dy: 0 };
  }, { passive: true });
  panel.addEventListener("touchmove", (e) => {
    if (!touch) return;
    const p = e.touches[0];
    const dx = p.clientX - touch.x;
    const dy = p.clientY - touch.y;
    if (!touch.dragging) {
      // Down and more down than sideways, from the top of the content: the sheet's drag.
      if (!touch.top || panel.scrollTop > 0 || dy <= 4 || Math.abs(dx) > dy) {
        if (Math.abs(dy) > 4 || Math.abs(dx) > 4) touch = null;   // a scroll or a sideways drag
        return;
      }
      touch.dragging = true;
      touch.y = p.clientY;
      panel.classList.remove("settle");
      panel.classList.add("dragging");
    }
    e.preventDefault();
    touch.dy = Math.max(0, p.clientY - touch.y);
    panel.style.transform = `translateY(${touch.dy}px)`;
  }, { passive: false });
  const touchEnd = (cancelled) => {
    const t = touch;
    touch = null;
    if (!t?.dragging) return;
    panel.classList.remove("dragging");
    if (!cancelled && t.dy >= CLOSE_PX) {
      sheet.close();
      return;
    }
    panel.classList.add("settle");
    panel.style.transform = "";
  };
  panel.addEventListener("touchend", () => touchEnd(false));
  panel.addEventListener("touchcancel", () => touchEnd(true));
  // The dimmed page: a finger there moves nothing behind it (a tap still closes the sheet).
  layer.querySelector(".scrim").addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  return sheet;
}

// The focused element inside host's shadow root (or the document): the sheet gives focus back to it.
function activeIn(host) {
  const root = host.getRootNode?.();
  return root?.activeElement ?? document.activeElement ?? null;
}
