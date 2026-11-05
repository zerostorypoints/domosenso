// The Media page's player picker in the shell's bottom sheet (ctx.openSheet({kind: "players"})):
// one 56 px row per area's player (lib/media.js playersOf), its area's name over the player's
// name and what it plays; the one the page shows is marked. A tap hands the player to the page
// (spec.onPick), which remembers it and closes the sheet.
//
//   playerSpec(ctx, current, onPick) -> spec    {kind: "players", current, onPick, title}
//   render(ctx, spec) -> HTMLElement,  update(el, ctx)   on the page contract (pages/index.js)
//
// The rows are built once (the players come from the config); update() patches their texts.

import { playersOf } from "./media.js";
import { GONE, el, setAttr, setText } from "./page-kit.js";

const STYLE = `
  .player-sheet h3 { margin: 4px 0 12px; font-size: 17px; font-weight: 600; }
  .player-sheet .rows { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .player-sheet .row { box-sizing: border-box; width: 100%; min-height: 56px; margin: 0; padding: 10px 12px;
                       display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: var(--fg);
                       background: var(--card); border: 0; border-top: 1px solid var(--line); cursor: pointer; }
  .player-sheet .row:first-child { border-top: 0; }
  .player-sheet .row:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
  .player-sheet .meta { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .player-sheet .t1 { display: block; font-size: 15px; font-weight: 600; }
  .player-sheet .t2 { display: block; font-size: 12.5px; color: var(--mut); margin-top: 2px; }
  .player-sheet .mark { flex: 0 0 auto; color: var(--acc); --mdc-icon-size: 22px; }
  .player-sheet .row[aria-pressed="false"] .mark { visibility: hidden; }
`;

export function playerSpec(ctx, current, onPick) {
  return { kind: "players", current, onPick, title: ctx.t("card.pocket.media.picker") };
}

export function render(ctx, spec) {
  const root = el("div", "player-sheet", `<style>${STYLE}</style><h3></h3><div class="rows" role="group"></div>`);
  const rows = playersOf(ctx.config).map((player) => {
    const row = el("button", "row",
      `<span class="meta"><span class="t1"></span><span class="t2"></span></span><ha-icon class="mark" icon="mdi:check"></ha-icon>`);
    row.type = "button";
    row.dataset.player = player.id;
    row.addEventListener("click", () => root._players.spec.onPick?.(player.id));
    return { player, row };
  });
  root.querySelector(".rows").replaceChildren(...rows.map((r) => r.row));
  root._players = { spec, rows };
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const { spec, rows } = root._players;
  const title = ctx.t("card.pocket.media.picker");
  setText(root.querySelector("h3"), title);
  setAttr(root.querySelector(".rows"), "aria-label", title);
  for (const { player, row } of rows) {
    const state = ctx.hass?.states?.[player.id];
    const a = state?.attributes ?? {};
    const name = a.friendly_name || player.id;
    const what = !state || GONE.has(state.state) ? ctx.t("card.pocket.format.none")
      : a.media_title ? ctx.t("card.pocket.media.playing_what", { name, title: a.media_title })
        : name;
    setText(row.querySelector(".t1"), player.room.name);
    setText(row.querySelector(".t2"), what);
    setAttr(row, "aria-pressed", String(player.id === spec.current));
  }
}
