// The area settings sheet (SPEC-038 §3.9), kind "area-settings" {area, title}: an area's type and its
// main sensor per kind, opened from the area page's settings button, a row of Settings → Areas and an
// area "Main sensor not set" in the Inside / Outside sheet. On the page contract of the sheets
// (render(ctx, spec), update(el, ctx)).
//
//   - Type: Inside / Outside / Not assigned (a segmented control), and where it came from;
//   - one row per kind of lib/kinds.js KINDS, in its order: the kind's name, a native drop-down of
//     its candidates (lib/kinds.js candidatesOf: each device or sensor by its name) and None, and
//     where the choice came from ("Set in Pocket", "Set in Home Assistant", "From the home's
//     setup", "Found automatically") or how many candidates wait for a choice;
//   - for a device kind whose chosen device lacks a reading HA does not classify (an air score or
//     index, §3.4): one drop-down per such reading, of that device's unclassified measurement
//     sensors.
// A change shows at once and is saved through ctx.home.set (lib/home-store.js, and for climate Home
// Assistant's area fields); a failure toasts (lib/report.js) and the next update shows what is
// stored. Only an administrator can change anything: for anyone else every control is disabled, with
// a line that says so.

import { KINDS, unclassifiedOf, entityName } from "./kinds.js";
import { sourceKey } from "./home-model.js";
import { reportError } from "./report.js";
import { el, setText, setAttr } from "./page-kit.js";

const TYPES = ["inside", "outside", null];

export const AREA_SETTINGS_STYLE = `
  .aset { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 12px; }
  .aset .dtitle { display: flex; flex-direction: column; gap: 2px; }
  .aset .dtitle b { font-size: 17px; }
  .aset .dtitle span, .aset small, .aset .hint { color: var(--mut); font-size: 12.5px; }
  .aset h4 { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--mut); }
  .aset .seg { display: flex; gap: 4px; padding: 4px; background: var(--chip); border-radius: 14px; }
  .aset .seg button { flex: 1 1 0; min-height: 44px; margin: 0; border: 0; border-radius: 10px; background: none;
    color: var(--fg); font: inherit; font-size: 14px; }
  .aset .seg button[aria-checked="true"] { background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
  .aset .seg button:disabled { opacity: .6; }
  .aset .kind { display: flex; flex-direction: column; gap: 4px; }
  .aset select { box-sizing: border-box; width: 100%; min-height: 44px; padding: 0 10px; border: 1px solid var(--line);
    border-radius: 10px; background: var(--card); color: var(--fg); font: inherit; }
  .aset .reading { padding-left: 12px; }
  .aset [hidden] { display: none; }
`;

const roomOf = (ctx, id) => ctx.home?.model?.rooms?.find((room) => room.id === id) ?? null;

function save(root, change) {
  const parts = root._aset;
  const run = parts.ctx.home?.set?.(parts.area, change);
  if (!run?.catch) return;
  run.catch(() => reportError(root, "card.pocket.areas.save_error")).finally(() => {
    if (root.isConnected) update(root, parts.ctx);
  });
}

function option(value, text) {
  const node = el("option");
  node.value = value;
  node.textContent = text;
  return node;
}

export function render(ctx, spec) {
  const root = el("div", "aset");
  root.innerHTML = `<style>${AREA_SETTINGS_STYLE}</style>
    <div class="dtitle"><b></b><span></span></div>
    <p class="hint admin" hidden></p>
    <div class="type"><h4></h4><div class="seg" role="radiogroup"></div><small class="src"></small></div>
    <div class="kinds"></div>`;
  const parts = { ctx, area: spec.area, root, types: [], kinds: [] };
  root._aset = parts;
  for (const type of TYPES) {
    const button = el("button");
    button.type = "button";
    setAttr(button, "role", "radio");
    button.dataset.type = type ?? "none";
    button.addEventListener("click", () => {
      const room = roomOf(parts.ctx, parts.area);
      if ((room?.type ?? null) === type) return;
      parts.shownType = type;
      update(root, parts.ctx);
      save(root, { type });
    });
    parts.types.push(button);
    root.querySelector(".seg").append(button);
  }
  for (const kind of KINDS) {
    const box = el("div", "kind", `<h4></h4><select></select><small class="src"></small><div class="readings"></div>`);
    box.dataset.kind = kind.id;
    const select = box.querySelector("select");
    select.addEventListener("change", () => {
      const room = roomOf(parts.ctx, parts.area);
      const main = room?.main?.[kind.id];
      const choice = select.value || null;
      const candidate = main?.candidates?.find((c) => c.id === choice);
      save(root, { kind: kind.id, choice, readings: choice ? { ...(candidate?.readings ?? {}) } : {} });
    });
    parts.kinds.push({ kind, box, select, key: null, readingsKey: null, readingSelects: [] });
    root.querySelector(".kinds").append(box);
  }
  update(root, ctx);
  return root;
}

export function update(root, ctx) {
  const parts = root._aset;
  if (!parts) return;
  parts.ctx = ctx;
  const room = roomOf(ctx, parts.area);
  const admin = ctx.home?.admin === true;
  setText(root.querySelector(".dtitle b"), room?.name ?? parts.area);
  setText(root.querySelector(".dtitle span"), ctx.t("card.pocket.areas.settings"));
  const hint = root.querySelector(".admin");
  hint.hidden = admin;
  setText(hint, ctx.t("card.pocket.areas.admin_only"));
  if (!room) return;

  setText(root.querySelector(".type h4"), ctx.t("card.pocket.areas.type"));
  setAttr(root.querySelector(".seg"), "aria-label", ctx.t("card.pocket.areas.type"));
  // A tapped type shows at once; the store's answer takes over when it arrives.
  if (parts.shownType !== undefined && (room.type ?? null) === parts.shownType) parts.shownType = undefined;
  const type = parts.shownType !== undefined ? parts.shownType : room.type ?? null;
  for (const button of parts.types) {
    const value = button.dataset.type === "none" ? null : button.dataset.type;
    setText(button, ctx.t(`card.pocket.areas.types.${button.dataset.type}`));
    setAttr(button, "aria-checked", String(value === type));
    button.disabled = !admin;
  }
  setText(root.querySelector(".type .src"), room.typeSource ? ctx.t(sourceKey(room.typeSource)) : "");

  for (const entry of parts.kinds) drawKind(root, parts, entry, room, ctx, admin);
}

function drawKind(root, parts, entry, room, ctx, admin) {
  const { kind, box, select } = entry;
  const main = room.main?.[kind.id] ?? { candidates: [], readings: {} };
  setText(box.querySelector("h4"), ctx.t(`card.pocket.areas.kind.${kind.id}`));
  const options = [["", ctx.t("card.pocket.areas.none")], ...main.candidates.map((c) => [c.id, c.name])];
  // A choice that is not a candidate (a sensor the inputs name, a device no longer in the area).
  if (main.choice && !main.candidates.some((c) => c.id === main.choice)) {
    options.push([main.choice, main.missing ? `${main.name} · ${ctx.t("card.pocket.areas.missing")}` : main.name ?? main.choice]);
  }
  const key = JSON.stringify(options);
  if (key !== entry.key) {
    entry.key = key;
    select.replaceChildren(...options.map(([value, text]) => option(value, text)));
  }
  const value = main.choice ?? "";
  if (select.value !== value) select.value = value;
  select.disabled = !admin;
  setAttr(select, "aria-label", ctx.t(`card.pocket.areas.kind.${kind.id}`));
  let src = ctx.t(sourceKey(main.source));
  if (!main.choice && main.candidates.length > 1) src = ctx.t("card.pocket.areas.choose", { count: main.candidates.length });
  else if (!main.choice && !main.candidates.length) src = ctx.t("card.pocket.areas.no_candidates");
  setText(box.querySelector(".src"), src);

  // Readings the chosen device has no device class for (§3.4).
  const device = main.choice && !main.choice.startsWith("entity:") ? main.choice : null;
  // What the device lacks by class, not what is still unpicked: a picked reading keeps its row.
  const byClass = main.candidates.find((c) => c.id === device)?.readings ?? {};
  const missing = kind.pick === "device" && device ? kind.readings.filter((r) => !byClass[r.id]) : [];
  const pickable = device ? unclassifiedOf(ctx.hass, device) : [];
  const shown = missing.length && pickable.length ? missing : [];
  const overrides = (r) => main.readings?.[r.id];
  const readingsKey = JSON.stringify([shown.map((r) => r.id), pickable]);
  const host = box.querySelector(".readings");
  if (readingsKey !== entry.readingsKey) {
    entry.readingsKey = readingsKey;
    entry.readingSelects = shown.map((reading) => {
      const row = el("div", "kind reading", `<small></small><select></select>`);
      const sel = row.querySelector("select");
      sel.replaceChildren(option("", ctx.t("card.pocket.areas.none")), ...pickable.map((id) => option(id, entityName(ctx.hass, id))));
      sel.addEventListener("change", () => {
        const current = roomOf(parts.ctx, parts.area)?.main?.[kind.id];
        const readings = { ...(current?.readings ?? {}) };
        if (sel.value) readings[reading.id] = sel.value;
        else delete readings[reading.id];
        save(root, { kind: kind.id, choice: current?.choice ?? device, readings });
      });
      return { reading, row, sel };
    });
    host.replaceChildren(...entry.readingSelects.map((r) => r.row));
  }
  for (const { reading, row, sel } of entry.readingSelects) {
    setText(row.querySelector("small"), ctx.t("card.pocket.areas.reading_pick", { reading: ctx.t(`card.pocket.trend.reading.${reading.id}`) }));
    const v = overrides(reading) ?? "";
    if (sel.value !== v) sel.value = v;
    sel.disabled = !admin;
  }
}

export const areaSettingsSheet = { render, update };
