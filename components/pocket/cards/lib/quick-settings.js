// Settings → Quick actions (#/settings/quick, SPEC-038 §3.11) and its Add page (#/settings/quick/add):
// the content pages/settings-page.js shows for those routes, with Settings' rows (DESIGN.md 4.5, 4.7).
//
//   - the list: Home's Quick actions in order (lib/quick.js quickOf), each a row with its name, what
//     it is or where it stands under the name, and three 44 px buttons: up, down, remove; then a row
//     "Add an action" that drills down to the Add page, and, while the list is the person's own, a row
//     "Use the home's default" that drops it. A line under the title says whose list it is (the
//     person's, the home's default, or each area's lights).
//   - the Add page: every action not in the list yet (lib/quick.js candidatesOf), grouped (areas'
//     lights, lights, scenes, scripts, switches, buttons), each a row that adds it at the end and goes
//     back (ctx.back).
// The list is the person's (lib/settings.js quick): a change shows at once and is saved through the
// page's save(patch); the first change copies the list Home shows (the default) into it.
//
//   renderQuickSettings(ctx, {add, settings, save}) -> element    updateQuickSettings(el, ctx)
//   settings(): the person's settings as shown (pending changes included); save(patch)

import { quickOf, candidatesOf, nameOf, areaNameOf, itemOf } from "./quick.js";
import { el, setText, setAttr } from "./page-kit.js";

const icon = (name) => `<ha-icon icon="${name}"></ha-icon>`;

export function renderQuickSettings(ctx, { add = false, settings, save }) {
  const root = el("div", "quick-settings");
  root.innerHTML = add
    ? `<div class="groups"></div><p class="hint none-left" hidden></p>`
    : `<div class="group list"><p class="hint source"></p><p class="hint about"></p><div class="rows"></div><p class="hint empty" hidden></p></div>
       <div class="group menu more">
         <button class="row add" type="button"><span class="label"><span class="name"></span></span>${icon("mdi:chevron-right")}</button>
         <button class="row reset" type="button"><span class="label"><span class="name"></span><small></small></span></button>
       </div>`;
  const parts = { ctx, add, settings, save, key: null };
  root._quick = parts;
  if (!add) {
    root.querySelector(".add").addEventListener("click", () => parts.ctx.navigate?.("#/settings/quick/add"));
    root.querySelector(".reset").addEventListener("click", () => parts.save({ quick: undefined }));
  }
  updateQuickSettings(root, ctx);
  return root;
}

function current(parts) {
  return quickOf(parts.settings(), parts.ctx.config, parts.ctx.hass);
}

function move(parts, id, by) {
  const ids = [...current(parts).ids];
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  parts.save({ quick: ids });
}

function hintOf(ctx, id) {
  const item = itemOf(id, ctx.config, ctx.hass);
  if (item?.area) return ctx.t("card.pocket.quick.area_lights");
  if (id === "all_off") return "";
  return areaNameOf(id, ctx.config, ctx.hass) ?? "";
}

export function updateQuickSettings(root, ctx) {
  const parts = root._quick;
  if (!parts) return;
  parts.ctx = ctx;
  const offline = ctx.offline === true;
  if (parts.add) return updateAdd(root, parts, ctx, offline);

  const { ids, source } = current(parts);
  setText(root.querySelector(".source"), ctx.t(`card.pocket.quick.summary.${source}`, { count: ids.length }));
  setText(root.querySelector(".about"), ctx.t("card.pocket.quick.hint"));
  const key = JSON.stringify([ids, ctx.lang]);
  if (key !== parts.key) {
    parts.key = key;
    root.querySelector(".rows").replaceChildren(...ids.map((id, i) => {
      const row = el("div", "row qa", `<span class="label"><span class="name"></span><small></small></span>
        <span class="tools"><button class="tool up" type="button">${icon("mdi:arrow-up")}</button><button class="tool down" type="button">${icon("mdi:arrow-down")}</button><button class="tool remove" type="button">${icon("mdi:close")}</button></span>`);
      row.dataset.id = id;
      row.querySelector(".up").disabled = i === 0;
      row.querySelector(".down").disabled = i === ids.length - 1;
      row.querySelector(".up").addEventListener("click", () => move(parts, id, -1));
      row.querySelector(".down").addEventListener("click", () => move(parts, id, 1));
      row.querySelector(".remove").addEventListener("click", () =>
        parts.save({ quick: current(parts).ids.filter((other) => other !== id) }));
      return row;
    }));
  }
  for (const row of root.querySelectorAll(".row.qa")) {
    const id = row.dataset.id;
    const name = nameOf(id, ctx.config, ctx.hass, ctx.t);
    setText(row.querySelector(".name"), name);
    setText(row.querySelector("small"), hintOf(ctx, id));
    setAttr(row.querySelector(".up"), "aria-label", ctx.t("card.pocket.quick.up", { name }));
    setAttr(row.querySelector(".down"), "aria-label", ctx.t("card.pocket.quick.down", { name }));
    setAttr(row.querySelector(".remove"), "aria-label", ctx.t("card.pocket.quick.remove", { name }));
    for (const tool of row.querySelectorAll(".tool")) if (offline) tool.disabled = true;
  }
  const empty = root.querySelector(".empty");
  empty.hidden = ids.length > 0;
  setText(empty, ctx.t("card.pocket.quick.empty"));
  setText(root.querySelector(".add .name"), ctx.t("card.pocket.quick.add"));
  root.querySelector(".add").disabled = offline;
  const reset = root.querySelector(".reset");
  reset.hidden = source !== "person";
  setText(reset.querySelector(".name"), ctx.t("card.pocket.quick.reset"));
  setText(reset.querySelector("small"), ctx.t("card.pocket.quick.reset_hint"));
  reset.disabled = offline;
}

function updateAdd(root, parts, ctx, offline) {
  const { ids } = current(parts);
  const groups = candidatesOf(ctx.config, ctx.hass, ids);
  const key = JSON.stringify([groups, ctx.lang]);
  if (key !== parts.key) {
    parts.key = key;
    root.querySelector(".groups").replaceChildren(...groups.map(({ group, ids: list }) => {
      const box = el("div", "group menu", `<h3 class="gh"></h3>`);
      setText(box.querySelector(".gh"), ctx.t(`card.pocket.quick.groups.${group}`));
      for (const id of list) {
        const row = el("button", "row", `<span class="label"><span class="name"></span><small></small></span>${icon("mdi:plus")}`);
        row.type = "button";
        row.dataset.id = id;
        setText(row.querySelector(".name"), nameOf(id, ctx.config, ctx.hass, ctx.t));
        setText(row.querySelector("small"), hintOf(ctx, id));
        row.addEventListener("click", () => {
          parts.save({ quick: [...current(parts).ids, id] });
          if (parts.ctx.back) parts.ctx.back("#/settings/quick");
          else parts.ctx.navigate?.("#/settings/quick");
        });
        box.append(row);
      }
      return box;
    }));
  }
  for (const row of root.querySelectorAll(".groups button.row")) row.disabled = offline;
  const none = root.querySelector(".none-left");
  none.hidden = groups.length > 0;
  setText(none, ctx.t("card.pocket.quick.none_left"));
}
