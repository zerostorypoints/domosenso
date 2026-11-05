// The area page's part of the floor plan: the floorplan component's own card (custom:floorplan-card,
// consumed as an element, never redrawn here) with `area` set to the area's HA area, so it draws
// that room alone with its sensors and their readings, fitted, read-only, fixed (zoom: false: a
// finger on it scrolls the page) and without maps or chips. Shown only when the home has the
// floorplan component (config `floorplan`, which the dashboard template sets from the home's
// inputs; the card's resource comes with that component) and the card says the area is on the plan
// (its floorplan-status is ready). A tap on it, or on "Open", opens the floor plan view. The plan is
// read once per session (lib/plan-cache.js) and handed to the card as its `plan:`; without a plan
// the part stays hidden.
//
//   renderAreaPlan(ctx, area) -> {el, update(ctx)} | null    null without the floorplan or an area

import { haAreaOf } from "./sensors.js";
import { el, setText } from "./page-kit.js";
import { loadPlan } from "./plan-cache.js";

export const ELEMENT = "floorplan-card";

export const PLAN_STYLE = `
  .area-plan[hidden] { display: none; }
  .area-plan .bar-row { display: flex; align-items: center; justify-content: space-between; margin: 18px 4px 8px; }
  .area-plan .t { font-size: 12.5px; font-weight: 600; color: var(--mut); text-transform: uppercase; letter-spacing: .5px; }
  .area-plan .open { min-width: 44px; min-height: 44px; margin: -12px -4px; padding: 0 4px; border: 0; background: none;
                     font: inherit; font-size: 13px; color: var(--acc); cursor: pointer; }
  .area-plan .box { height: 280px; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); }
  .area-plan .open:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

// The floor plan card's config for one area (components/floorplan: `area` and the host options).
export const planConfig = (areaId) => ({ area: areaId, edit: false, zoom: false, maps: false, chips: false, values: true });

export function renderAreaPlan(ctx, area) {
  const areaId = haAreaOf(ctx.config, area);
  if (!ctx.config?.floorplan || !areaId) return null;
  const root = el("div", "area-plan",
    `<div class="bar-row"><span class="t"></span><button class="open" type="button"></button></div><div class="box"></div>`);
  root.hidden = true;
  const state = { ctx, card: null };
  const open = () => state.ctx.navigate("#/floorplan");
  root.querySelector(".open").addEventListener("click", open);

  const attach = (plan) => {
    if (state.card || !plan) return;
    const card = document.createElement(ELEMENT);
    card.setConfig({ ...planConfig(areaId), plan });
    card.addEventListener("floorplan-status", (e) => { root.hidden = e.detail?.status !== "ready"; });
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
    if (state.card) state.card.hass = ctx.hass;
  }

  update(ctx);
  return { el: root, update };
}
