// The Safety page (#/safety; P4, UC10 broadened): one answer at the top, "All quiet" or what needs a
// look, then a section for each kind the home has, in this order:
//   - Alarms: smoke, gas, carbon monoxide, water leak, tamper (lib/safety.js alarmsOf): detected or
//     clear; one that is not reporting says so (a silent smoke detector is a safety issue itself)
//   - Doors and windows, Locks, Covers: as Controls' Status finds them (the home inputs' rooms list
//     them first). A lock locks at once and unlocks after a second tap; Close all closes every open
//     cover after a second tap
//   - Siren: its state; Test sounds it (a short sound when it takes a duration) after a second tap;
//     Stop while it sounds
//   - Who is home: HA's people (home, away, or the zone they are in) and the rooms whose occupancy
//     or presence sensors sense someone now
// A risky act asks to be confirmed in place (lib/confirm.js): the first tap turns the button into
// "Tap again to …" for a few seconds. A section without entities is left out; a home with none of
// them gets one line. Every service call goes through the optimistic store.

import { el, setAttr, setText } from "../lib/page-kit.js";
import { contactsOf, coversOf, groupedByArea, labelOf, locksOf } from "../lib/controls.js";
import { alarmsOf, issuesOf, occupiedAreas, peopleOf, reporting, sirensOf } from "../lib/safety.js";
import { armed } from "../lib/confirm.js";

const SIREN_DURATION = 16;   // siren supported_features: takes a duration
const TEST_SECONDS = 2;
const COVER_CLOSE = 2;       // cover supported_features

const STYLE = `
  .safety .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 4px 8px; }
  .safety .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .safety .answer { display: flex; align-items: center; gap: 10px; margin: 0 0 6px; padding: 12px 14px; border-radius: 16px;
                    background: var(--card); border: 1px solid var(--line); font-size: 15px; overflow-wrap: break-word; }
  .safety .answer .dot { width: 10px; height: 10px; flex: 0 0 auto; border-radius: 50%; background: var(--good, #2e9d5b); }
  .safety .answer.issues .dot { background: var(--poor, #e5484d); }
  .safety h3 { margin: 18px 4px 8px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .safety h4 { margin: 10px 4px 6px; font-size: 12.5px; font-weight: 600; color: var(--mut); text-transform: uppercase; letter-spacing: .5px; }
  .safety [hidden] { display: none !important; }
  .safety .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 4px 12px; }
  .safety .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-height: 48px; padding: 6px 0;
                 border-top: 1px solid var(--line); }
  .safety .row:first-child { border-top: 0; }
  .safety .row .n { flex: 1 1 8em; min-width: 0; font-size: 15px; overflow-wrap: break-word; }
  .safety .row .v { font-size: 13.5px; color: var(--mut); font-variant-numeric: tabular-nums; }
  .safety .row.on .v { color: var(--poor, #e5484d); font-weight: 600; }
  .safety .row.silent .v { color: var(--fair, #c98a00); }
  .safety .act { min-width: 88px; min-height: 44px; margin: 0 0 0 auto; padding: 0 14px; border: 1px solid var(--line);
                 border-radius: 12px; background: var(--chip); color: var(--fg); font: inherit; font-size: 14px; cursor: pointer; }
  .safety .act[data-armed] { background: var(--poor, #e5484d); border-color: transparent; color: #fff; font-weight: 600; }
  .safety .act:disabled { opacity: .45; cursor: default; }
  .safety .all { display: flex; justify-content: flex-end; padding: 8px 0 4px; }
  .safety .none { margin: 12px 4px; color: var(--mut); font-size: 15px; }
`;

const KINDS = ["alarms", "contacts", "locks", "covers", "siren", "presence"];

export function render(ctx) {
  const root = el("section", "safety");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <p class="answer" role="status"><i class="dot"></i><span></span></p>
    ${KINDS.map((kind) => `<section class="sec ${kind}" hidden><h3></h3><div class="card list"></div>${
      kind === "covers" ? `<div class="all"><button class="act" type="button" data-act="close-all"></button></div>` : ""}</section>`).join("")}
    <p class="none" hidden></p>`;
  const parts = { ctx, keys: {} };
  root._safety = parts;
  const closeAll = root.querySelector('[data-act="close-all"]');
  armed(closeAll, () => parts.ctx.t("card.pocket.safety.confirm_close_all"), () => {
    const { hass, config } = parts.ctx;
    const open = coversOf(hass, config).filter((id) => ["open", "opening"].includes(hass.states[id]?.state)
      && (Number(hass.states[id]?.attributes?.supported_features ?? COVER_CLOSE) & COVER_CLOSE));
    if (open.length) send(parts, "cover", "close_cover", open, Object.fromEntries(open.map((id) => [id, { state: "closing" }])));
  });
  update(root, ctx);
  return root;
}

function send(parts, domain, service, ids, expect, data = {}) {
  const { optimistic, hass } = parts.ctx;
  optimistic?.send(parts.root ?? null, hass, { domain, service, data: { entity_id: ids.length === 1 ? ids[0] : ids, ...data },
    errorKey: "card.pocket.error.safety", expect });
}

export function update(root, ctx) {
  const parts = root._safety;
  parts.ctx = ctx;
  parts.root = root;
  const { hass, config, t } = ctx;
  const $ = (sel) => root.querySelector(sel);
  setText($(".top b"), t("card.pocket.nav.safety"));

  const issues = issuesOf(hass, config);
  const answer = $(".answer");
  answer.classList.toggle("issues", issues.length > 0);
  setText(answer.lastElementChild, issues.length
    ? issues.map((i) => t(`card.pocket.safety.issue.${i.kind}`, { name: labelOf(hass, config, i.id) })).join(" · ")
    : t("card.pocket.safety.quiet"));

  const lists = {
    alarms: alarmsOf(hass), contacts: contactsOf(hass, config), locks: locksOf(hass, config),
    covers: coversOf(hass, config), siren: sirensOf(hass), presence: [...peopleOf(hass), ...occupiedAreas(hass, config, t).flatMap((g) => g.ids)],
  };
  let any = false;
  for (const kind of KINDS) {
    const section = $(`.sec.${kind}`);
    const ids = lists[kind];
    section.hidden = ids.length === 0;
    if (!ids.length) continue;
    any = true;
    setText(section.querySelector("h3"), t(`card.pocket.safety.section.${kind}`));
    const key = JSON.stringify(kind === "presence" ? [ids, occupiedAreas(hass, config, t).map((g) => g.name)] : ids);
    if (parts.keys[kind] !== key) {
      parts.keys[kind] = key;
      section.querySelector(".list").replaceChildren(...rowsOf(parts, kind, ids));
    }
    for (const row of section.querySelectorAll(".row")) fillRow(parts, kind, row);
  }
  const none = $(".none");
  none.hidden = any;
  setText(none, t("card.pocket.safety.none"));
  const closeAll = $('[data-act="close-all"]');
  const open = lists.covers.filter((id) => ["open", "opening"].includes(hass.states[id]?.state));
  closeAll.hidden = open.length === 0;
  closeAll.disabled = !!ctx.offline;
  if (!closeAll.hasAttribute("data-armed")) setText(closeAll, t("card.pocket.safety.close_all"));
}

function rowsOf(parts, kind, ids) {
  const { hass, config, t } = parts.ctx;
  if (kind === "presence") {
    const rows = peopleOf(hass).map((id) => row(id));
    const rooms = occupiedAreas(hass, config, t).filter((g) => g.name);
    if (rooms.length) {
      const r = el("div", "row rooms", `<span class="n"></span><span class="v"></span>`);
      r.dataset.rooms = rooms.map((g) => g.name).join(", ");
      rows.push(r);
    }
    return rows;
  }
  return ids.map((id) => row(id, kind));

  function row(id, k) {
    const r = el("div", "row", `<span class="n"></span><span class="v"></span>`);
    r.dataset.entity = id;
    if (k === "locks" || k === "siren") {
      const act = el("button", "act");
      act.type = "button";
      r.append(act);
      if (k === "locks") {
        armed(act, () => parts.ctx.t("card.pocket.safety.confirm_unlock"), () => send(parts, "lock", "unlock", [id], { [id]: { state: "unlocked" } }),
          () => parts.ctx.hass.states[id]?.state !== "locked",          // locking needs no second tap
          () => send(parts, "lock", "lock", [id], { [id]: { state: "locked" } }));
      } else {
        armed(act, () => parts.ctx.t("card.pocket.safety.confirm_test"), () => {
          const s = parts.ctx.hass.states[id];
          const timed = Number(s?.attributes?.supported_features ?? 0) & SIREN_DURATION;
          send(parts, "siren", "turn_on", [id], { [id]: { state: "on" } }, timed ? { duration: TEST_SECONDS } : {});
        }, () => parts.ctx.hass.states[id]?.state === "on",              // stopping needs no second tap
        () => send(parts, "siren", "turn_off", [id], { [id]: { state: "off" } }));
      }
    }
    return r;
  }
}

function fillRow(parts, kind, row) {
  const { hass, config, t, offline } = parts.ctx;
  const id = row.dataset.entity;
  if (!id) {   // the rooms sensing someone
    setText(row.querySelector(".n"), t("card.pocket.safety.someone_in"));
    setText(row.querySelector(".v"), row.dataset.rooms);
    return;
  }
  const state = hass.states[id];
  const s = state?.state;
  setText(row.querySelector(".n"), labelOf(hass, config, id));
  let words;
  let on = false;
  if (!reporting(state)) words = t("card.pocket.safety.not_reporting");
  else if (kind === "alarms") { on = s === "on"; words = t(`card.pocket.safety.alarm.${on ? "detected" : "clear"}`); }
  else if (kind === "contacts") { on = s === "on"; words = t(`card.pocket.controls.contact.${on ? "open" : "closed"}`); }
  else if (kind === "locks") { on = s !== "locked"; words = t(`card.pocket.controls.lock.${s}`); }
  else if (kind === "covers") { on = s !== "closed"; words = t(`card.pocket.controls.cover.${s}`); }
  else if (kind === "siren") { on = s === "on"; words = t(`card.pocket.safety.siren.${on ? "on" : "off"}`); }
  else if (kind === "presence") words = s === "home" ? t("card.pocket.safety.home") : s === "not_home" ? t("card.pocket.safety.away") : s;
  setText(row.querySelector(".v"), words ?? s);
  row.classList.toggle("on", on && kind !== "presence");
  row.classList.toggle("silent", !reporting(state));
  const act = row.querySelector(".act");
  if (act) {
    act.disabled = !!offline || !reporting(state) && s !== "unknown";
    if (!act.hasAttribute("data-armed")) {
      setText(act, kind === "locks" ? t(`card.pocket.safety.${s === "locked" ? "unlock" : "lock"}`)
        : t(`card.pocket.safety.${s === "on" ? "stop" : "test"}`));
    }
    setAttr(act, "aria-label", `${act.textContent}: ${labelOf(hass, config, id)}`);
  }
}
