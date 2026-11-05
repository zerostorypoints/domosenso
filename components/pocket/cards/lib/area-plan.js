// The area page's part of the floor plan: the floorplan component's own card (custom:floorplan-card,
// consumed as an element, never redrawn here) with `area` set to the area's HA area, so it draws
// that room with its sensors and their readings, the rooms around it faded (context: true), fitted,
// read-only, fixed (zoom: false: a finger on it scrolls the page) and without chips; its layers are
// in the bottom sheet the Layers button opens (lib/layer-sheet.js), as on the floor plan view, and
// its maps (maps: true) in the card's own bar, offered with one of climate, light or plants shown
// alone: the room's temperature, humidity or CO₂ drawn on it. Shown only when the home has the
// floorplan component (config `floorplan`, which the dashboard template sets from the home's
// inputs; the card's resource comes with that component) and the card says the area is on the plan
// (its floorplan-status is ready). A tap on it, or on "Open", opens the floor plan view from this
// area (#/floorplan/<area id>: its back button returns here). The plan is
// read once per session (lib/plan-cache.js) and handed to the card as its `plan:`; without a plan
// the part stays hidden.
//
//   renderAreaPlan(ctx, area) -> {el, update(ctx)} | null    null without the floorplan or an area

import { haAreaOf } from "./sensors.js";
import { el, setText } from "./page-kit.js";
import { loadPlan } from "./plan-cache.js";
import { layerSpec } from "./layer-sheet.js";

export const ELEMENT = "floorplan-card";

export const PLAN_STYLE = `
  .area-plan[hidden] { display: none; }
  .area-plan .bar-row { display: flex; align-items: center; justify-content: space-between; margin: 18px 4px 8px; }
  .area-plan .t { font-size: 12.5px; font-weight: 600; color: var(--mut); text-transform: uppercase; letter-spacing: .5px; }
  .area-plan .acts { display: flex; gap: 12px; }
  .area-plan .layers[hidden] { display: none; }
  .area-plan .open, .area-plan .layers { min-width: 44px; min-height: 44px; margin: -12px -4px; padding: 0 4px; border: 0; background: none;
                     font: inherit; font-size: 13px; color: var(--acc); cursor: pointer; }
  /* The card sizes itself: its plan at least 280 px (floorplan lib/style.js) and, with a map shown, its
     bar of map choices and the scale above it; a fixed height would cut the plan. */
  .area-plan .box { min-height: 280px; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); }
  .area-plan .open:focus-visible, .area-plan .layers:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

// The floor plan card's config for one area (components/floorplan: `area` and the host options).
// `rooms`: the home inputs' rooms as Pocket has them (names in its language, HA area, climate), so the
// plan shows the same names and colours each room by the same sensor (decision record of #219, 11).
export const planConfig = (areaId, rooms) => ({ area: areaId, context: true, edit: false, zoom: false, maps: true, chips: false, values: true,
  ...(Array.isArray(rooms) && rooms.length ? { rooms: rooms.map(({ id, name, area, climate }) => ({ id, name, area, ...(climate ? { climate } : {}) })) } : {}) });

export function renderAreaPlan(ctx, area) {
  const areaId = haAreaOf(ctx.config, area);
  if (!ctx.config?.floorplan || !areaId) return null;
  const root = el("div", "area-plan",
    `<div class="bar-row"><span class="t"></span><span class="acts"><button class="layers" type="button" hidden></button><button class="open" type="button"></button></span></div><div class="box"></div>`);
  root.hidden = true;
  const state = { ctx, card: null };
  const open = () => state.ctx.navigate(`#/floorplan/${encodeURIComponent(area.id)}`);
  root.querySelector(".open").addEventListener("click", open);
  const layers = root.querySelector(".layers");
  layers.addEventListener("click", () => {
    if (state.card) state.ctx.openSheet?.(layerSpec(state.ctx, state.card));
  });

  const attach = (plan) => {
    if (state.card || !plan) return;
    const card = document.createElement(ELEMENT);
    card.setConfig({ ...planConfig(areaId, state.ctx.config?.rooms), plan });
    card.addEventListener("floorplan-status", (e) => {
      root.hidden = e.detail?.status !== "ready";
      update(state.ctx);
    });
    card.addEventListener("room-tap", open);
    state.card = card;
    root.querySelector(".box").append(card);
    card.hass = state.ctx.hass;
  };
  // The card's resource may load after the pocket's: it is attached once its element is defined
  // and the plan is read.
  const defined = customElements.get(ELEMENT) ? Promise.resolve() : customElements.whenDefined(ELEMENT);
  Promise.all([loadPlan(ctx.hass), defined]).then(([plan]) => attach(plan));

  function update(ctx) {
    state.ctx = ctx;
    setText(root.querySelector(".t"), ctx.t("card.pocket.floorplan.title"));
    setText(root.querySelector(".open"), `${ctx.t("card.pocket.floorplan.open")} ›`);
    setText(layers, ctx.t("card.pocket.floorplan.layers"));
    layers.hidden = !(state.card?.layerChips?.length > 0);
    if (state.card) state.card.hass = ctx.hass;
  }

  update(ctx);
  return { el: root, update };
}
