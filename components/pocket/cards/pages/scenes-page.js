// The Scenes page (#/scenes), on the page contract of pages/index.js: the scenes a person chose to
// keep at hand, by area (lib/scenes.js), each one tile that activates it (scene.turn_on, through
// ctx.optimistic: the tile shows it at once and rolls back with a toast when Home Assistant
// refuses). "Choose" top right opens the picker sheet (lib/scene-sheet.js) of every scene Home
// Assistant has, where each is switched on or off for this page; the choice is the person's
// (lib/settings.js scenes). Until a person chooses, the page shows the scenes the home inputs name;
// with none, a hint and the same button.

import { allScenes, chosenScenes, sceneName } from "../lib/scenes.js";
import { el, setAttr, setText } from "../lib/page-kit.js";

const STYLE = `
  .scenes-page .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 4px 8px; }
  .scenes-page .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .scenes-page .choose { min-height: 44px; margin: 0; padding: 0 14px; border: 1px solid var(--line); border-radius: 14px;
                         background: var(--card); color: var(--fg); font: inherit; font-size: 13px; display: flex;
                         align-items: center; gap: 6px; cursor: pointer; --mdc-icon-size: 20px; }
  .scenes-page h3 { margin: 16px 4px 8px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .scenes-page .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--square-min, 160px), 100%), 1fr));
                       grid-auto-rows: 1fr; gap: 8px; }
  .scenes-page .scene { box-sizing: border-box; min-height: 56px; margin: 0; padding: 10px 12px; text-align: left;
                        font: inherit; font-size: 15px; font-weight: 600; color: var(--fg); background: var(--card);
                        border: 1px solid var(--line); border-radius: 16px; display: flex; align-items: center; gap: 10px;
                        overflow-wrap: anywhere; cursor: pointer; -webkit-tap-highlight-color: transparent;
                        --mdc-icon-size: 20px; }
  .scenes-page .scene ha-icon { flex: 0 0 auto; color: var(--mut); }
  .scenes-page .scene.done { border-color: var(--acc); }
  .scenes-page .scene.done ha-icon { color: var(--acc); }
  .scenes-page .scene:disabled { opacity: .55; cursor: default; }
  .scenes-page .empty { margin: 24px 8px; font-size: 15px; line-height: 1.4; color: var(--mut); text-align: center; }
  .scenes-page .empty[hidden], .scenes-page .groups[hidden] { display: none; }
  .scenes-page button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

const DONE_MS = 1500;

export function render(ctx) {
  const root = el("section", "scenes-page");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b><button class="choose" type="button"><ha-icon icon="mdi:playlist-edit"></ha-icon><span></span></button></div>
    <div class="groups"></div>
    <p class="empty" hidden></p>`;
  const parts = { ctx, key: null, tiles: [] };
  root.querySelector(".choose").addEventListener("click", () => parts.ctx.openSheet?.({ kind: "scenes" }));
  root._scenes = parts;
  update(root, ctx);
  return root;
}

function activate(root, tile, id) {
  const { hass, offline, optimistic } = root._scenes.ctx;
  if (offline || !hass?.callService) return;
  optimistic.send(root, hass, { domain: "scene", service: "turn_on", data: { entity_id: id },
    errorKey: "card.pocket.error.scene", expect: { [id]: { changed: true } } });
  tile.classList.add("done");
  clearTimeout(tile._done);
  tile._done = setTimeout(() => tile.classList.remove("done"), DONE_MS);
}

export function update(root, ctx) {
  const parts = root._scenes;
  parts.ctx = ctx;
  const { hass } = ctx;
  setText(root.querySelector(".top b"), ctx.t("card.pocket.scenes.title"));
  const choose = root.querySelector(".choose");
  setText(choose.querySelector("span"), ctx.t("card.pocket.scenes.choose"));
  setAttr(choose, "aria-label", ctx.t("card.pocket.scenes.choose_label"));

  const chosen = new Set(chosenScenes(ctx.settings, ctx.config));
  const groups = allScenes(hass, ctx.config, ctx.t)
    .map((group) => ({ ...group, scenes: group.scenes.filter((id) => chosen.has(id)) }))
    .filter((group) => group.scenes.length);
  const key = JSON.stringify(groups.map((g) => [g.key, g.scenes]));
  if (key !== parts.key) {
    parts.key = key;
    parts.tiles = [];
    const nodes = [];
    for (const group of groups) {
      const heading = el("h3");
      nodes.push(heading);
      parts.tiles.push({ heading, group });
      const grid = el("div", "grid");
      for (const id of group.scenes) {
        const tile = el("button", "scene", `<ha-icon icon="mdi:palette-outline"></ha-icon><span></span>`);
        tile.type = "button";
        tile.dataset.scene = id;
        tile.addEventListener("click", () => activate(root, tile, id));
        grid.append(tile);
      }
      nodes.push(grid);
    }
    root.querySelector(".groups").replaceChildren(...nodes);
  }
  for (const { heading, group } of parts.tiles) {
    setText(heading, group.name || ctx.t("card.pocket.scenes.no_area"));
  }
  for (const tile of root.querySelectorAll(".scene")) {
    const group = groups.find((g) => g.scenes.includes(tile.dataset.scene));
    const name = sceneName(hass, tile.dataset.scene, group?.name);
    setText(tile.querySelector("span"), name);
    setAttr(tile, "aria-label", ctx.t("card.pocket.scenes.activate", { name }));
    tile.disabled = !!ctx.offline;
  }
  const empty = root.querySelector(".empty");
  empty.hidden = groups.length > 0;
  root.querySelector(".groups").hidden = groups.length === 0;
  setText(empty, ctx.t("card.pocket.scenes.empty"));
}
