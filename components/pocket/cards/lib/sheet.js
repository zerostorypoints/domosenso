// The bottom sheet: one at a time, owned by the shell (pocket-app.js), which puts it over the page
// and the bar. A page opens one through ctx.openSheet(spec); the shell picks the sheet's content by
// spec.kind (lib/trend-sheet.js for "trend") and hands it here.
//
//   createSheet(host, {t}) -> sheet       builds the layer once, inside host (the shell's .app)
//   sheet.open(content, label)            shows content (an element) under a grab handle and a
//                                         close button; label names the dialog for screen readers
//   sheet.close()                         closes it as the person would (Back's history entry too)
//   sheet.dismiss()                       closes it without touching history (the route changed)
//   sheet.isOpen, sheet.content           whether a sheet shows, and its content element
//   sheet.onClose                         called after every close
//
// It closes by
//   - a drag down on the grab handle of at least CLOSE_PX (shorter ones spring back),
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
                        overscroll-behavior: contain; padding: 0 16px calc(16px + var(--safe, 0px));
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
    open(content, label) {
      // A sheet in place of an open one takes over its history entry: one Back still closes it.
      const replace = sheet.isOpen && window.history.state?.[STATE_KEY] === sheet.token;
      if (sheet.isOpen) hide();
      sheet.opener = activeIn(host);
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
    },
    close() {
      if (!sheet.isOpen) return;
      const ours = window.history.state?.[STATE_KEY] === sheet.token;
      hide();
      // The popstate this fires finds the sheet closed and does nothing.
      if (ours) window.history.back();
    },
    dismiss() {
      if (sheet.isOpen) hide();
    },
  };

  function hide() {
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
  sheet.onPopState = () => {
    if (sheet.isOpen && window.history.state?.[STATE_KEY] !== sheet.token) hide();
  };

  // The drag down: the sheet follows the finger, never above where it opened.
  let drag = null;
  grab.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
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

  return sheet;
}

// The focused element inside host's shadow root (or the document): the sheet gives focus back to it.
function activeIn(host) {
  const root = host.getRootNode?.();
  return root?.activeElement ?? document.activeElement ?? null;
}
