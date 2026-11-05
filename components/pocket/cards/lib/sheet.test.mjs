import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../testing/dom-env.mjs";
import { createSheet, SHEET_STYLE } from "./sheet.js";
import { pointer } from "../testing/demo-home.mjs";

const t = (key) => ({ "card.pocket.sheet.close": "Close" })[key] ?? key;

function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const sheet = createSheet(host, { t });
  const closed = [];
  sheet.onClose = (content) => closed.push(content);
  const content = document.createElement("p");
  content.textContent = "Hello";
  return { host, sheet, closed, content, layer: host.querySelector(".sheet-layer") };
}

const drag = (target, from, to) => {
  pointer(target, "pointerdown", 100, from);
  pointer(target, "pointermove", 100, (from + to) / 2);
  pointer(target, "pointermove", 100, to);
  pointer(target, "pointerup", 100, to);
};

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "#/");
});

test("open shows the content in a dialog with a grab handle and a translated close button", () => {
  const { sheet, content, layer } = setup();
  assert.equal(layer.hidden, true);
  sheet.open(content, "Temperature");
  assert.equal(layer.hidden, false);
  assert.equal(sheet.isOpen, true);
  assert.equal(sheet.content, content);
  const dialog = layer.querySelector("[role=dialog]");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(dialog.getAttribute("aria-label"), "Temperature");
  assert.ok(layer.querySelector(".grab"));
  assert.equal(layer.querySelector(".close").getAttribute("aria-label"), "Close");
  assert.ok(layer.querySelector(".body").contains(content));
});

test("the close button and the handle strip are at least 44 px; the sheet sits over the bar", () => {
  assert.match(SHEET_STYLE, /\.close \{[^}]*width: 44px; height: 44px/);
  assert.match(SHEET_STYLE, /\.grab \{[^}]*min-height: 44px/);
  const z = Number(SHEET_STYLE.match(/\.sheet-layer \{[^}]*z-index: (\d+)/)[1]);
  assert.ok(z > 4, "above the bar's z-index 4");
});

test("the close button closes it and goes back over its history entry", () => {
  const { sheet, closed, content, layer } = setup();
  const before = window.history.length;
  sheet.open(content, "T");
  assert.equal(window.history.length, before + 1, "open pushes an entry");
  assert.ok(window.history.state?.pocketSheet);
  assert.equal(window.location.hash, "#/", "the URL stays");
  let backs = 0;
  const back = window.history.back;
  window.history.back = () => { backs += 1; };
  try {
    layer.querySelector(".close").click();
  } finally {
    window.history.back = back;
  }
  assert.equal(sheet.isOpen, false);
  assert.equal(layer.hidden, true);
  assert.deepEqual(closed, [content]);
  assert.equal(backs, 1);
});

test("Back (popstate to the entry under the sheet) closes it without another back", () => {
  const { sheet, closed, content } = setup();
  sheet.open(content, "T");
  window.history.replaceState(null, "", "#/");     // the browser is back on the entry under it
  sheet.onPopState();
  assert.equal(sheet.isOpen, false);
  assert.equal(closed.length, 1);
  sheet.onPopState();
  assert.equal(closed.length, 1, "a second pop does nothing");
});

test("a popstate that still names this sheet keeps it open", () => {
  const { sheet, content } = setup();
  sheet.open(content, "T");
  sheet.onPopState();
  assert.equal(sheet.isOpen, true);
});

test("a drag down the handle of 72 px or more closes; a shorter one springs back", () => {
  const { sheet, content, layer } = setup();
  const grab = layer.querySelector(".grab");
  const panel = layer.querySelector(".sheet");
  sheet.open(content, "T");
  pointer(grab, "pointerdown", 100, 300);
  pointer(grab, "pointermove", 100, 340);
  assert.equal(panel.style.transform, "translateY(40px)", "the sheet follows the finger");
  pointer(grab, "pointermove", 100, 250);
  assert.equal(panel.style.transform, "translateY(0px)", "never above where it opened");
  pointer(grab, "pointerup", 100, 340);
  assert.equal(sheet.isOpen, true);
  assert.equal(panel.style.transform, "");
  drag(grab, 300, 380);
  assert.equal(sheet.isOpen, false);
});

test("a tap on the dimmed page or Escape closes it; dismiss closes without going back", () => {
  const { sheet, content, layer } = setup();
  sheet.open(content, "T");
  layer.querySelector(".scrim").click();
  assert.equal(sheet.isOpen, false);
  sheet.open(content, "T");
  layer.querySelector(".close").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(sheet.isOpen, false);
  sheet.open(content, "T");
  let backs = 0;
  const back = window.history.back;
  window.history.back = () => { backs += 1; };
  try {
    sheet.dismiss();
  } finally {
    window.history.back = back;
  }
  assert.equal(sheet.isOpen, false);
  assert.equal(backs, 0);
});

test("one sheet at a time: a second open replaces the first and its history entry", () => {
  const { sheet, closed, content } = setup();
  const other = document.createElement("p");
  const before = window.history.length;
  sheet.open(content, "A");
  sheet.open(other, "B");
  assert.equal(sheet.content, other);
  assert.deepEqual(closed, [content]);
  assert.equal(window.history.length, before + 1, "one Back closes it");
  assert.equal(window.history.state.pocketSheet, sheet.token);
});
