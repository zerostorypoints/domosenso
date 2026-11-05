// Home's Sections: one tile per page this home has (the bar's pages but Home and Settings, in the
// bar's order), each with one headline, one status line and a tone that says whether the page is
// worth a look, so every page is a tap from Home whatever the bar holds. Each summary reads what
// its page reads, with the levels it already uses; nothing of its own. Plain ES module: no DOM.
//
//   sectionsOf(ctx, {today?, pages?}) -> [{page, route, icon, head, status, tone}]   pages: only these
//       tone "poor" | "fair" (a dot in that colour, the tile's border too) | null (nothing to see);
//       today: the Power page's energy today (lib/energy.js todayNow), when the caller has it.
//   A page whose component or devices this home lacks has no tile: the floor plan without the
//   floorplan component, Power without a power sensor, Plants without a plant, Media without a
//   player, Climate without a reading to check.
//
// What each says:
//   Areas      the number of areas (the Outside included); the lights on
//   Climate    "All in range" or how many readings need a look (lib/checks.js: the rooms' comfort
//              ranges and air limits, as the attention pills: not the Outside); the rooms they are
//              in; poor / fair by the worst
//   Media      what plays (the first player playing, lib/media.js playersOf), else nothing playing;
//              the player's name, else the number of players
//   Power      power now (lib/power.js powerNow); energy today, or how many meters are unavailable
//              (fair: a meter that reads nothing is worth a look)
//   Plants     all fine, or how many plants need something (lib/plants.js); the worst one's name and
//              reason; poor for a thirsty or a too wet plant, fair for any other reason
//   Scenes     how many scenes the person shows, else none chosen; how many the home has
//   Floor plan the whole home on one plan
//   System     the updates waiting, else up to date; the last backup's age (lib/system.js: its tone)

import { TABS, optionalPages } from "./router.js";
import { areasOf } from "./areas.js";
import { checksOf } from "./checks.js";
import { playersOf } from "./media.js";
import { powerSensors, powerNow, watts } from "./power.js";
import { plantsOf } from "./plants.js";
import { lightsOnIn, number, pluralOf } from "./page-kit.js";
import { wattsText } from "../pages/power-page.js";
import { SYSTEM } from "./router.js";
import { allScenes, chosenScenes } from "./scenes.js";
import { ago, systemOf } from "./system.js";

const GONE = new Set(["unavailable", "unknown"]);
const PAGES = [...TABS.map((tab) => tab.page).filter((page) => page !== "home" && page !== "settings"), SYSTEM.page];
const TAB_OF = Object.fromEntries([...TABS, SYSTEM].map((tab) => [tab.page, tab]));

export function sectionsOf(ctx, { today = null, pages = PAGES } = {}) {
  const hidden = optionalPages(ctx.config);
  const out = [];
  for (const page of PAGES) {
    if (hidden.includes(page) || !pages.includes(page)) continue;
    const summary = SUMMARIES[page](ctx, { today });
    if (!summary) continue;
    const tab = TAB_OF[page];
    out.push({ page, route: tab.route, icon: tab.icon, tone: null, ...summary });
  }
  return out;
}


const SUMMARIES = {
  areas(ctx) {
    const areas = areasOf(ctx.config, ctx.t);
    const on = lightsOnIn(ctx.hass, ctx.config.rooms ?? []);
    return { head: ctx.t(`card.pocket.sections.areas.count.${pluralOf(ctx, areas.length)}`, { count: areas.length }),
      status: ctx.t(`card.pocket.sections.areas.lights_on.${pluralOf(ctx, on)}`, { count: on }) };
  },

  climate(ctx) {
    // The rooms only, as the attention pills: the Outside out of the comfort range (cold in winter)
    // is weather, not something to act on; the Outside chip colours it.
    const groups = checksOf(ctx.hass, ctx.config, { inside: true });
    const rows = groups.flatMap((g) => g.rows.map((row) => ({ ...row, area: g.area })));
    const judged = rows.filter((row) => row.result);
    if (!judged.length) return null;
    const bad = judged.filter((row) => row.result.level === "poor" || row.result.level === "fair");
    if (!bad.length) return { head: ctx.t("card.pocket.sections.climate.fine"), status: ctx.t(`card.pocket.sections.climate.checked.${pluralOf(ctx, judged.length)}`, { count: judged.length }) };
    const names = [...new Set(bad.map((row) => row.area.name))];
    return { head: ctx.t(`card.pocket.sections.climate.look.${pluralOf(ctx, bad.length)}`, { count: bad.length }), status: names.join(", "),
      tone: bad.some((row) => row.result.level === "poor") ? "poor" : "fair" };
  },

  media(ctx) {
    const players = playersOf(ctx.config, ctx.hass);
    if (!players.length) return null;
    const states = ctx.hass?.states ?? {};
    const on = players.find((p) => states[p.id]?.state === "playing");
    if (!on) return { head: ctx.t("card.pocket.home.nothing_playing"), status: ctx.t(`card.pocket.sections.media.players.${pluralOf(ctx, players.length)}`, { count: players.length }) };
    const a = states[on.id].attributes ?? {};
    return { head: a.media_title || a.friendly_name || on.id, status: a.media_title ? (a.friendly_name || on.id) : on.room.name };
  },

  power(ctx, { today }) {
    const groups = powerSensors(ctx.hass, ctx.config);
    const ids = groups.flatMap((g) => g.devices.flatMap((d) => d.entities));
    if (!ids.length) return null;
    const now = powerNow(ctx.hass, groups);
    const states = ctx.hass?.states ?? {};
    const silent = ids.filter((id) => !states[id] || GONE.has(states[id].state)).length;
    const head = now ? wattsText(ctx, now.watts) : ctx.t("card.pocket.format.none");
    if (silent) return { head, status: ctx.t(`card.pocket.sections.power.silent.${pluralOf(ctx, silent)}`, { count: silent }), tone: "fair" };
    if (today) {
      return { head, status: ctx.t("card.pocket.sections.power.today", {
        value: ctx.t("card.pocket.trend.value", { value: number(ctx, today.kwh, today.kwh < 10 ? 2 : 1), unit: "kWh" }) }) };
    }
    const reading = ids.filter((id) => watts(ctx.hass, id) != null).length || ids.length;
    return { head, status: ctx.t(`card.pocket.power.meters.${pluralOf(ctx, reading)}`, { count: reading }) };
  },

  plants(ctx) {
    const plants = plantsOf(ctx.hass, ctx.config).flatMap((g) => g.plants);
    if (!plants.length) return null;
    const need = plants.filter((p) => p.reasons.length).sort((a, b) => a.rank - b.rank);
    if (!need.length) return { head: ctx.t("card.pocket.sections.plants.fine"), status: ctx.t(`card.pocket.sections.plants.count.${pluralOf(ctx, plants.length)}`, { count: plants.length }) };
    const worst = need[0];
    return { head: ctx.t(`card.pocket.sections.plants.need.${pluralOf(ctx, need.length)}`, { count: need.length }),
      status: `${worst.name} · ${ctx.t(`card.pocket.plants.reason.${worst.reasons[0]}`)}`,
      tone: worst.rank <= 1 ? "poor" : "fair" };
  },

  scenes(ctx) {
    const all = allScenes(ctx.hass, ctx.config, ctx.t).reduce((sum, g) => sum + g.scenes.length, 0);
    if (!all) return null;
    const shown = chosenScenes(ctx.settings, ctx.config).filter((id) => ctx.hass?.states?.[id]).length;
    return { head: shown ? ctx.t(`card.pocket.sections.scenes.shown.${pluralOf(ctx, shown)}`, { count: shown })
      : ctx.t("card.pocket.sections.scenes.none"),
    status: ctx.t(`card.pocket.sections.scenes.all.${pluralOf(ctx, all)}`, { count: all }) };
  },

  system(ctx) {
    const sys = systemOf(ctx.hass);
    if (!sys.backup && !sys.updates.length && !Object.keys(ctx.hass?.states ?? {}).some((id) => id.startsWith("update."))) return null;
    const head = sys.updates.length
      ? ctx.t(`card.pocket.sections.system.updates.${pluralOf(ctx, sys.updates.length)}`, { count: sys.updates.length })
      : ctx.t("card.pocket.sections.system.up_to_date");
    let status = "";
    if (sys.backup?.failed) status = ctx.t("card.pocket.sections.system.backup_failed");
    else if (sys.backup?.age != null) status = ctx.t("card.pocket.sections.system.backup", { when: ago(ctx.lang, sys.backup.age) });
    else if (sys.backup) status = ctx.t("card.pocket.sections.system.no_backup");
    return { head, status, tone: sys.tone };
  },

  floorplan(ctx) {
    return { head: ctx.t("card.pocket.sections.floorplan.head"), status: ctx.t("card.pocket.sections.floorplan.status") };
  },
};
