// One area's settings (SPEC-038 §3.9): the content of Settings → Areas → <area>
// (#/settings/areas/<area id>, pages/settings-page.js), a full page with its back to the list. The area
// page's settings button and an area "Main sensor not set" in the Inside / Outside sheet open it too.
//
// Built from the generic setting controls of Settings (DESIGN.md 10.1, 4.7): every setting is a row,
// its name on the left with where its value came from under it, its value on the right as a native
// drop-down (a choice among fixed options is always a drop-down in Settings); a long value wraps under
// the name rather than being cut.
//   - Type: Inside / Outside / Not assigned;
//   - Main sensors: one row per kind of lib/kinds.json, in its order, of its candidates
//     (lib/kinds.js candidatesOf: each device or sensor by its name) and None; under a device kind
//     whose chosen device lacks a reading HA does not classify (an air score or index, §3.4), one row
//     per such reading, of that device's unclassified measurement sensors.
// A change shows at once and is saved through ctx.home.set (lib/home-store.js, and for climate Home
// Assistant's area fields); a failure toasts (lib/report.js) and the next update shows what is
// stored. Only an administrator changes anything: for anyone else every drop-down is disabled and a
// line at the top says so.
//
//   renderAreaSettings(ctx, areaId) -> element      updateAreaSettings(el, ctx)

import { KINDS, unclassifiedOf, entityName } from "./kinds.js";
import { sourceKey } from "./home-model.js";
import { reportError } from "./report.js";
import { el, setText, setAttr } from "./page-kit.js";

const TYPES = ["inside", "outside", "none"];

const roomOf = (ctx, id) => ctx.home?.model?.rooms?.find((room) => room.id === id) ?? null;

function save(root, change) {
  const parts = root._aset;
  const run = parts.ctx.home?.set?.(parts.area, change);
  if (!run?.catch) return;
  run.catch(() => reportError(root, "card.pocket.areas.save_error")).finally(() => {
    if (root.isConnected) updateAreaSettings(root, parts.ctx);
  });
}

function option(value, text) {
  const node = el("option");
  node.value = value;
  node.textContent = text;
  return node;
}

// A setting row: the name and its source on the left, the drop-down on the right.
export function pickRow(className = "") {
  const row = el("label", `row pick ${className}`.trim(), `<span class="label"><span class="name"></span><small></small></span><select></select>`);
  return { row, name: row.querySelector(".name"), small: row.querySelector("small"), select: row.querySelector("select") };
}

function fill(select, options, key, holder) {
  if (holder.key === key) return;
  holder.key = key;
  select.replaceChildren(...options.map(([value, text]) => option(value, text)));
}

export function renderAreaSettings(ctx, areaId) {
  const root = el("div", "area-settings");
  root.innerHTML = `<p class="hint admin" hidden></p>
    <div class="group type"><h3 class="gh"></h3></div>
    <div class="group kinds"><h3 class="gh"></h3></div>`;
  const parts = { ctx, area: areaId, kinds: [] };
  root._aset = parts;

  parts.type = pickRow("type-row");
  root.querySelector(".type").append(parts.type.row);
  parts.type.select.addEventListener("change", () => {
    const type = parts.type.select.value === "none" ? null : parts.type.select.value;
    if ((roomOf(parts.ctx, parts.area)?.type ?? null) === type) return;
    parts.shownType = type;
    save(root, { type });
  });

  for (const kind of KINDS) {
    const entry = { kind, main: pickRow(), readings: [], readingsKey: null };
    entry.main.row.dataset.kind = kind.id;
    entry.main.select.addEventListener("change", () => {
      const main = roomOf(parts.ctx, parts.area)?.main?.[kind.id];
      const choice = entry.main.select.value || null;
      const candidate = main?.candidates?.find((c) => c.id === choice);
      save(root, { kind: kind.id, choice, readings: choice ? { ...(candidate?.readings ?? {}) } : {} });
    });
    entry.host = el("div", "readings");
    root.querySelector(".kinds").append(entry.main.row, entry.host);
    parts.kinds.push(entry);
  }
  updateAreaSettings(root, ctx);
  return root;
}

export function updateAreaSettings(root, ctx) {
  const parts = root._aset;
  if (!parts) return;
  parts.ctx = ctx;
  const room = roomOf(ctx, parts.area);
  const admin = ctx.home?.admin === true;
  const hint = root.querySelector(".admin");
  hint.hidden = admin;
  setText(hint, ctx.t("card.pocket.areas.admin_only"));
  if (!room) return;

  setText(root.querySelector(".type .gh"), ctx.t("card.pocket.areas.type"));
  setText(root.querySelector(".kinds .gh"), ctx.t("card.pocket.areas.main_sensors"));
  const type = parts.type;
  setText(type.name, ctx.t("card.pocket.areas.type"));
  fill(type.select, TYPES.map((t) => [t, ctx.t(`card.pocket.areas.types.${t}`)]), ctx.lang, type);
  // A picked type shows at once; the store's answer takes over when it arrives.
  if (parts.shownType !== undefined && (room.type ?? null) === parts.shownType) parts.shownType = undefined;
  const shown = (parts.shownType !== undefined ? parts.shownType : room.type) ?? "none";
  if (type.select.value !== shown) type.select.value = shown;
  type.select.disabled = !admin;
  setText(type.small, room.typeSource ? ctx.t(sourceKey(room.typeSource)) : "");

  for (const entry of parts.kinds) drawKind(root, parts, entry, room, ctx, admin);
}

function drawKind(root, parts, entry, room, ctx, admin) {
  const { kind, main: row } = entry;
  const main = room.main?.[kind.id] ?? { candidates: [], readings: {} };
  setText(row.name, ctx.t(`card.pocket.areas.kind.${kind.id}`));
  const options = [["", ctx.t("card.pocket.areas.none")], ...main.candidates.map((c) => [c.id, c.name])];
  // A choice that is not a candidate (a sensor the inputs name, a device no longer in the area).
  if (main.choice && !main.candidates.some((c) => c.id === main.choice)) {
    options.push([main.choice, main.missing ? `${main.name} · ${ctx.t("card.pocket.areas.missing")}` : main.name ?? main.choice]);
  }
  fill(row.select, options, JSON.stringify([ctx.lang, options]), row);
  const value = main.choice ?? "";
  if (row.select.value !== value) row.select.value = value;
  row.select.disabled = !admin;
  let src = ctx.t(sourceKey(main.source));
  if (!main.choice && main.candidates.length > 1) src = ctx.t("card.pocket.areas.choose", { count: main.candidates.length });
  else if (!main.choice && !main.candidates.length) src = ctx.t("card.pocket.areas.no_candidates");
  setText(row.small, src);

  // Readings the chosen device has no device class for (§3.4): what the device lacks by class, not
  // what is still unpicked, so a picked reading keeps its row.
  const device = main.choice && !main.choice.startsWith("entity:") ? main.choice : null;
  const byClass = main.candidates.find((c) => c.id === device)?.readings ?? {};
  const missing = kind.pick === "device" && device ? kind.readings.filter((r) => !byClass[r.id]) : [];
  const pickable = device ? unclassifiedOf(ctx.hass, device) : [];
  const shown = missing.length && pickable.length ? missing : [];
  const key = JSON.stringify([shown.map((r) => r.id), pickable]);
  if (key !== entry.readingsKey) {
    entry.readingsKey = key;
    entry.readings = shown.map((reading) => {
      const pick = pickRow("sub");
      pick.row.dataset.reading = reading.id;
      fill(pick.select, [["", ctx.t("card.pocket.areas.none")], ...pickable.map((id) => [id, entityName(ctx.hass, id)])], key, pick);
      pick.select.addEventListener("change", () => {
        const current = roomOf(parts.ctx, parts.area)?.main?.[kind.id];
        const readings = { ...(current?.readings ?? {}) };
        if (pick.select.value) readings[reading.id] = pick.select.value;
        else delete readings[reading.id];
        save(root, { kind: kind.id, choice: current?.choice ?? device, readings });
      });
      return { reading, ...pick };
    });
    entry.host.replaceChildren(...entry.readings.map((r) => r.row));
  }
  for (const pick of entry.readings) {
    setText(pick.name, ctx.t(`card.pocket.trend.reading.${pick.reading.id}`));
    setText(pick.small, ctx.t("card.pocket.areas.reading_of", { device: main.name ?? "" }));
    const v = main.readings?.[pick.reading.id] ?? "";
    if (pick.select.value !== v) pick.select.value = v;
    pick.select.disabled = !admin;
  }
}
