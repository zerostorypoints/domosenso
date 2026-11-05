// The Media page's input picker in the shell's bottom sheet (ctx.openSheet({kind: "sources"})):
// one 56 px row per entry of the player's source_list, the current source marked. A tap hands the
// source to the page (spec.onPick), which selects it and closes the sheet.
//
//   sourceSpec(ctx, player, onPick) -> spec    {kind: "sources", player, onPick, title}
//   render(ctx, spec) -> HTMLElement,  update(el, ctx)   on the page contract (pages/index.js)
//
// The list is the player's own and may change (a receiver switched on lists its inputs): the rows
// are rebuilt when it does; update() otherwise only moves the mark.

import { el, setAttr, setText } from "./page-kit.js";

const STYLE = `
  .source-sheet h3 { margin: 4px 0 12px; font-size: 17px; font-weight: 600; }
  .source-sheet .rows { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .source-sheet .row { box-sizing: border-box; width: 100%; min-height: 56px; margin: 0; padding: 10px 12px;
                       display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; font-size: 15px;
                       color: var(--fg); background: var(--card); border: 0; border-top: 1px solid var(--line); cursor: pointer; }
  .source-sheet .row:first-child { border-top: 0; }
  .source-sheet .row:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .source-sheet .row span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .source-sheet .mark { flex: 0 0 auto; color: var(--acc); --mdc-icon-size: 22px; }
  .source-sheet .row[aria-pressed="false"] .mark { visibility: hidden; }
`;

export function sourceSpec(ctx, player, onPick) {
  return { kind: "sources", player, onPick, title: ctx.t("card.pocket.media.input") };
}

// The inputs a player offers to choose from: its source_list when it can select a source
// (supported_features bit 2048) and lists more than one; else none.
export function sourcesOf(state) {
  const bits = Number(state?.attributes?.supported_features);
  const list = state?.attributes?.source_list;
  if (!Number.isFinite(bits) || (bits & 2048) === 0 || !Array.isArray(list)) return [];
  const sources = list.filter((s) => typeof s === "string" && s);
  return sources.length > 1 ? sources : [];
}

export function render(ctx, spec) {
  const root = el("div", "source-sheet", `<style>${STYLE}</style><h3></h3><div class="rows" role="group"></div>`);
  root._sources = { spec, key: null, rows: [] };
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._sources;
  const state = ctx.hass?.states?.[parts.spec.player];
  const sources = sourcesOf(state);
  const key = JSON.stringify(sources);
  if (key !== parts.key) {
    parts.key = key;
    parts.rows = sources.map((source) => {
      const row = el("button", "row", `<span></span><ha-icon class="mark" icon="mdi:check"></ha-icon>`);
      row.type = "button";
      row.addEventListener("click", () => parts.spec.onPick?.(source));
      setText(row.querySelector("span"), source);
      return { source, row };
    });
    root.querySelector(".rows").replaceChildren(...parts.rows.map((r) => r.row));
  }
  const title = ctx.t("card.pocket.media.input");
  setText(root.querySelector("h3"), title);
  setAttr(root.querySelector(".rows"), "aria-label", title);
  const current = state?.attributes?.source;
  for (const { source, row } of parts.rows) setAttr(row, "aria-pressed", String(source === current));
}
