// The Plants page (#/plants), on the page contract of pages/index.js: every plant.* entity
// (lib/plants.js: its readings, bands and area, no input names them) grouped by area, the area of
// the plant that needs most first, and in each the plants worst first.
//   - one line under the title: how many plants need something, or that all are fine;
//   - a card per plant: its name, what it needs in plain words (thirsty, too wet, needs light, too
//     much light, cold, warm, needs fertiliser, too much fertiliser, low battery) in the tone of the
//     worst, or "Fine"; then its readings in a grid of equal cells (moisture, fertiliser, light,
//     temperature, battery), each value in its tone against the plant's band; a reading with a
//     sensor opens that sensor's trend sheet;
//   - with no plant at all, one line says so (a home without the plants component).
// render() builds the parts once; update() patches the texts and tones, and rebuilds the list
// only when the plants, their order or their readings change.

import { plantsOf, needing } from "../lib/plants.js";
import { sensorSpec } from "../lib/sensor-list.js";
import { el, setText, setAttr, number, temperature, percent, pluralOf } from "../lib/page-kit.js";

const UNITS = { conductivity: "µS/cm", illuminance: "lx" };
const RANK_TONES = { 0: "poor", 1: "fair", 2: "fair", 3: "good" };

const STYLE = `
  .plants .top { padding: 4px 4px 8px; }
  .plants .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .plants .sum { margin: 0 4px 4px; font-size: 15px; color: var(--mut); }
  .plants .sec { font-size: 12.5px; font-weight: 600; margin: 18px 4px 8px; color: var(--mut);
                 text-transform: uppercase; letter-spacing: .5px; overflow-wrap: anywhere; }
  .plants .cards { display: flex; flex-direction: column; gap: 10px; }
  .plants .plant { box-sizing: border-box; padding: 12px; background: var(--card); border: 1px solid var(--line);
                   border-radius: 18px; }
  .plants .plant.need { border-left: 4px solid var(--bad); }
  .plants .plant.need.fair { border-left-color: var(--warn); }
  .plants .ph { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .plants .ph .nm { font-size: 17px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
  .plants .ph .why { font-size: 13px; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
  .plants .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  .plants .rd { box-sizing: border-box; min-width: 0; min-height: 52px; margin: 0; padding: 6px 8px;
                display: flex; flex-direction: column; justify-content: center; gap: 2px; text-align: left;
                font: inherit; color: var(--fg); background: var(--chip); border: 0; border-radius: 12px; }
  .plants button.rd { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .plants .rd .l { font-size: 11.5px; color: var(--mut); overflow-wrap: anywhere; }
  .plants .rd .v { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .plants .muted { opacity: .55; }
  .plants .lv-good { color: var(--ok); }
  .plants .lv-fair { color: var(--warn); }
  .plants .lv-poor { color: var(--bad); }
  .plants .lv-cold { color: var(--cold); }
  .plants .lv-warm { color: var(--warm); }
  .plants .empty { color: var(--mut); font-size: 15px; margin: 32px 0; text-align: center; }
  .plants [hidden] { display: none; }
  .plants button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

export function groupName(ctx, group) {
  if (group.area) return group.area.outside ? ctx.t("card.pocket.area.outside") : group.area.name;
  if (group.areaId) return ctx.hass?.areas?.[group.areaId]?.name ?? group.areaId;
  return group.label ?? ctx.t("card.pocket.plants.no_area");
}

export function readingValue(ctx, row) {
  if (row.value == null) return ctx.t("card.pocket.format.none");
  if (row.reading === "temperature") return temperature(ctx, row.value);
  if (row.reading === "moisture" || row.reading === "battery") return percent(ctx, row.value);
  const unit = row.unit || UNITS[row.reading];
  return ctx.t("card.pocket.trend.value", { value: number(ctx, row.value, 0, { grouping: false }), unit });
}

// What a plant needs, in words: its reasons joined, or "Fine" (or "No reading").
export function needText(ctx, plant) {
  if (plant.reasons.length) return plant.reasons.map((r) => ctx.t(`card.pocket.plants.reason.${r}`)).join(" · ");
  return ctx.t(plant.rank === 4 ? "card.pocket.plants.no_reading" : "card.pocket.plants.fine");
}

const setClass = (node, name) => { if (node.className !== name) node.className = name; };

export function render(ctx) {
  const root = el("section", "plants");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <p class="sum" hidden></p>
    <div class="list"></div>
    <p class="empty" hidden></p>`;
  const parts = { ctx, key: null, cards: [], names: [],
    title: root.querySelector(".top b"), sum: root.querySelector(".sum"),
    list: root.querySelector(".list"), empty: root.querySelector(".empty") };
  root._plants = parts;
  update(root, ctx);
  return root;
}

function rebuild(parts, groups) {
  parts.cards = [];
  parts.names = [];
  parts.list.replaceChildren(...groups.map((group) => {
    const box = el("div", "area");
    const name = el("div", "sec");
    parts.names.push({ node: name, group });
    const cards = el("div", "cards");
    for (const plant of group.plants) {
      const card = el("div", "plant", `<div class="ph"><span class="nm"></span><span class="why"></span></div><div class="grid"></div>`);
      card.dataset.plant = plant.id;
      const cells = plant.readings.map((row) => {
        const node = el(row.entity ? "button" : "div", "rd", `<span class="l"></span><span class="v"></span>`);
        node.dataset.reading = row.reading;
        if (row.entity) {
          node.type = "button";
          node.addEventListener("click", () => {
            const current = parts.byId.get(plant.id) ?? plant;
            parts.ctx.openSheet?.(sensorSpec(parts.ctx, row.entity,
              parts.ctx.t(`card.pocket.plants.reading.${row.reading}`), current.name));
          });
        }
        card.querySelector(".grid").append(node);
        return { reading: row.reading, node, label: node.querySelector(".l"), value: node.querySelector(".v") };
      });
      parts.cards.push({ id: plant.id, card, name: card.querySelector(".nm"), why: card.querySelector(".why"), cells });
      cards.append(card);
    }
    box.append(name, cards);
    return box;
  }));
}

export function update(root, ctx) {
  const parts = root._plants;
  parts.ctx = ctx;
  setText(parts.title, ctx.t("card.pocket.plants.title"));
  const groups = plantsOf(ctx.hass, ctx.config);
  const key = JSON.stringify(groups.map((g) => [g.areaId, g.label, g.plants.map((p) => [p.id, p.readings.map((r) => [r.reading, r.entity])])]));
  if (key !== parts.key) {
    parts.key = key;
    rebuild(parts, groups);
  }
  parts.byId = new Map(groups.flatMap((g) => g.plants.map((p) => [p.id, p])));
  for (const { node, group } of parts.names) setText(node, groupName(ctx, group));
  for (const cell of parts.cards) {
    const plant = parts.byId.get(cell.id);
    setText(cell.name, plant.name);
    setText(cell.why, needText(ctx, plant));
    const tone = RANK_TONES[plant.rank];
    setClass(cell.why, tone ? `why lv-${tone}` : "why muted");
    setClass(cell.card, plant.rank <= 2 ? `plant need ${tone}` : "plant");
    plant.readings.forEach((row, i) => {
      const c = cell.cells[i];
      setText(c.label, ctx.t(`card.pocket.plants.reading.${row.reading}`));
      setText(c.value, readingValue(ctx, row));
      setClass(c.value, row.value == null ? "v muted" : row.tone ? `v lv-${row.tone}` : "v");
      if (row.entity) setAttr(c.node, "aria-label", `${c.label.textContent} ${c.value.textContent}`);
    });
  }
  const count = groups.reduce((n, g) => n + g.plants.length, 0);
  const need = needing(groups);
  parts.sum.hidden = count === 0;
  setText(parts.sum, !count ? "" : need ? ctx.t(`card.pocket.plants.need.${pluralOf(ctx, need)}`, { count: need })
    : ctx.t("card.pocket.plants.all_fine"));
  parts.empty.hidden = count > 0;
  setText(parts.empty, count ? "" : ctx.t("card.pocket.plants.empty"));
}
