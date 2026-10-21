// The agenda renders from calendar REST responses and the clock: both are fixed here.
// Europe/Zurich leaves summer time on 2026-10-25, so that Sunday is 25 hours long.
process.env.TZ = "Europe/Zurich";

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./agenda-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(dziś|jutro|nic|przypomnienia|cały|dzień|bez tytułu)\b/i;

// 2026-10-24 10:00 in Zurich (08:00 UTC, still summer time).
const SAT_24 = "2026-10-24T08:00:00Z";
const THU_22 = "2026-10-22T08:00:00Z";

afterEach(() => mock.timers.reset());

function makeCard({ now = SAT_24, lang = "pl", events = [], todos, config = {} } = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  const card = document.createElement("agenda-card");
  card.setConfig({ entities: ["calendar.family"], ...config });
  const calls = [];
  card.hass = {
    locale: { language: lang },
    callApi: async (method, path) => { calls.push({ method, path }); return events; },
    callWS: async (msg) => ({ items: todos || [] }),
  };
  return { card, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const dateLabels = (card) => [...card.shadowRoot.querySelectorAll(".head small, .day .label small")].map((e) => e.textContent.trim());

test("DST end: Sat 24, Sun 25, Mon 26 October appear once each, in order", async () => {
  const { card } = makeCard();
  await flush();
  assert.deepEqual(dateLabels(card).slice(0, 3), ["sobota, 24 października", "25 października", "26 października"]);
  assert.equal(dateLabels(card).length, 7);
  assert.equal(dateLabels(card).filter((l) => l.includes("25 października")).length, 1);
});

test("DST end: a window that starts earlier still shows Sun 25 once", async () => {
  const { card } = makeCard({ now: THU_22 });
  await flush();
  const labels = dateLabels(card);
  assert.equal(labels.filter((l) => l.startsWith("25 ")).length, 1);
  assert.deepEqual(labels.map((l) => l.replace(/^.*?(\d+) .*$/, "$1")), ["22", "23", "24", "25", "26", "27", "28"]);
});

test("the request window spans whole calendar days across the DST change", async () => {
  const { card, calls } = makeCard();
  await flush();
  const url = new URLSearchParams(calls[0].path.split("?")[1]);
  assert.equal(new Date(url.get("start")).toISOString(), "2026-10-23T22:00:00.000Z");
  // 24 Oct 00:00 CEST + 7 calendar days = 31 Oct 00:00 CET
  assert.equal(new Date(url.get("end")).toISOString(), "2026-10-30T23:00:00.000Z");
});

const allDay = [{ summary: "Holiday", start: { date: "2026-10-24" }, end: { date: "2026-10-25" } }];

test("all-day label: cały dzień in pl, ganztägig in de, all day in en", async () => {
  for (const [lang, label] of [["pl", "cały dzień"], ["de", "ganztägig"], ["en", "all day"]]) {
    const { card } = makeCard({ lang, events: allDay });
    await flush();
    assert.equal(card.shadowRoot.querySelector(".today .time").textContent, label, lang);
  }
});

test("an untitled event shows the card.agenda.untitled text per language", async () => {
  const events = [{ start: { dateTime: "2026-10-24T14:00:00+02:00" }, end: { dateTime: "2026-10-24T15:00:00+02:00" } }];
  for (const [lang, label] of [["pl", "(bez tytułu)"], ["de", "(ohne Titel)"], ["en", "(untitled)"]]) {
    const { card } = makeCard({ lang, events });
    await flush();
    assert.equal(card.shadowRoot.querySelector(".today .title").textContent, label, lang);
  }
});

test("timed events keep their HH:MM–HH:MM label in local time", async () => {
  const events = [{ summary: "Dentist", start: { dateTime: "2026-10-24T14:00:00+02:00" }, end: { dateTime: "2026-10-24T15:30:00+02:00" } }];
  const { card } = makeCard({ lang: "en", events });
  await flush();
  assert.equal(card.shadowRoot.querySelector(".today .time").textContent, "14:00–15:30");
});

test("headings, empty states and the to-do label follow the language", async () => {
  const todos = [{ summary: "Pay rent", status: "needs_action", due: "2026-10-27" }, { summary: "Done", status: "completed" }];
  const expected = {
    pl: ["Dziś", "Nic w kalendarzu", "Przypomnienia", "jutro"],
    de: ["Heute", "Nichts im Kalender", "Erinnerungen", "morgen"],
    en: ["Today", "Nothing in the calendar", "Reminders", "tomorrow"],
  };
  for (const [lang, [today, empty, reminders, tomorrow]] of Object.entries(expected)) {
    const { card } = makeCard({ lang, todos, config: { todo: "todo.family" } });
    await flush();
    const root = card.shadowRoot;
    assert.ok(root.querySelector(".head").textContent.startsWith(today), lang);
    assert.equal(root.querySelector(".today .none").textContent, empty, lang);
    assert.equal(root.querySelector(".todos .label").textContent, reminders, lang);
    assert.equal(root.querySelector(".day .label").childNodes[0].textContent, tomorrow, lang);
    assert.equal(root.querySelectorAll(".todos .title").length, 1, "completed items are dropped");
  }
});

test("a to-do list with nothing open says so", async () => {
  const exp = { pl: "Nic do zrobienia", de: "Nichts zu erledigen", en: "Nothing to do" };
  for (const [lang, text] of Object.entries(exp)) {
    const { card } = makeCard({ lang, todos: [], config: { todo: "todo.family" } });
    await flush();
    assert.equal(card.shadowRoot.querySelector(".todos .none").textContent, text, lang);
  }
});

test("in English no Polish word reaches the page", async () => {
  const todos = [{ summary: "Pay rent", status: "needs_action", due: "2026-10-27" }];
  const events = [...allDay, { start: { dateTime: "2026-10-24T14:00:00+02:00" }, end: { dateTime: "2026-10-24T15:00:00+02:00" } }];
  const { card } = makeCard({ lang: "en", events, todos, config: { todo: "todo.family" } });
  await flush();
  const text = shadowText(card);
  assert.doesNotMatch(text, POLISH);
  assert.match(text, /Saturday 24 October/);
});

test("a missing language falls back to English", async () => {
  const { card } = makeCard({ lang: "fr", events: allDay });
  await flush();
  assert.equal(card.shadowRoot.querySelector(".today .time").textContent, "all day");
});

test("week row labels use the weekday_short strings of the language", async () => {
  const expected = { pl: ["jutro", "pn"], de: ["morgen", "Mo"], en: ["tomorrow", "Mon"] };
  for (const [lang, [tomorrow, monday]] of Object.entries(expected)) {
    const { card } = makeCard({ lang });
    await flush();
    const names = [...card.shadowRoot.querySelectorAll(".day .label")].map((e) => e.childNodes[0].textContent);
    assert.deepEqual(names.slice(0, 2), [tomorrow, monday], lang);
  }
  const { card } = makeCard({ lang: "pl", now: THU_22 });
  await flush();
  const names = [...card.shadowRoot.querySelectorAll(".day .label")].map((e) => e.childNodes[0].textContent);
  assert.deepEqual(names, ["jutro", "sb", "nd", "pn", "wt", "śr"]);
});
