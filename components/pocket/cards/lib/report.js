// A failed action, told to the shell: pages and tiles fire pocket-error with a translation key and
// the shell (pocket-app.js) shows its text as a short toast (spec 6.5). Bubbles out of shadow roots.

export function reportError(el, key) {
  const event = new Event("pocket-error", { bubbles: true, composed: true });
  event.detail = { key };
  el.dispatchEvent(event);
}
