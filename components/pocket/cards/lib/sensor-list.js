// The area page's "All sensors": every sensor and binary_sensor of the area's HA area by category
// (lib/sensors.js: the floor plan's registries and categories), in a section that starts collapsed.
// Its header is one 44 px button with the count; open, a heading per category (its colour's dot
// and name), then a row per entity: its name (the area's name in front left out) and its value as
// Home Assistant words it. A row with a number opens its trend sheet (ctx.openSheet, kind "trend");
// an on/off sensor's row opens nothing. The section is hidden while the area has no sensor.
//
//   renderSensors(ctx, area) -> {el, update(ctx)}
//
// The rows are rebuilt only when the entities or their categories change; update() patches the
// values and the words.

import { areaSensors, haAreaOf, isNumeric, loadEntryDomains, sensorValue } from "./sensors.js";
import { el, setAttr, setText, shortName } from "./page-kit.js";

export const SENSOR_STYLE = `
  .sensors { margin-top: 18px; }
  .sensors[hidden], .sensors .list[hidden] { display: none; }
  .sensors .head { width: 100%; min-height: 44px; margin: 0; padding: 0 4px; border: 0; background: none;
                   display: flex; align-items: center; gap: 8px; font: inherit; color: var(--mut); cursor: pointer;
                   text-align: left; -webkit-tap-highlight-color: transparent; }
  .sensors .head .t { font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
  .sensors .head .n { font-size: 12.5px; }
  .sensors .head ha-icon { margin-left: auto; --mdc-icon-size: 22px; transition: transform .15s ease-out; }
  .sensors .head[aria-expanded="true"] ha-icon { transform: rotate(180deg); }
  .sensors .list { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 4px 12px 8px; }
  .sensors .cat { display: flex; align-items: center; gap: 6px; margin: 10px 0 2px; font-size: 12.5px; color: var(--mut); }
  .sensors .cat i { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .sensors .row { box-sizing: border-box; width: 100%; min-height: 44px; margin: 0; padding: 6px 0; border: 0;
                  border-top: 1px solid var(--line); background: none; font: inherit; color: var(--fg);
                  display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; }
  .sensors .cat + .row { border-top: 0; }
  .sensors button.row { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .sensors .row .nm { font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
  .sensors .row .v { font-size: 15px; font-weight: 600; flex: 0 0 auto; max-width: 50%; text-align: right; overflow-wrap: anywhere; }
  .sensors button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

const READINGS = { temperature: "temperature", humidity: "humidity" };

// The trend sheet's spec for one sensor: its name, the area, and the digits its state shows.
function sensorSpec(ctx, id, name, where) {
  const state = ctx.hass?.states?.[id];
  const reading = READINGS[state?.attributes?.device_class];
  const digits = Math.min(2, (String(state?.state ?? "").split(".")[1] ?? "").length);
  return { kind: "trend", entity: id, title: name, subtitle: where, ...(reading ? { reading } : { digits }) };
}

export function renderSensors(ctx, area) {
  const root = el("div", "sensors",
    `<button class="head" type="button" aria-expanded="false"><span class="t"></span><span class="n"></span><ha-icon icon="mdi:chevron-down"></ha-icon></button>
     <div class="list" hidden></div>`);
  const head = root.querySelector(".head");
  const list = root.querySelector(".list");
  const state = { ctx, open: false, key: null, rows: [], cats: [], domains: {} };
  const where = () => (area.outside ? state.ctx.t("card.pocket.area.outside") : area.name);
  head.addEventListener("click", () => {
    state.open = !state.open;
    update(state.ctx);
  });
  // A device's integrations from its config entries, as the floor plan reads them: asked once,
  // when the registries are there to group.
  const askDomains = (hass) => {
    if (state.asked || !hass?.entities) return;
    state.asked = true;
    loadEntryDomains(hass).then((domains) => {
      state.domains = domains;
      if (root.isConnected) update(state.ctx);
    });
  };

  function rebuild(ctx, groups) {
    state.rows = [];
    state.cats = [];
    const nodes = [];
    for (const group of groups) {
      const cat = el("div", "cat", "<i></i><span></span>");
      cat.querySelector("i").style.background = group.colour;
      state.cats.push({ group, label: cat.querySelector("span") });
      nodes.push(cat);
      for (const id of group.entities) {
        const opens = isNumeric(ctx.hass, id);
        const row = el(opens ? "button" : "div", "row", `<span class="nm"></span><span class="v"></span>`);
        if (opens) {
          row.type = "button";
          row.addEventListener("click", () => {
            const name = shortName(state.ctx.hass, id, area);
            state.ctx.openSheet?.(sensorSpec(state.ctx, id, name, where()));
          });
        }
        row.dataset.entity = id;
        state.rows.push({ id, row, name: row.querySelector(".nm"), value: row.querySelector(".v") });
        nodes.push(row);
      }
    }
    list.replaceChildren(...nodes);
  }

  function update(ctx) {
    state.ctx = ctx;
    const { hass } = ctx;
    askDomains(hass);
    const groups = areaSensors(hass, haAreaOf(ctx.config, area), state.domains);
    const count = groups.reduce((sum, g) => sum + g.entities.length, 0);
    const key = JSON.stringify([groups.map((g) => [g.category, g.entities]), groups.flatMap((g) => g.entities.map((id) => isNumeric(hass, id)))]);
    if (key !== state.key) {
      state.key = key;
      rebuild(ctx, groups);
    }
    root.hidden = count === 0;
    setText(head.querySelector(".t"), ctx.t("card.pocket.sensors.title"));
    setText(head.querySelector(".n"), String(count));
    setAttr(head, "aria-expanded", String(state.open));
    list.hidden = !state.open;
    for (const { group, label } of state.cats) setText(label, group.name);
    for (const { id, name, value } of state.rows) {
      setText(name, shortName(hass, id, area));
      setText(value, sensorValue(hass, id, ctx.t));
    }
  }

  update(ctx);
  return { el: root, update };
}
