// The editor's tray: the sensors not on the plan, one collapsible group per room. A group's summary
// is dragged like an item (the card places the whole group); `isOpen(key)` is the card's memory of
// which groups are open, so a re-render keeps them.

import { candidateName } from "./plan.js";
import { categoryById, colourOf } from "./categories.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// The category's colour before the name (catalog colours only, so safe in a style attribute).
const dot = (c) => {
  const cat = categoryById(c.category);
  return cat ? `<span class="dot" style="background: ${colourOf(cat)}"></span>` : "";
};

export function trayHtml(hass, t, groups, isOpen) {
  const title = `<h3>${esc(t(hass, "card.floorplan.tray.title"))}</h3>`;
  if (!groups.length) return `${title}<div>${esc(t(hass, "card.floorplan.tray.empty"))}</div>`;
  const drag = esc(t(hass, "card.floorplan.tray.drag"));
  const dragGroup = esc(t(hass, "card.floorplan.tray.drag_group"));
  return title + groups.map((g) => {
    const key = esc(g.key);
    const name = esc(g.name ?? t(hass, "card.floorplan.tray.no_room"));
    const items = g.items.map((c) =>
      `<div class="item" data-key="${esc(c.key)}" title="${drag}">${dot(c)}${esc(candidateName(hass, c))}</div>`).join("");
    return `<details data-group="${key}"${isOpen(g.key) ? " open" : ""}><summary data-group="${key}" title="${dragGroup}">`
      + `${name} <span class="count">${g.items.length}</span></summary>${items}</details>`;
  }).join("");
}
