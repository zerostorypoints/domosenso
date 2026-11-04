import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, TABS, tabOf } from "./router.js";

test("the four pages and a room by id", () => {
  assert.deepEqual(parseRoute("#/"), { page: "home" });
  assert.deepEqual(parseRoute("#/rooms"), { page: "rooms" });
  assert.deepEqual(parseRoute("#/room/kitchen"), { page: "room", id: "kitchen" });
  assert.deepEqual(parseRoute("#/media"), { page: "media" });
  assert.deepEqual(parseRoute("#/settings"), { page: "settings" });
});

test("an empty hash is home", () => {
  assert.deepEqual(parseRoute(""), { page: "home" });
  assert.deepEqual(parseRoute("#"), { page: "home" });
  assert.deepEqual(parseRoute(undefined), { page: "home" });
});

test("anything unknown is home", () => {
  assert.deepEqual(parseRoute("#/nowhere"), { page: "home" });
  assert.deepEqual(parseRoute("#/room"), { page: "home" });
  assert.deepEqual(parseRoute("#/room/"), { page: "home" });
  assert.deepEqual(parseRoute("#/room/a/b"), { page: "home" });
  assert.deepEqual(parseRoute("#/rooms/x"), { page: "home" });
  assert.deepEqual(parseRoute("rooms"), { page: "home" });
});

test("a room id is decoded; a trailing slash is tolerated", () => {
  assert.deepEqual(parseRoute("#/room/living%20room"), { page: "room", id: "living room" });
  assert.deepEqual(parseRoute("#/rooms/"), { page: "rooms" });
  assert.deepEqual(parseRoute("#/room/%E0%A4%A"), { page: "home" });
});

test("the bar's tabs, and a room belongs to Rooms", () => {
  assert.deepEqual(TABS.map((tab) => tab.page), ["home", "rooms", "media", "settings"]);
  assert.deepEqual(TABS.map((tab) => tab.route), ["#/", "#/rooms", "#/media", "#/settings"]);
  assert.equal(tabOf("room"), "rooms");
  assert.equal(tabOf("rooms"), "rooms");
  assert.equal(tabOf("home"), "home");
});
