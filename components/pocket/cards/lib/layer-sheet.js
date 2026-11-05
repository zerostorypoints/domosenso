// The floor plan's layer chips in the shell's bottom sheet (ctx.openSheet({kind: "layers"})): the
// floorplan card's own list (its layerChips: a category each with a point on the floor, its name,
// colour and whether it shows), a 44 px toggle each; a tap presses it on the card (pressLayer),
// which remembers the choice as its own chips do. The card stays the only one that knows layers.
//
//   layerSpec(ctx, card) -> spec       {kind: "layers", card, title}
//   render(ctx, spec) -> HTMLElement,  update(el, ctx)   on the page contract (pages/index.js)
//
// The toggles are rebuilt only when the card's list of layers changes; update() patches the pressed
// state and the names.

import { el, setAttr, setText } from "./page-kit.js";

const STYLE = `
  .layer-sheet h3 { margin: 4px 0 12px; font-size: 17px; font-weight: 600; }
  .layer-sheet .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .layer-sheet .chip { min-width: 44px; min-height: 44px; margin: 0; padding: 0 14px; border: 1px solid var(--line);
                       border-radius: 14px; background: var(--card); color: var(--fg); font: inherit; font-size: 15px;
                       display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .layer-sheet .chip i { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
  .layer-sheet .chip[aria-pressed="false"] { opacity: .5; }
  .layer-sheet .chip:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

export function layerSpec(ctx, card) {
  return { kind: "layers", card, title: ctx.t("card.pocket.floorplan.layers") };
}

export function render(ctx, spec) {
  const root = el("div", "layer-sheet", `<style>${STYLE}</style><h3></h3><div class="chips" role="group"></div>`);
  root._layers = { spec, ctx, key: null, chips: [] };
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._layers;
  parts.ctx = ctx;
  const list = parts.spec.card?.layerChips ?? [];
  const key = list.map((c) => c.id).join(" ");
  if (key !== parts.key) {
    parts.key = key;
    parts.chips = list.map((chip) => {
      const button = el("button", "chip", "<i></i><span></span>");
      button.type = "button";
      button.dataset.layer = chip.id;
      button.querySelector("i").style.background = chip.colour;
      button.addEventListener("click", () => {
        parts.spec.card.pressLayer(chip.id);
        update(root, parts.ctx);
      });
      return button;
    });
    root.querySelector(".chips").replaceChildren(...parts.chips);
  }
  const title = ctx.t("card.pocket.floorplan.layers");
  setText(root.querySelector("h3"), title);
  setAttr(root.querySelector(".chips"), "aria-label", title);
  list.forEach((chip, i) => {
    setText(parts.chips[i].querySelector("span"), chip.name);
    setAttr(parts.chips[i], "aria-pressed", String(chip.on));
  });
}
