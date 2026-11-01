import { test } from "node:test";
import assert from "node:assert/strict";
import { trayHtml } from "./tray.js";

const t = (hass, key) => `<${key}>`;
const hass = { devices: { d_office: { name: "Office & desk" } }, states: { "plant.monstera": { attributes: { friendly_name: "Monstera" } } } };
const groups = [
  { key: "office", name: "Office", items: [{ key: "d_office", kind: "device", entities: [] }] },
  { key: "none", name: null, items: [{ key: "plant.monstera", kind: "entity", entities: ["plant.monstera"] }] },
];

test("trayHtml: a details per group with its count, open as isOpen says, items escaped", () => {
  const html = trayHtml(hass, t, groups, (key) => key === "none");
  assert.match(html, /<details data-group="office"><summary data-group="office"[^>]*>Office <span class="count">1<\/span>/);
  assert.match(html, /<details data-group="none" open><summary data-group="none"[^>]*>&#60;card.floorplan.tray.no_room&#62; /);
  assert.ok(html.includes('data-key="d_office"') && html.includes("Office &#38; desk"), html);
});

test("trayHtml: no groups is the empty message", () => {
  assert.ok(trayHtml(hass, t, [], () => false).includes("&#60;card.floorplan.tray.empty&#62;"));
});
