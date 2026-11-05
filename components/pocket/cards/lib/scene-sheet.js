// The Scenes page's picker in the shell's bottom sheet (ctx.openSheet({kind: "scenes"})): every
// scene Home Assistant has, by area (lib/scenes.js allScenes), each a row with a switch that keeps
// it on the Scenes page or not. A switch shows its new state at once and saves the person's choice
// (ctx.saveSettings({scenes})); a save that fails puts it back and toasts (lib/report.js). The rows
// are rebuilt only when the scenes change.

import { allScenes, chosenScenes, sceneName } from "./scenes.js";
import { reportError } from "./report.js";
import { el, setAttr, setText } from "./page-kit.js";

const STYLE = `
  .scene-pick h3 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
  .scene-pick .hint { margin: 0 0 10px; font-size: 12.5px; color: var(--mut); }
  .scene-pick h4 { margin: 14px 0 4px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .scene-pick .row { box-sizing: border-box; width: 100%; min-height: 48px; margin: 0; padding: 4px 0; border: 0;
                     border-top: 1px solid var(--line); background: none; color: var(--fg); font: inherit; font-size: 15px;
                     display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left;
                     cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .scene-pick h4 + .row { border-top: 0; }
  .scene-pick .row span { min-width: 0; overflow-wrap: anywhere; }
  .scene-pick .row i { position: relative; flex: 0 0 auto; display: block; width: 46px; height: 28px; border-radius: 14px;
                       background: var(--line); }
  .scene-pick .row i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
                              background: var(--card); box-shadow: 0 1px 2px rgba(0, 0, 0, .25); }
  .scene-pick .row[aria-checked="true"] i { background: var(--acc); }
  .scene-pick .row[aria-checked="true"] i::after { left: 21px; }
  .scene-pick .row:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
`;

export function render(ctx) {
  const root = el("div", "scene-pick");
  root.innerHTML = `<style>${STYLE}</style><h3></h3><p class="hint"></p><div class="list"></div>`;
  root._pick = { ctx, key: null, chosen: null, rows: [] };
  update(root, ctx);
  return root;
}

function toggle(root, id) {
  const parts = root._pick;
  const before = parts.chosen;
  parts.chosen = before.includes(id) ? before.filter((x) => x !== id) : [...before, id];
  update(root, parts.ctx);
  Promise.resolve()
    .then(() => parts.ctx.saveSettings(({ scenes: parts.chosen })))
    .catch(() => {
      parts.chosen = before;
      reportError(root, "card.pocket.settings.error");
      update(root, parts.ctx);
    });
}

export function update(root, ctx) {
  const parts = root._pick;
  parts.ctx = ctx;
  const { hass } = ctx;
  // The choice shown: the one this sheet changed, else the person's.
  parts.chosen ??= [...chosenScenes(ctx.settings, ctx.config)];
  setText(root.querySelector("h3"), ctx.t("card.pocket.scenes.pick_title"));
  setText(root.querySelector(".hint"), ctx.t("card.pocket.scenes.pick_hint"));
  const groups = allScenes(hass, ctx.config, ctx.t);
  const key = JSON.stringify(groups.map((g) => [g.key, g.scenes]));
  if (key !== parts.key) {
    parts.key = key;
    parts.rows = [];
    const nodes = [];
    for (const group of groups) {
      const heading = el("h4");
      heading.dataset.group = group.key;
      nodes.push(heading);
      parts.rows.push({ heading, group });
      for (const id of group.scenes) {
        const row = el("button", "row", "<span></span><i></i>");
        row.type = "button";
        setAttr(row, "role", "switch");
        row.dataset.scene = id;
        row.dataset.group = group.key;
        row.addEventListener("click", () => toggle(root, id));
        nodes.push(row);
      }
    }
    root.querySelector(".list").replaceChildren(...nodes);
  }
  const names = Object.fromEntries(groups.map((g) => [g.key, g.name]));
  for (const { heading, group } of parts.rows) setText(heading, group.name || ctx.t("card.pocket.scenes.no_area"));
  for (const row of root.querySelectorAll(".row")) {
    const name = sceneName(hass, row.dataset.scene, names[row.dataset.group]);
    setText(row.querySelector("span"), name);
    setAttr(row, "aria-checked", String(parts.chosen.includes(row.dataset.scene)));
    setAttr(row, "aria-label", name);
    row.disabled = !!ctx.offline;
  }
}
