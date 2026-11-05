import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, legacyRoute, TABS, tabOf, barTabs, MAX_TABS, optionalPages, defaultBar } from "./router.js";

test("the pages and an area by id", () => {
  assert.deepEqual(parseRoute("#/"), { page: "home" });
  for (const page of ["areas", "climate", "media", "power", "plants", "settings", "floorplan"]) {
    assert.deepEqual(parseRoute(`#/${page}`), { page });
  }
  assert.deepEqual(parseRoute("#/area/kitchen"), { page: "area", id: "kitchen" });
  assert.deepEqual(parseRoute("#/area/outside"), { page: "area", id: "outside" });
  assert.deepEqual(parseRoute("#/floorplan/living_room"), { page: "floorplan", id: "living_room" }, "opened from an area");
  assert.deepEqual(parseRoute("#/media/living%20room"), { page: "media", id: "living room" });
  assert.deepEqual(parseRoute("#/media/"), { page: "media" });
  assert.deepEqual(parseRoute("#/media/a/b"), { page: "home" });
  assert.equal(tabOf("media"), "media");
});

test("an empty hash is home", () => {
  assert.deepEqual(parseRoute(""), { page: "home" });
  assert.deepEqual(parseRoute("#"), { page: "home" });
  assert.deepEqual(parseRoute(undefined), { page: "home" });
});

test("anything unknown is home", () => {
  assert.deepEqual(parseRoute("#/nowhere"), { page: "home" });
  assert.deepEqual(parseRoute("#/area"), { page: "home" });
  assert.deepEqual(parseRoute("#/area/"), { page: "home" });
  assert.deepEqual(parseRoute("#/area/a/b"), { page: "home" });
  assert.deepEqual(parseRoute("#/areas/x"), { page: "home" });
  assert.deepEqual(parseRoute("areas"), { page: "home" });
});

test("an area id is decoded; a trailing slash is tolerated", () => {
  assert.deepEqual(parseRoute("#/area/living%20room"), { page: "area", id: "living room" });
  assert.deepEqual(parseRoute("#/areas/"), { page: "areas" });
  assert.deepEqual(parseRoute("#/area/%E0%A4%A"), { page: "home" });
});

test("the first version's routes have new hashes; others have none", () => {
  assert.equal(legacyRoute("#/rooms"), "#/areas");
  assert.equal(legacyRoute("#/rooms/"), "#/areas");
  assert.equal(legacyRoute("#/room/kitchen"), "#/area/kitchen");
  assert.equal(legacyRoute("#/room/living%20room/"), "#/area/living%20room");
  for (const hash of ["#/", "#/areas", "#/area/kitchen", "#/room", "#/room/", "#/room/a/b", "#/roomsx", undefined]) {
    assert.equal(legacyRoute(hash), null, String(hash));
  }
});

test("every page the bar can show, in order; an area and the floor plan belong to Areas", () => {
  assert.deepEqual(TABS.map((tab) => tab.page), ["home", "areas", "climate", "media", "power", "plants", "floorplan", "settings"]);
  assert.deepEqual(TABS.map((tab) => tab.route),
    ["#/", "#/areas", "#/climate", "#/media", "#/power", "#/plants", "#/floorplan", "#/settings"]);
  for (const tab of TABS) assert.deepEqual(parseRoute(tab.route), { page: tab.page });
  assert.equal(tabOf("area"), "areas");
  assert.equal(tabOf("floorplan"), "areas");
  assert.equal(tabOf("floorplan", ["home", "floorplan", "settings"]), "floorplan", "its own tab when the bar has one");
  assert.equal(tabOf("area", ["home", "floorplan", "settings"]), "areas");
  assert.equal(tabOf("areas"), "areas");
  assert.equal(tabOf("home"), "home");
});

test("the bar: Home and Settings always, the chosen pages in the bar's order, at most five", () => {
  const pages = (chosen) => barTabs(chosen).map((tab) => tab.page);
  assert.equal(MAX_TABS, 5);
  assert.deepEqual(pages(["home", "areas", "climate", "media", "settings"]), ["home", "areas", "climate", "media", "settings"]);
  assert.deepEqual(pages(["plants", "areas"]), ["home", "areas", "plants", "settings"]);
  assert.deepEqual(pages([]), ["home", "settings"]);
  assert.deepEqual(pages(undefined), ["home", "settings"]);
  assert.deepEqual(pages(["power", "power", "nowhere"]), ["home", "power", "settings"]);
  assert.deepEqual(pages(["areas", "climate", "media", "power", "plants"]), ["home", "areas", "climate", "media", "settings"]);
});

test("the floor plan is on the bar only for a home with the floorplan component", () => {
  assert.deepEqual(optionalPages({}), ["floorplan"]);
  assert.deepEqual(optionalPages({ floorplan: true }), []);
  const pages = (chosen, config) => barTabs(chosen, { without: optionalPages(config) }).map((tab) => tab.page);
  assert.deepEqual(pages(["areas", "floorplan"], {}), ["home", "areas", "settings"]);
  assert.deepEqual(pages(["areas", "floorplan"], { floorplan: true }), ["home", "areas", "floorplan", "settings"]);
  assert.deepEqual(barTabs(["floorplan"]).map((tab) => tab.page), ["home", "floorplan", "settings"]);
});

test("the default bar: Media without plants; with plants Plants in its place; Power off", () => {
  assert.deepEqual(defaultBar({}), ["home", "areas", "climate", "media", "settings"]);
  assert.deepEqual(defaultBar(undefined), ["home", "areas", "climate", "media", "settings"]);
  assert.deepEqual(defaultBar({ plants: true }), ["home", "areas", "climate", "plants", "settings"]);
  assert.equal(barTabs(defaultBar({ plants: true })).length, MAX_TABS);
  assert.ok(!defaultBar({ plants: true }).includes("power"));
});

test("Settings' panels are routes of their own; an unknown panel is Settings", () => {
  assert.deepEqual(parseRoute("#/settings/comfort"), { page: "settings", id: "comfort" });
  assert.deepEqual(parseRoute("#/settings/about/"), { page: "settings", id: "about" });
  assert.deepEqual(parseRoute("#/settings/nope"), { page: "settings" });
});
