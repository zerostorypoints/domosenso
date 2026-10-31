import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./testing/dom-env.mjs";
import { shadowText } from "./testing/dom-env.mjs";
import "./plants-card.js";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

afterEach(() => mock.timers.reset());

// Default bands: moisture 15-60 %, conductivity 350-2000 µS/cm, brightness from 500 lx.
const HEALTHY = { friendly_name: "Fern", moisture: 40, conductivity: 800, max_brightness: 2000 };

function makeCard({ lang = "pl", plants, config = {} }) {
  const card = document.createElement("plants-card");
  card.setConfig({ plants: plants.map((_, i) => ({ entity: `plant.p${i}` })), ...config });
  const states = Object.fromEntries(plants.map((attrs, i) => [`plant.p${i}`, { state: "ok", attributes: attrs }]));
  card.hass = { locale: { language: lang }, states, callWS: async () => ({}) };
  return card;
}

const action = (card, i = 0) => card.shadowRoot.querySelectorAll(".action")[i].textContent;
const gaugeLabels = (card) => [...card.shadowRoot.querySelectorAll(".plant:first-of-type .gl")].map((e) => e.textContent);

test("a plant that needs nothing shows no text", () => {
  for (const lang of ["en", "de", "pl"]) assert.equal(action(makeCard({ lang, plants: [HEALTHY] })), "", lang);
});

test("a dry plant shows the water action per language", () => {
  const dry = { ...HEALTHY, moisture: 5 };
  for (const [lang, text] of [["en", "Water"], ["de", "Giessen"], ["pl", "Podlej"]]) {
    assert.equal(action(makeCard({ lang, plants: [dry] })), text, lang);
  }
});

test("the other actions per language, today's Polish verbatim", () => {
  const cases = [
    [{ moisture: 80 }, "Nie podlewaj"],
    [{ max_brightness: 100 }, "Więcej światła"],
    [{ conductivity: 100 }, "Nawieź"],
    [{ conductivity: 3000 }, "Przepłucz ziemię"],
    [{ problem: "temperature low" }, "Za zimno"],
    [{ problem: "temperature high" }, "Za ciepło"],
    [{ moisture: undefined }, "brak odczytu"],
  ];
  for (const [change, text] of cases) assert.equal(action(makeCard({ lang: "pl", plants: [{ ...HEALTHY, ...change }] })), text);
  const en = ["Don't water", "More light", "Fertilise", "Flush the soil", "Too cold", "Too warm", "no reading"];
  const de = ["Nicht giessen", "Mehr Licht", "Düngen", "Erde durchspülen", "Zu kalt", "Zu warm", "kein Messwert"];
  cases.forEach(([change], i) => {
    assert.equal(action(makeCard({ lang: "en", plants: [{ ...HEALTHY, ...change }] })), en[i]);
    assert.equal(action(makeCard({ lang: "de", plants: [{ ...HEALTHY, ...change }] })), de[i]);
  });
});

test("several actions are joined with a middle dot", () => {
  const card = makeCard({ lang: "en", plants: [{ ...HEALTHY, moisture: 5, conductivity: 100 }] });
  assert.equal(action(card), "Water · Fertilise");
});

test("gauge labels per language", () => {
  for (const [lang, labels] of [["en", ["Sun", "Fertiliser", "Water"]], ["de", ["Sonne", "Dünger", "Wasser"]], ["pl", ["Słońce", "Nawóz", "Woda"]]]) {
    assert.deepEqual(gaugeLabels(makeCard({ lang, plants: [HEALTHY] })), labels, lang);
  }
});

test("the title counts the plants to water", () => {
  const plants = [{ ...HEALTHY, moisture: 5 }, { ...HEALTHY, moisture: 3 }, HEALTHY];
  for (const [lang, text] of [["en", "Plants · to water: 2"], ["de", "Plants · zu giessen: 2"], ["pl", "Plants · do podlania: 2"]]) {
    assert.equal(makeCard({ lang, plants, config: { title: "Plants" } }).shadowRoot.querySelector(".title").textContent, text, lang);
  }
  assert.equal(makeCard({ plants: [HEALTHY], config: { title: "Plants" } }).shadowRoot.querySelector(".title").textContent, "Plants");
});

test("plants that need water come first", () => {
  const card = makeCard({ lang: "en", plants: [HEALTHY, { ...HEALTHY, friendly_name: "Cactus", moisture: 5 }] });
  assert.equal(card.shadowRoot.querySelector(".name").textContent, "Cactus");
});

test("in English no Polish letter reaches the page", () => {
  const plants = [{ ...HEALTHY, moisture: 5, conductivity: 100, max_brightness: 100, problem: "temperature low" }, { ...HEALTHY, moisture: undefined }];
  assert.doesNotMatch(shadowText(makeCard({ lang: "en", plants, config: { title: "Plants" } })), POLISH);
});

// ---- SPEC-022: discover mode, photos, soft states, pages, derived lines --------------------------

const BANDS = { min_moisture: 15, max_moisture: 60, min_conductivity: 350, max_conductivity: 2000, min_brightness: 500 };
const plant = (name, extra = {}) => ({ friendly_name: name, moisture: 40, conductivity: 800, max_brightness: 2000,
  domosenso_plant: true, domosenso_room: "Living room", domosenso_bands: BANDS, ...extra });

function discoverCard({ lang = "pl", plants, states = {}, config = {}, attach = false }) {
  const card = document.createElement("plants-card");
  card.setConfig({ discover: true, ...config });
  const all = { ...states };
  plants.forEach((attrs, i) => { all[`plant.d${i}`] = { state: "ok", attributes: attrs }; });
  if (attach) document.body.appendChild(card);
  card.hass = { locale: { language: lang }, states: all, callWS: async () => ({}) };
  return card;
}

const names = (card) => [...card.shadowRoot.querySelectorAll(".name")].map((e) => e.textContent);
const meta = (card, i = 0) => card.shadowRoot.querySelectorAll(".meta")[i].textContent;
const stripText = (card) => {
  const strip = card.shadowRoot.querySelector(".strip");
  return strip && `${strip.querySelector(".pg").textContent} ${strip.querySelector(".cnt").textContent}`;
};

test("setConfig needs plants or discover", () => {
  const card = document.createElement("plants-card");
  assert.throws(() => card.setConfig({}), /plants/);
  card.setConfig({ discover: true });
});

test("discover finds plants by domosenso_plant and ignores other plant entities", () => {
  const card = discoverCard({ lang: "en", plants: [plant("Fern")],
    states: { "plant.other": { state: "ok", attributes: { friendly_name: "Not ours", moisture: 40 } } } });
  assert.deepEqual(names(card), ["Fern"]);
  assert.equal(card.shadowRoot.querySelector(".room").textContent, "Living room");
});

test("photo: entity_picture becomes the tile image; without it a leaf in the state's colour, no letter", () => {
  const card = discoverCard({ plants: [plant("Fern", { entity_picture: "/local/plants/fern.jpg" }), plant("Basil")] });
  const photos = [...card.shadowRoot.querySelectorAll(".photo")];
  assert.equal(photos[0].querySelector("img").getAttribute("src"), "/local/plants/fern.jpg");
  assert.ok(!photos[1].querySelector("img"));
  assert.equal(photos[1].textContent.trim(), "");
  assert.ok(photos[1].querySelector(".leaf"));
  assert.match(card.shadowRoot.innerHTML, /\.photo\s*\{[^}]*color:\s*var\(--c\)/);
});

test("states: good, neutral and needs something; no red anywhere", () => {
  const card = discoverCard({ lang: "en", plants: [plant("Good"), plant("Dry", { moisture: 5 })],
    states: { "sensor.d0_water_in_days": { state: "2", attributes: {} } } });
  const tiles = [...card.shadowRoot.querySelectorAll(".plant")];
  assert.deepEqual(tiles.map((t) => t.dataset.state), ["need", "neutral"]);
  const card2 = discoverCard({ plants: [plant("Good")] });
  assert.equal(card2.shadowRoot.querySelector(".plant").dataset.state, "good");
  for (const c of [card, card2]) assert.doesNotMatch(c.shadowRoot.innerHTML.toLowerCase(), /#ff6b5c/);
  assert.match(card.shadowRoot.innerHTML.toLowerCase(), /#f5b942/);
});

test("up to per_page plants: one tile page; 1 fills the card; up to 4 show the bars, 5-6 do not", () => {
  const one = discoverCard({ plants: [plant("A")] });
  assert.equal(one.shadowRoot.querySelector(".page").style.gridTemplateColumns, "repeat(1, 1fr)");
  assert.ok(!one.shadowRoot.querySelector(".strip"));
  const four = discoverCard({ plants: ["A", "B", "C", "D"].map((n) => plant(n)) });
  assert.equal(four.shadowRoot.querySelectorAll(".plant .g").length, 12);
  const six = discoverCard({ plants: ["A", "B", "C", "D", "E", "F"].map((n) => plant(n)) });
  assert.equal(six.shadowRoot.querySelectorAll(".plant").length, 6);
  assert.equal(six.shadowRoot.querySelectorAll(".plant .g").length, 0);
  assert.match(stripText(six), /^1 \/ 2/);  // the list page follows (amendment 2)
});

test("15 plants, per_page 6: three tile pages (and three list pages), needy first, strip with 15 dots and the count", () => {
  const plants = Array.from({ length: 15 }, (_, i) => plant(`P${i}`, i >= 12 ? { moisture: 5 } : {}));
  const card = discoverCard({ plants });
  assert.equal(card.shadowRoot.querySelectorAll(".plant").length, 6);
  assert.deepEqual(names(card).slice(0, 3).sort(), ["P12", "P13", "P14"]);
  assert.equal(card.shadowRoot.querySelectorAll(".dots i").length, 15);
  assert.equal(card.shadowRoot.querySelectorAll(".dots i.here").length, 6);
  assert.match(stripText(card), /^1 \/ 6 .*3 do uwagi · 12 w porządku$/);
});

test("50 plants: the strip's dots are grouped by room", () => {
  const rooms = ["Office", "Kitchen"];
  const plants = Array.from({ length: 50 }, (_, i) => plant(`P${i}`, { domosenso_room: rooms[i % 2] }));
  const card = discoverCard({ plants });
  const dots = [...card.shadowRoot.querySelectorAll(".dots i")].map((d) => d.dataset.room);
  const firstKitchen = dots.indexOf("Kitchen");
  assert.ok(dots.slice(0, firstKitchen).every((r) => r === dots[0]) && dots.slice(firstKitchen).every((r) => r === "Kitchen"));
  assert.match(stripText(card), /^1 \/ 17/);
});

test("pages advance every page_s and the index survives a new card element", () => {
  globalThis.localStorage = window.localStorage;
  window.localStorage.clear();
  mock.timers.enable({ apis: ["setTimeout"] });
  const plants = Array.from({ length: 15 }, (_, i) => plant(`P${String(i).padStart(2, "0")}`));
  const card = discoverCard({ plants, config: { page_s: 10 }, attach: true });
  assert.match(stripText(card), /^1 \/ 6/);
  mock.timers.tick(10000);
  assert.match(stripText(card), /^2 \/ 6/);
  card.remove();
  const again = discoverCard({ plants, config: { page_s: 10 }, attach: true });
  assert.match(stripText(again), /^2 \/ 6/);
  again.remove();
  delete globalThis.localStorage;
});

test("per_page and page_s may be helper entities", () => {
  const plants = Array.from({ length: 8 }, (_, i) => plant(`P${i}`));
  const card = discoverCard({ plants, config: { per_page: "input_number.r_plants_per_page" },
    states: { "input_number.r_plants_per_page": { state: "4.0", attributes: {} } } });
  assert.equal(card.shadowRoot.querySelectorAll(".plant").length, 4);
  assert.match(stripText(card), /^1 \/ 4/);
});

test("a page fewer: a stored index past the last page clamps to the first", () => {
  globalThis.localStorage = window.localStorage;
  window.localStorage.setItem("domosenso.ramka.plants.page", "4");
  const card = discoverCard({ plants: Array.from({ length: 8 }, (_, i) => plant(`P${i}`)) });
  assert.match(stripText(card), /^1 \/ 4/);
  delete globalThis.localStorage;
});

test("derived lines: last watered and water in", () => {
  const days = (n) => new Date(Date.now() - n * 86400000 - 3600000).toISOString();
  const cases = [
    [{ "sensor.d0_last_watered": days(5) }, "podlana 5 dni temu", "watered 5 days ago"],
    [{ "sensor.d0_last_watered": days(0) }, "podlana dziś", "watered today"],
    [{ "sensor.d0_last_watered": days(1) }, "podlana wczoraj", "watered yesterday"],
    [{ "sensor.d0_water_in_days": "0" }, "podlej dziś", "water today"],
    [{ "sensor.d0_water_in_days": "1" }, "podlej jutro", "water tomorrow"],
    [{ "sensor.d0_water_in_days": "4", "sensor.d0_last_watered": days(5) }, "podlej za ~4 dni", "water in ~4 days"],
    [{ "sensor.d0_water_in_days": "unknown", "sensor.d0_last_watered": "unknown" }, "", ""],
  ];
  for (const [s, pl, en] of cases) {
    const states = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { state: v, attributes: {} }]));
    assert.equal(meta(discoverCard({ plants: [plant("Fern")], states })), pl);
    assert.equal(meta(discoverCard({ lang: "en", plants: [plant("Fern")], states })), en);
  }
});

test("discover with no plants says so", () => {
  for (const [lang, text] of [["pl", "brak roślin"], ["en", "no plants"], ["de", "keine Pflanzen"]]) {
    assert.equal(discoverCard({ lang, plants: [] }).shadowRoot.querySelector(".none").textContent, text);
  }
});

test("an unavailable moisture sensor: no reading, neutral, after the needy ones", () => {
  const card = discoverCard({ plants: [plant("Silent", { moisture: undefined }), plant("Dry", { moisture: 5 }), plant("Fine")] });
  assert.deepEqual(names(card), ["Dry", "Silent", "Fine"]);
  const silent = card.shadowRoot.querySelectorAll(".plant")[1];
  assert.equal(silent.dataset.state, "neutral");
  assert.equal(silent.querySelector(".action").textContent, "brak odczytu");
});

test("names and rooms per language from domosenso_names and domosenso_rooms", () => {
  const basil = plant("Basil", { domosenso_names: { en: "Basil", de: "Basilikum", pl: "Bazylia" },
    domosenso_rooms: { en: "Kitchen", de: "Küche", pl: "Kuchnia" } });
  for (const [lang, name, room] of [["pl", "Bazylia", "Kuchnia"], ["de", "Basilikum", "Küche"], ["en", "Basil", "Kitchen"], ["fr", "Basil", "Kitchen"]]) {
    const card = discoverCard({ lang, plants: [basil] });
    assert.deepEqual(names(card), [name], lang);
    assert.equal(card.shadowRoot.querySelector(".room").textContent, room, lang);
  }
  const card = discoverCard({ lang: "pl", plants: [plant("Fern", { domosenso_names: { en: "Fern" } })] });
  assert.deepEqual(names(card), ["Fern"]);
});

test("watered today and yesterday follow the calendar, not 24 hours", () => {
  const lastNight = new Date(); lastNight.setHours(0, 0, 0, 0); lastNight.setMinutes(-60);  // 23:00 yesterday
  const states = { "sensor.d0_last_watered": { state: lastNight.toISOString(), attributes: {} } };
  assert.equal(meta(discoverCard({ plants: [plant("Fern")], states })), "podlana wczoraj");
});

test("an update that changes none of the card's entities does no work", () => {
  const card = discoverCard({ plants: [plant("Fern")] });
  const states = card._hass.states;
  let updates = 0;
  const original = card._update.bind(card);
  card._update = () => { updates += 1; original(); };
  card.hass = { locale: { language: "pl" }, states: { ...states, "sensor.radar": { state: "1", attributes: {} } }, callWS: async () => ({}) };
  assert.equal(updates, 0);
  card.hass = { locale: { language: "pl" }, states: { ...states, "plant.d0": { state: "ok", attributes: plant("Fern", { moisture: 5 }) } }, callWS: async () => ({}) };
  assert.equal(updates, 1);
});

// ---- Amendment 2: the list page ----------------------------------------------------------------

const listRows = (card) => [...card.shadowRoot.querySelectorAll(".list .row:not(.top)")];
const turn = (card, n = 1) => { for (let i = 0; i < n; i++) mock.timers.tick(10000); };

test("five plants: the tiles, then a list page with every plant, its bars and line", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const plants = ["A", "B", "C", "D", "E"].map((n) => plant(n));
  const card = discoverCard({ lang: "en", plants, config: { page_s: 10 }, attach: true });
  assert.equal(card.shadowRoot.querySelectorAll(".plant").length, 5);
  assert.match(stripText(card), /^1 \/ 2/);
  turn(card);
  assert.equal(card.shadowRoot.querySelectorAll(".plant").length, 0);
  const rows = listRows(card);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.querySelector(".name").textContent), ["A", "B", "C", "D", "E"]);
  for (const r of rows) {
    assert.equal(r.querySelectorAll(".g").length, 3);
    assert.ok(r.querySelector("svg.chart"));
    assert.ok(r.querySelector(".photo svg.leaf"));
  }
  assert.match(stripText(card), /^2 \/ 2/);
  card.remove();
});

test("the list's header per language", () => {
  const plants = ["A", "B", "C", "D", "E"].map((n) => plant(n));
  for (const [lang, head] of [["en", ["Plant", "Sun", "Fertiliser", "Water", "Last 7 days"]],
    ["de", ["Pflanze", "Sonne", "Dünger", "Wasser", "Letzte 7 Tage"]],
    ["pl", ["Roślina", "Słońce", "Nawóz", "Woda", "Ostatnie 7 dni"]]]) {
    globalThis.localStorage = window.localStorage;
    window.localStorage.setItem("domosenso.ramka.plants.page", "1");
    const card = discoverCard({ lang, plants });
    const cells = [...card.shadowRoot.querySelectorAll(".list .row.top > span")].map((e) => e.textContent).filter(Boolean);
    assert.deepEqual(cells, head, lang);
    delete globalThis.localStorage;
  }
});

test("a row's line: the room always, then the action, else watered / water in", () => {
  globalThis.localStorage = window.localStorage;
  window.localStorage.setItem("domosenso.ramka.plants.page", "1");
  const plants = [plant("Dry", { moisture: 5 }), plant("Watered"), plant("C"), plant("D"), plant("E")];
  const days = new Date(Date.now() - 5 * 86400000 - 3600000).toISOString();
  const card = discoverCard({ lang: "en", plants, states: { "sensor.d1_last_watered": { state: days, attributes: {} } } });
  const line = (name) => listRows(card).find((r) => r.querySelector(".name").textContent === name).querySelector(".sub").textContent;
  assert.equal(line("Dry"), "Living room · Water");
  assert.equal(line("Watered"), "Living room · watered 5 days ago");
  assert.equal(line("C"), "Living room");
  const dry = listRows(card).find((r) => r.querySelector(".name").textContent === "Dry");
  assert.equal(dry.querySelector(".sub .what").textContent, " · Water");
  assert.ok(dry.querySelector(".sub .what").classList.contains("act"));
  delete globalThis.localStorage;
});

test("four plants or fewer: no list page", () => {
  const card = discoverCard({ plants: ["A", "B", "C", "D"].map((n) => plant(n)) });
  assert.ok(!card.shadowRoot.querySelector(".strip"));
  assert.ok(!card.shadowRoot.querySelector(".list"));
});

test("list: false drops the list pages", () => {
  const card = discoverCard({ plants: ["A", "B", "C", "D", "E"].map((n) => plant(n)), config: { list: false } });
  assert.ok(!card.shadowRoot.querySelector(".strip"));
});

test("15 plants: three tile pages, then three list pages of five rows", () => {
  globalThis.localStorage = window.localStorage;
  const plants = Array.from({ length: 15 }, (_, i) => plant(`P${String(i).padStart(2, "0")}`));
  const counts = [];
  for (const page of [3, 4, 5]) {
    window.localStorage.setItem("domosenso.ramka.plants.page", String(page));
    const card = discoverCard({ plants });
    assert.match(stripText(card), new RegExp(`^${page + 1} / 6`));
    counts.push(listRows(card).length);
    assert.equal(card.shadowRoot.querySelectorAll(".dots i.here").length, 5);
  }
  assert.deepEqual(counts, [5, 5, 5]);
  window.localStorage.setItem("domosenso.ramka.plants.page", "3");
  const rows = discoverCard({ plants, config: { list_rows: 8 } });
  assert.match(stripText(rows), /^4 \/ 5/);
  assert.equal(listRows(rows).length, 8);
  delete globalThis.localStorage;
});

test("a row without a photo keeps its leaf; the moisture line goes to the line column", async () => {
  globalThis.localStorage = window.localStorage;
  window.localStorage.setItem("domosenso.ramka.plants.page", "1");
  const now = Date.now();
  const stats = { "sensor.m0": Array.from({ length: 24 }, (_, i) => ({ start: now - (24 - i) * 3600000, mean: 30 + i })) };
  const card = document.createElement("plants-card");
  card.setConfig({ discover: true });
  const states = {};
  ["A", "B", "C", "D", "E"].forEach((n, i) => { states[`plant.d${i}`] = { state: "ok", attributes: plant(n, { sensors: { moisture: `sensor.m${i}` } }) }; });
  card.hass = { locale: { language: "en" }, states, callWS: async () => stats };
  await new Promise((r) => setTimeout(r, 0));
  const row = listRows(card).find((r) => r.querySelector(".name").textContent === "A");
  assert.ok(row.querySelector(".photo .leaf"));
  assert.match(row.querySelector("svg.chart").innerHTML, /<path/);
  assert.ok(!card.shadowRoot.querySelector(".list .head"));  // .head is the tiles' name block
  delete globalThis.localStorage;
});
