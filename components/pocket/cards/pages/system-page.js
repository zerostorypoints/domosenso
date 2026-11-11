// The System page (#/system), reached from Home's Systems, on the page contract of pages/index.js
// (lib/system.js reads it all from Home Assistant):
//   - Backup: when the last automatic backup succeeded, in its tone (fair after BACKUP_FAIR, poor
//     after BACKUP_POOR or when the last attempt failed), and the backup manager's state;
//   - Updates: each update waiting, its installed and its new version; a row opens Home Assistant's
//     more-info, where an administrator installs or skips it;
//   - Not reading: the devices whose every entity is unavailable, with their area;
//   - for an administrator, a link to Home Assistant's settings (opened inside HA, no reload);
//   - for an administrator of a home with the Wi-Fi survey (config wifi_survey, SPEC-045), its row.
// render() builds the frame once; the lists are rebuilt only when what they hold changes.

import { BACKUP_FAIR, BACKUP_POOR, ago, systemOf } from "../lib/system.js";
import { openInHa } from "./settings-page.js";
import { el, setAttr, setText } from "../lib/page-kit.js";

const STYLE = `
  .system .top { padding: 4px 4px 8px; }
  .system .top b { font-size: 24px; font-weight: 650; letter-spacing: -.4px; }
  .system .group { margin: 0 0 16px; padding: 4px 14px; background: var(--card); border: 1px solid var(--line); border-radius: 18px; }
  .system .group[hidden], .system .admin[hidden], .system .none[hidden] { display: none; }
  .system h3 { margin: 10px 0 4px; font-size: 13px; font-weight: 600; color: var(--mut); }
  .system .row { box-sizing: border-box; width: 100%; min-height: 48px; margin: 0; padding: 6px 0; border: 0;
                 border-top: 1px solid var(--line); background: none; color: var(--fg); font: inherit; font-size: 15px;
                 display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; }
  .system h3 + .row, .system h3 + div > .row:first-child { border-top: 0; }
  .system button.row { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .system .row .label { flex: 1 1 7em; min-width: 0; overflow-wrap: break-word; }
  .system .row small { display: block; font-size: 12.5px; color: var(--mut); }
  .system .row .v { flex: 0 0 auto; font-weight: 600; text-align: right; }
  .system .lv-fair { color: var(--warn); }
  .system .lv-poor { color: var(--bad); }
  .system .none { margin: 6px 0 10px; font-size: 13px; color: var(--mut); }
  .system .admin { display: flex; align-items: center; justify-content: center; min-height: 44px; margin: 4px 0 12px;
                   border-radius: 12px; background: var(--chip); color: var(--acc); font-size: 15px; text-decoration: none; }
  .system button:focus-visible, .system a:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
`;

const SETTINGS_URL = "/config/dashboard";

export function render(ctx) {
  const root = el("section", "system");
  root.innerHTML = `<style>${STYLE}</style>
    <div class="top"><b></b></div>
    <div class="group backup"><h3></h3>
      <div class="row last"><span class="label"></span><span class="v"></span></div>
      <div class="row state"><span class="label"></span><span class="v"></span></div>
    </div>
    <div class="group updates"><h3></h3><div class="list"></div><p class="none"></p></div>
    <div class="group silent"><h3></h3><div class="list"></div><p class="none"></p></div>
    <div class="group wifi" hidden><button class="row" type="button"><span class="label"><span class="n"></span><small></small></span><span class="v">›</span></button></div>
    <a class="admin" hidden></a>`;
  const parts = { ctx, updatesKey: null, silentKey: null };
  const admin = root.querySelector(".admin");
  admin.addEventListener("click", (event) => {
    event.preventDefault();
    openInHa(SETTINGS_URL);
  });
  root.querySelector(".wifi button").addEventListener("click", () => parts.ctx.navigate("#/wifi-survey"));
  root._system = parts;
  update(root, ctx);
  return root;
}

function moreInfo(node, entityId) {
  const event = new Event("hass-more-info", { bubbles: true, composed: true });
  event.detail = { entityId };
  node.dispatchEvent(event);
}

export function update(root, ctx) {
  const parts = root._system;
  parts.ctx = ctx;
  const { hass } = ctx;
  const $ = (sel) => root.querySelector(sel);
  const sys = systemOf(hass);
  setText($(".top b"), ctx.t("card.pocket.system.title"));

  const backup = $(".backup");
  backup.hidden = !sys.backup;
  setText(backup.querySelector("h3"), ctx.t("card.pocket.system.backup"));
  if (sys.backup) {
    setText(backup.querySelector(".last .label"), ctx.t("card.pocket.system.last_backup"));
    const value = backup.querySelector(".last .v");
    setText(value, sys.backup.failed ? ctx.t("card.pocket.system.failed")
      : sys.backup.age == null ? ctx.t("card.pocket.format.none") : ago(ctx.lang, sys.backup.age));
    const tone = sys.backup.failed || sys.backup.age == null || sys.backup.age > BACKUP_POOR ? "lv-poor"
      : sys.backup.age > BACKUP_FAIR ? "lv-fair" : "";
    const name = ["v", tone].filter(Boolean).join(" ");
    if (value.className !== name) value.className = name;
    setText(backup.querySelector(".state .label"), ctx.t("card.pocket.system.manager"));
    setText(backup.querySelector(".state .v"), sys.backup.state
      ? ctx.t(`card.pocket.system.state.${sys.backup.state}`) : ctx.t("card.pocket.format.none"));
  }

  const updates = $(".updates");
  setText(updates.querySelector("h3"), ctx.t("card.pocket.system.updates"));
  const updatesKey = sys.updates.join(" ");
  if (updatesKey !== parts.updatesKey) {
    parts.updatesKey = updatesKey;
    updates.querySelector(".list").replaceChildren(...sys.updates.map((id) => {
      const row = el("button", "row", `<span class="label"><span class="n"></span><small></small></span><span class="v">›</span>`);
      row.type = "button";
      row.dataset.entity = id;
      row.addEventListener("click", () => moreInfo(row, id));
      return row;
    }));
  }
  for (const row of updates.querySelectorAll(".row")) {
    const a = hass?.states?.[row.dataset.entity]?.attributes ?? {};
    setText(row.querySelector(".n"), a.title || a.friendly_name || row.dataset.entity);
    setText(row.querySelector("small"), ctx.t("card.pocket.system.version", {
      from: a.installed_version ?? "?", to: a.latest_version ?? "?" }));
  }
  const noUpdates = updates.querySelector(".none");
  noUpdates.hidden = sys.updates.length > 0;
  setText(noUpdates, ctx.t("card.pocket.system.up_to_date"));

  const silent = $(".silent");
  setText(silent.querySelector("h3"), ctx.t("card.pocket.system.silent"));
  const silentKey = JSON.stringify(sys.silent.map((d) => [d.device, d.name, d.area]));
  if (silentKey !== parts.silentKey) {
    parts.silentKey = silentKey;
    silent.querySelector(".list").replaceChildren(...sys.silent.map((d) => {
      const row = el("div", "row", `<span class="label"><span class="n"></span><small></small></span>`);
      row.querySelector(".n").textContent = d.name;
      row.querySelector("small").textContent = d.area ?? "";
      return row;
    }));
  }
  const noSilent = silent.querySelector(".none");
  noSilent.hidden = sys.silent.length > 0;
  setText(noSilent, ctx.t("card.pocket.system.all_reading"));

  const wifi = $(".wifi");
  wifi.hidden = hass?.user?.is_admin !== true || !ctx.config?.wifi_survey;
  setText(wifi.querySelector(".n"), ctx.t("card.pocket.wifi.row"));
  setText(wifi.querySelector("small"), ctx.t("card.pocket.wifi.row_hint"));

  // HA's settings are an administrator's only.
  const admin = $(".admin");
  admin.hidden = hass?.user?.is_admin !== true;
  setAttr(admin, "href", SETTINGS_URL);
  setText(admin, ctx.t("card.pocket.system.open_settings"));
}
