// A dropdown of colours, for every place a setting picks one of the Ramka's named colours (the
// settings page's colour rows, ramka-colour-select-row; a Custom widget's dialog, climate-rooms-card):
// a button with the chosen colour's dot and name, and a list of every choice, each with its dot.
// The dot is the climate picker's swatch (SWATCH_CSS: the same class, size and shape), so a colour
// looks the same wherever it is chosen and wherever it shows.
//
// The list is an overlay: position fixed, in the top layer as a popover where the browser has one
// (above a modal dialog too), below the button or above it when there is no room below, kept inside
// the viewport; it scrolls when it is taller than the room. No layout moves when it opens.
// Pointer and touch: a tap on the button opens or closes it, a tap on a choice picks it, a tap
// elsewhere or a scroll of the page closes it. Keyboard: the button is a listbox button (Enter,
// Space or an arrow key opens the list on the chosen one); in the list the arrows, Home and End move,
// Enter or Space picks, Escape closes it (and only it, not a dialog around it), Tab closes it.
// Names are set with textContent: the caller passes them in the page's language.
// Plain ES module: no imports; the DOM of the document it runs in.

// The dot. `.empty`: a choice without a colour of its own (an outline).
export const SWATCH_CSS = `
  .swatch { width: 14px; height: 14px; border-radius: 50%; box-sizing: border-box; flex: none; display: inline-block; }
  .swatch.empty { border: 2px solid var(--primary-text-color); }`;

// The dropdown's own rules; a shadow root that holds one adds them to its style once.
export const COLOUR_LIST_CSS = `${SWATCH_CSS}
  .colour-select { display: inline-block; min-width: 0; max-width: 100%; }
  .colour-value {
    display: flex; align-items: center; gap: 10px; box-sizing: border-box; width: 100%; min-height: 40px;
    padding: 6px 8px 6px 12px; font: inherit; text-align: start; cursor: pointer;
    color: var(--primary-text-color); background: var(--card-background-color, transparent);
    border: 1px solid var(--divider-color); border-radius: 6px; -webkit-tap-highlight-color: transparent;
  }
  .colour-value:disabled { opacity: 0.5; cursor: default; }
  .colour-value .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .colour-value ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  .colour-options {
    position: fixed; z-index: 10000; inset: auto; left: 0; top: 0; margin: 0; padding: 4px 0;
    box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; text-align: start;
    background: var(--card-background-color, var(--secondary-background-color));
    color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }
  .colour-options[hidden] { display: none; }
  .colour-option {
    display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 14px; cursor: pointer;
    white-space: nowrap; outline: none; -webkit-tap-highlight-color: transparent;
  }
  .colour-option:hover, .colour-option:focus-visible, .colour-option:focus { background: var(--secondary-background-color); }
  .colour-option[aria-selected="true"] { font-weight: 600; }`;

// The gap between the button and the list, and the list's least distance to the viewport edge.
const GAP = 4;
const MARGIN = 8;

// Where the list goes: below the anchor (the button's rect), or above it when it does not fit below
// and there is more room above; at the anchor's left edge, at least the anchor's width, clamped to
// the viewport; `maxHeight` the room on that side (the list scrolls beyond it).
export function placeList(anchor, size, viewport) {
  const roomBelow = viewport.height - MARGIN - (anchor.bottom + GAP);
  const roomAbove = anchor.top - GAP - MARGIN;
  const side = size.height > roomBelow && roomAbove > roomBelow ? "above" : "below";
  const maxHeight = Math.max(0, Math.floor(side === "below" ? roomBelow : roomAbove));
  const height = Math.min(size.height, maxHeight);
  const top = side === "below" ? anchor.bottom + GAP : anchor.top - GAP - height;
  const width = Math.max(size.width, anchor.right - anchor.left);
  const left = Math.max(MARGIN, Math.min(anchor.left, viewport.width - MARGIN - width));
  return { left: Math.round(left), top: Math.round(top), minWidth: Math.round(anchor.right - anchor.left), maxHeight, side };
}

const popoverOpen = (el) => {
  try { return el.matches(":popover-open"); } catch { return false; }
};

let lists = 0;

// A colour dropdown. `options`: [{value, text, colour}] in order, `colour` a CSS colour or null (an
// outlined dot); `value` the chosen one; `label` what it chooses (the button's name for a screen
// reader, with the chosen name); `onSelect(value)` after a pick that changed the value.
// Returns {element, setValue, setOptions, setDisabled, close, isOpen}.
export function colourList({ options = [], value = "", label = "", onSelect = () => {} } = {}) {
  const doc = document;
  const id = `colour-list-${++lists}`;
  const element = doc.createElement("div");
  element.className = "colour-select";
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "colour-value";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id);
  const dot = doc.createElement("span");
  const text = doc.createElement("span");
  text.className = "text";
  const caret = doc.createElement("ha-icon");
  caret.setAttribute("icon", "mdi:menu-down");
  caret.setAttribute("aria-hidden", "true");
  button.append(dot, text, caret);
  const list = doc.createElement("div");
  list.id = id;
  list.className = "colour-options";
  list.setAttribute("role", "listbox");
  list.setAttribute("popover", "manual");
  list.hidden = true;
  element.append(button, list);

  let current = value;
  let items = [];
  let open = false;

  const paintDot = (el, colour) => {
    el.className = colour ? "swatch" : "swatch empty";
    el.style.background = colour || "transparent";
  };
  const optionOf = (v) => options.find((o) => o.value === v);

  function paint() {
    const o = optionOf(current);
    paintDot(dot, o ? o.colour : null);
    text.textContent = o ? o.text : String(current ?? "");
    button.setAttribute("aria-label", label ? `${label}: ${text.textContent}` : text.textContent);
    for (const item of items) item.setAttribute("aria-selected", String(item.dataset.value === current));
  }

  function build() {
    items = options.map((o) => {
      const item = doc.createElement("div");
      item.className = "colour-option";
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.dataset.value = o.value;
      const swatch = doc.createElement("span");
      paintDot(swatch, o.colour);
      const name = doc.createElement("span");
      name.textContent = o.text;
      item.append(swatch, name);
      item.addEventListener("click", () => pick(o.value));
      return item;
    });
    list.replaceChildren(...items);
    if (label) list.setAttribute("aria-label", label);
    paint();
  }

  function pick(v) {
    const changed = v !== current;
    current = v;
    paint();
    close(true);
    if (changed) onSelect(v);
  }

  const inside = (ev) => (typeof ev.composedPath === "function" ? ev.composedPath() : []).includes(element);
  const onOutside = (ev) => { if (!inside(ev)) close(false); };
  // A scroll of the page or a scroller around it would leave the list behind; its own does not.
  const onScroll = (ev) => {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    if (!path.includes(list)) close(false);
  };
  const onResize = () => close(false);

  function place() {
    list.style.maxHeight = "";
    const size = list.getBoundingClientRect();
    const at = placeList(button.getBoundingClientRect(), { width: size.width, height: size.height },
                         { width: window.innerWidth, height: window.innerHeight });
    list.style.left = `${at.left}px`;
    list.style.top = `${at.top}px`;
    list.style.minWidth = `${at.minWidth}px`;
    list.style.maxHeight = `${at.maxHeight}px`;
    list.dataset.side = at.side;
  }

  function show() {
    if (open || button.disabled) return;
    open = true;
    list.hidden = false;
    if (typeof list.showPopover === "function" && !popoverOpen(list)) {
      try { list.showPopover(); } catch { /* not connected: plain fixed position */ }
    }
    button.setAttribute("aria-expanded", "true");
    place();
    doc.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    (items.find((i) => i.dataset.value === current) || items[0])?.focus();
  }

  function close(focusButton) {
    if (!open) return;
    open = false;
    if (typeof list.hidePopover === "function" && popoverOpen(list)) {
      try { list.hidePopover(); } catch { /* already closed */ }
    }
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    if (focusButton) button.focus();
  }

  button.addEventListener("click", () => (open ? close(true) : show()));
  button.addEventListener("keydown", (ev) => {
    if (["ArrowDown", "ArrowUp"].includes(ev.key)) {
      ev.preventDefault();
      show();
    }
  });
  list.addEventListener("keydown", (ev) => {
    const at = items.indexOf(ev.target);
    const go = (n) => items[Math.max(0, Math.min(items.length - 1, n))]?.focus();
    switch (ev.key) {
      case "ArrowDown": go(at + 1); break;
      case "ArrowUp": go(at - 1); break;
      case "Home": go(0); break;
      case "End": go(items.length - 1); break;
      case "Enter":
      case " ":
        if (at >= 0) pick(items[at].dataset.value);
        break;
      case "Escape": close(true); ev.stopPropagation(); break;
      case "Tab": close(false); return;  // focus moves on as usual
      default: return;
    }
    ev.preventDefault();
  });

  build();
  return {
    element,
    setValue(v) { current = v; paint(); },
    setOptions(next) { options = next; build(); },
    setDisabled(on) { button.disabled = Boolean(on); if (on) close(false); },
    close: () => close(false),
    isOpen: () => open,
    get value() { return current; },
  };
}
