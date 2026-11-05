// The floor plan view (#/floorplan), on the page contract of pages/index.js: the floorplan
// component's own card (custom:floorplan-card, consumed as an element; the plan is drawn there, not
// here) as tall as the screen between Home Assistant's header and the bar. Its own gestures: two
// fingers zoom, a drag pans, its + / − / fit buttons and maps stay in its bar, sized for fingers
// (--floorplan-target). Its layer chips move into a bottom sheet (the sheet kind "layers",
// lib/layer-sheet.js), opened by the Layers button over the plan. A tap on a room opens that
// area's page: the pocket area whose HA area it is (lib/sensors.js haAreaOf); a room no pocket
// area reads opens nothing. Read-only (edit: false): the plan is edited on a large screen.
//
// Opened from an area (#/floorplan/<id>, ctx.routeId), the title is a back button to that area's
// page: the left edge's swipe on a phone opens Home Assistant's menu, not the page before.
//
// The plan is read once per session (lib/plan-cache.js) and handed to the card as its `plan:`.
// Without the floorplan component (config `floorplan` unset) or without a plan, the page says there
// is no floor plan; while it is read, it shows nothing. render() builds it once; update() hands the
// card hass.

import { areasOf } from "../lib/areas.js";
import { haAreaOf } from "../lib/sensors.js";
import { ELEMENT } from "../lib/area-plan.js";
import { layerSpec } from "../lib/layer-sheet.js";
import { el, setAttr, setText } from "../lib/page-kit.js";
import { loadPlan } from "../lib/plan-cache.js";

const STYLE = `
  .plan-page .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 8px; }
  .plan-page .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .plan-page .back { min-height: 44px; margin: 0 0 0 -8px; padding: 0 8px 0 0; border: 0; background: none;
                     color: var(--fg); font: inherit; display: flex; align-items: center; cursor: pointer; }
  .plan-page .back[hidden] { display: none; }
  .plan-page .back ha-icon { --mdc-icon-size: 28px; flex: 0 0 auto; }
  .plan-page .layers { min-width: 44px; min-height: 44px; margin: 0; padding: 0 14px; border: 1px solid var(--line);
                       border-radius: 14px; background: var(--card); color: var(--fg); font: inherit; font-size: 13px;
                       display: flex; align-items: center; gap: 6px; cursor: pointer; --mdc-icon-size: 20px; }
  .plan-page .layers[hidden], .plan-page .box[hidden], .plan-page .none[hidden] { display: none; }
  .plan-page .layers:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  /* The screen between HA's header and the bar, less main's padding (12 + 16 px) and the title row. */
  .plan-page .box { --floorplan-target: 44px; height: 420px;
                    height: calc(100dvh - var(--header-height, 56px) - env(safe-area-inset-top, 0px)
                                 - var(--bar, 64px) - var(--safe, 0px) - 28px - 52px);
                    min-height: 320px; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); }
  .plan-page .none { color: var(--mut); font-size: 15px; margin: 32px 0; text-align: center; }
`;

export const planConfig = () => ({ edit: false, chips: false, values: true, maps: true, zoom: true });

export function render(ctx) {
  const root = el("section", "plan-page");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><button class="back" type="button" hidden><ha-icon icon="mdi:chevron-left"></ha-icon><b></b></button><b class="title"></b><button class="layers" type="button" hidden><ha-icon icon="mdi:layers-outline"></ha-icon><span></span></button></div>
    <div class="box" hidden></div>
    <p class="none" hidden></p>`;
  const parts = { ctx, card: null, loading: !!ctx.config?.floorplan, layers: root.querySelector(".layers"), box: root.querySelector(".box"),
    none: root.querySelector(".none") };
  root._plan = parts;
  root.querySelector(".back").addEventListener("click", () => {
    const from = fromArea(parts.ctx);
    parts.ctx.navigate(from ? `#/area/${encodeURIComponent(from.id)}` : "#/areas");
  });
  parts.layers.addEventListener("click", () => {
    if (parts.card) parts.ctx.openSheet?.(layerSpec(parts.ctx, parts.card));
  });
  const attach = (plan) => {
    parts.loading = false;
    if (parts.card || !plan) {
      update(root, parts.ctx);
      return;
    }
    const card = document.createElement(ELEMENT);
    card.setConfig({ ...planConfig(), plan });
    card.addEventListener("room-tap", (e) => {
      const target = areasOf(parts.ctx.config).find((area) => haAreaOf(parts.ctx.config, area) === e.detail?.area_id);
      if (target) parts.ctx.navigate(`#/area/${target.id}`);
    });
    card.addEventListener("floorplan-status", () => update(root, parts.ctx));
    parts.card = card;
    parts.box.append(card);
    card.hass = parts.ctx.hass;
    update(root, parts.ctx);
  };
  if (ctx.config?.floorplan) {
    const defined = customElements.get(ELEMENT) ? Promise.resolve() : customElements.whenDefined(ELEMENT);
    Promise.all([loadPlan(ctx.hass), defined]).then(([plan]) => attach(plan));
  }
  update(root, ctx);
  return root;
}

// The area the view was opened from, or null.
const fromArea = (ctx) => (ctx.routeId == null ? null : areasOf(ctx.config, ctx.t).find((area) => area.id === ctx.routeId) ?? null);

export function update(root, ctx) {
  const parts = root._plan;
  parts.ctx = ctx;
  const title = ctx.t("card.pocket.floorplan.title");
  const from = fromArea(ctx);
  const back = root.querySelector(".back");
  back.hidden = !from;
  root.querySelector(".top .title").hidden = !!from;
  setText(back.querySelector("b"), title);
  setText(root.querySelector(".top .title"), title);
  if (from) setAttr(back, "aria-label", ctx.t("card.pocket.floorplan.back", { name: from.outside ? ctx.t("card.pocket.area.outside") : from.name }));
  const label = ctx.t("card.pocket.floorplan.layers");
  setText(parts.layers.querySelector("span"), label);
  setAttr(parts.layers, "aria-label", label);
  parts.box.hidden = !parts.card;
  parts.none.hidden = !!parts.card || parts.loading;
  setText(parts.none, ctx.t("card.pocket.floorplan.none"));
  if (!parts.card) {
    parts.layers.hidden = true;
    return;
  }
  parts.card.hass = ctx.hass;
  parts.layers.hidden = parts.card.layerChips.length === 0;
}
