// A floor plan of the home (SPEC-028): the rooms of one floor as polygons in metres, each labelled
// with its area's name, and the sensors and plants at their positions with their current readings.
// Wheel, pinch and the + / − / fit buttons zoom; dragging the background pans. In view mode nothing
// reacts to a tap, so the card can sit on a wall tablet.
//
// Administrators get an Edit button (unless `edit: false`): drag points and room corners, add a
// corner (double-click a wall) or remove one (double-click it), split a room, join two, link a room
// to an area or create one, and drag sensors without a position from the tray, one or a room's group
// at a time. Corners snap to a 5 cm grid; rooms show their floor area and wall lengths. Save writes
// the plan back into the `floorplan` dashboard, but only if nobody changed it there since it was loaded.
//
//   type: custom:floorplan-card
//   plan: {schema: 1, floors: [...]}   # optional: else read from the `floorplan` dashboard
//   floor: ground                      # optional: floor_id to show; default the first
//   edit: true                         # false: no Edit button, for embedding
//   values: true                       # false: points without their readings
//   layers: [climate, plants]          # optional: only these categories, no layer chips
//   layer_choice: one                  # with layers: a chip each, one layer shown at a time (the Ramka)
//   maps: true                         # false: no maps on the plants, climate, light and radio layers
//   wifi: true                         # false: no Wi-Fi maps on the radio layer (SPEC-044)
//   traffic: true                      # false: no traffic maps on the radio layer (SPEC-047)
//   fill: true                         # optional: as tall as the screen below the card's top (the Ramka)
//   area: living_room                  # optional: that area's room alone, fitted to the card, no Edit
//   context: true                      # with area: the floor's other rooms faded around it, for orientation
//   zoom: true                         # false: no wheel, pinch, pan or zoom buttons (the page scrolls)
//   chips: true                        # false: no layer chips; a host offers them (layerChips, pressLayer)
//   tap_tips: true                     # false: a finger's tap on a marker shows no tooltip
//
// Events, bubbling out of the card: `room-tap` ({area_id}) for a tap on a room in view mode, and
// `floorplan-status` ({status}: loading, none, unsupported, no_area, ready) when the status changes;
// the host element carries the status as data-status too.
//
// With one of the plants, climate or light layers shown (Amendment 7) the bar offers its maps: the
// reading interpolated inside each room, or the lamps; and "now" or the map's figure over the last
// 24 hours, from the recorder's hourly statistics. With the radio layer shown alone (SPEC-044) it
// offers the predicted Wi-Fi signal per band its access points serve, which access point serves
// each spot, and how far to trust the map (Confidence). With devices reporting their Wi-Fi signal on
// the plan, a Predicted / Calibrated switch: calibrated, the model is fitted to their 24-hour means.

import { createT, formatDate } from "./lib/i18n.js";
import { STYLE } from "./lib/style.js";
import { zoomAt, snapToEdge, pointInPolygon, widestRow, insideRooms } from "./lib/geometry.js";
import {
  supported, emptyPlan, autoPlace, tray, trayGroups, roomLabel, homeRoom, movePoint, moveCorner, insertCorner, removeCorner,
  splitRoom, joinRooms, linkRoom, withPlan, extract, addPoint, addPoints, candidateName, pointName,
  candidates, pointCategory, setPointCategory, joinPoint, separatePoint, registryLinks, presenceEntities,
  openSpaces, openRooms, closeRoom, facingWalls,
} from "./lib/plan.js";
import { categoryById, categoryName, colourOf, PLACEABLE } from "./lib/categories.js";
import { esc, dotHtml } from "./lib/html.js";
import { fitView, frame, toPlan, snapCorner, gridOnWall, nearestWall, entityMap, pointEntities, valueText } from "./lib/view.js";
import { trayHtml } from "./lib/tray.js";
import { KINDS, STYLES, opensInto, kindOf, widthOf, styleOf, openingState, openingShape, wallSpan, addOpening,
  moveOpening, setOpening, swapHinge, swapSide, fillWall, removeOpening, openingSensors, linkedSpots } from "./lib/openings.js";
import { drawGrid, drawDims, drawWallDistances, numberText } from "./lib/measure.js";
import { layoutLabels, placeNames, CHAR_EM } from "./lib/labels.js";
import { MAPS, SCALES, STEP_M, ruleOf, readingIds, labelClasses, figure, nowValue, formatValue, colourAt, heat, areaSensorField, lampIndex, lampOf,
  BAND_OF, TRAFFIC_MAPS, accessPoints, offeredBands, radioMaps, bandsText, servingColour, CONFIDENCE } from "./lib/maps.js";
import { contextFor, coverage, isHandover, cacheKey, priorParams, BANDS, FLOOR_HEIGHT_M, MOUNT_M, wallSegmentAt, materialsFor,
  setWallMaterial, setWifiDefault, setOpeningMaterial, setAccessPoint, setFloorWifi, setOutdoor, openingDefaults, addReading, nextSpots,
  wallLines, setWallHeight, levelGrid, rangeOutlines, wallSegments, wallPickPoint, openingShift } from "./lib/wifi.js";
import { accessPointCandidates, signalEntities, deviceObservations, disabledSignalEntities, sampleObservations,
  observationIndex } from "./lib/wifi-sources.js";
import { calibrate, calibratedCoverage, calibratedLevelGrid } from "./lib/wifi-fit.js";
import { trafficRules, clients, heatCells, apTotals, nodeRates, ringPosition, lineWidth, dotRadius, IDLE_KEY, IDLE_MBPS,
  LINK_COLOURS } from "./lib/traffic.js";
import wifiRules from "./lib/wifi-rules.json" with { type: "json" };
import materials from "./lib/materials.json" with { type: "json" };
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });
const URL_PATH = "floorplan";
const SVG_NS = "http://www.w3.org/2000/svg";
const ZOOM_STEP = 1.25;
const TAP_PX = 5;         // a pointer that moved less than this is a tap, not a drag
const PICK_PX = 12;       // how far from a wall a split pick may land
const LABEL_PX = 14;      // a room name's size on screen, shrunk down to LABEL_MIN_PX to fit its room
const LABEL_MIN_PX = 9;
const STACK_PX = 14;      // placed dots closer than this on screen are one dot with a list
const HIDDEN_KEY = "domosenso.floorplan.hidden";   // localStorage: the layers this browser switched off
const CHOSEN_KEY = "domosenso.floorplan.chosen";   // localStorage: the one layer shown (layer_choice: one)
const MAP_KEY = "domosenso.floorplan.map";         // localStorage: the map chosen per layer
const AGG_KEY = "domosenso.floorplan.day";         // localStorage: true while the maps show the last 24 hours
const BAND_KEY = "domosenso.floorplan.band";       // localStorage: the Serving map's band
const OFFER_KEY = "domosenso.floorplan.ap_offered"; // localStorage: points already offered as access points
const CALIB_KEY = "domosenso.floorplan.calibrated"; // localStorage: "predicted" or "calibrated" on the Wi-Fi maps
const TIP_TARGET = "g.marker[data-key]:not(.ghost), g.client[data-key]";   // what a hover or a finger's tap opens the tip for
const MARKER_R = 8;             // px: the widest marker shape (a diamond) from its centre
const SHARED_RING_M = 0.3;      // clients of one point spread on a ring of this radius around it
const RANGES_KEY = "domosenso.floorplan.ranges";   // localStorage: true while the band maps show each access point's range
const WEIGHTS = ["light", "solid", "heavy"];       // the wall weights of the plan's key (Amendment 3)
const HOUR_MS = 60 * 60 * 1000;
const STATS_MS = HOUR_MS / 2;     // the 24-hour figures are fetched again this often while shown
const FILL_GAP_PX = 8;
const CONTEXT_M = 1.5;             // m of the neighbouring rooms shown around an area (context: true)
const NARROW_PX = 600;             // a card narrower than this (a phone) predicts Wi-Fi on coarser cells
const NARROW_STEP_M = 0.3;
const TRAFFIC_MS = 1000;           // the traffic heat is rebuilt at most this often
const TRAFFIC_BUCKET_MS = 5000;    // the clients are read again at least this often: staleness moves with the clock
const WIFI_MEMO = 8;               // Wi-Fi predictions kept: the bands, and a door or two open or closed
const OBS_DB = 0.5;                // dB: readings closer than this to the last fit's do not fit again
const LINK_MS = 2000;              // the survey page reads the laptop's Wi-Fi link this often

// The devices a link reaches inside a cluster: two names, then how many more.
function linkLabel(names) {
  const sorted = [...names].sort();
  return sorted.length > 2 ? `${sorted.slice(0, 2).join(", ")} +${sorted.length - 2}` : sorted.join(", ");
}

// Browser storage may be missing or refuse (a private window, a preview): then the layers start as
// configured and a choice lasts for this page only.
function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not kept
  }
}

// A room name's screen size: LABEL_PX unless its estimated width (CHAR_EM a character) would pass 90 %
// of the room's widest run, `width` metres at `px` metres per screen pixel.
function labelSize(text, width, px) {
  const needed = String(text).length * CHAR_EM * LABEL_PX * px;
  const room = width * 0.9;
  return needed <= room ? LABEL_PX : Math.max(LABEL_MIN_PX, (LABEL_PX * room) / needed);
}

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (parent) parent.appendChild(node);
  return node;
}

const keyOf = (p) => p.device_id ?? p.entity_id;
// Only a path on this Home Assistant or an http(s) URL is shown as a photo.
const safePicture = (url) => typeof url === "string" && /^(\/(?!\/)|https?:\/\/)/.test(url);
const fmt = (v) => String(Math.round(v * 1e6) / 1e6);
const mm = (v) => Math.round(v * 1000) / 1000;
// A dBm value as a label writes it: whole, with a true minus.
const dbmText = (dbm) => { const v = Math.round(dbm); return `${v < 0 ? "\u2212" : ""}${Math.abs(v)}`; };

class FloorplanCard extends HTMLElement {
  setConfig(config) {
    this._config = { edit: true, values: true, maps: true, zoom: true, chips: true, tap_tips: true, ...config };
    // One area's room (a phone's area page): read-only, so its scoped floor is never saved.
    if (this._config.area) this._config.edit = false;
    this._scoped = new WeakMap();  // floor -> that floor with the area's room alone (config.area)
    this._status = "loading";      // loading | none | unsupported | no_area | ready
    this._doc = null;              // the plan as edited
    this._loaded = null;           // the plan as read: the save guard compares against it
    this._base = null;             // the plan as read, with one empty floor if it had none: Cancel returns here
    this._mode = "view";
    this._tool = "move";
    this._picks = [];              // split: wall points; join: area ids
    this._selected = null;         // move tool: the room whose area panel is open
    this._picked = null;           // move tool: the point whose distances to the walls show
    this._pendingSplit = null;
    this._message = null;          // {key, vars}
    this._view = null;
    this._drag = null;
    this._pointers = new Map();
    this._stamp = null;
    this._trayOpen = new Map();    // tray group key -> open, as the user left it
    this._hidden = new Set(load(HIDDEN_KEY, []));   // category ids switched off by this browser's layer chips
    const listed = Array.isArray(this._config.layers) ? this._config.layers : [];
    this._one = this._config.layer_choice === "one" && listed.length > 0;
    const chosen = load(CHOSEN_KEY, null);
    this._chosen = listed.includes(chosen) ? chosen : listed[0] ?? null;   // with layer_choice: one
    this._entryDomains = {};       // config entry id -> integration domain, once config_entries/get answered
    this._hoverKey = null;         // the marker under the pointer: its registry links show
    this._openCluster = null;      // the room whose cluster list is open (edit mode)
    this._maps = load(MAP_KEY, {}) || {};          // layer -> the device class (or "lamps") of its map
    this._day = load(AGG_KEY, false) === true;     // the maps show the last 24 hours, not now
    this._stats = null;            // statistic id -> hourly rows, the last 24 hours
    this._statIds = "";
    this._statsAt = 0;
    this._heatCache = null;
    this._trafficCache = null;     // the last traffic heat group {key, at, g}, kept for a second
    this._trafficMemo = null;
    this._trafficIdsMemo = null;
    this._trafficTimer = null;     // the one pending rebuild of a throttled heat
    this._tickTimer = null;        // re-checks the stamp while a traffic map is shown
    this._tickMs = 0;
    this._band = load(BAND_KEY, null);             // the Serving map's band, while some access point serves it
    this._wifiMemo = new Map();    // cache key -> a Wi-Fi prediction {cells, aps, hint}
    this._wifiKey = null;          // the last cache key and what it was computed from
    this._wall = null;             // walls tool: the middle of the selected wall stretch
    const offered = load(OFFER_KEY, []);           // another page's or a hand-edited value may be no list
    this._offered = new Set(Array.isArray(offered) ? offered : []);   // points this browser asked "Use as access point?" about
    this._calib = load(CALIB_KEY, null);           // "predicted" chosen; else calibrated once there are readings
    this._ranges = load(RANGES_KEY, false) === true;   // the band maps outline each access point's range
    this._rangeMemo = null;        // the last ranges drawn: {key, aps, lines}
    this._idle = load(IDLE_KEY, true) !== false;      // Traffic links: idle clients drawn small, else hidden
    this._wallMemo = null;         // the walls drawn: {floor, wifi, lines}
    this._obsMemo = null;          // the devices' observations and their digest, and what they came from
    this._fitMemo = null;          // the last fit: {doc, states, digest, fit}
    this._disabled = null;         // edit mode: the plan's switched-off Wi-Fi signal sensors
    this._editSession = 0;
    this._reading = null;          // reading tool: where the manual reading was taken
    // `survey: true` is set by `domosenso floorplan survey`'s page alone: the radio layer, the Survey panel,
    // the laptop's link from the page's own server. Its hass is the preview's read-only one.
    if (this._config.survey && !Array.isArray(this._config.layers)) this._config.layers = ["radio"];
    this._spot = null;             // survey: where the owner stands, tapped on the plan
    this._link = undefined;        // survey: the last link read, null while there is none
    this._taking = false;          // survey: a sample is being recorded
    this._surveyNote = null;       // survey: {key, vars} of the last sample's outcome
    this._spotsMemo = null;
    this._stopPolling();
    this._startPolling();
    if (this._hass) this._load();
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: this._config?.fill ? "auto" : 8, min_columns: 6, min_rows: 4 };
  }

  connectedCallback() {
    this._onResize ??= () => this._fill();
    window.addEventListener("resize", this._onResize);
    this._startPolling();
  }

  // The survey page's link, read every LINK_MS while the card is on the page.
  _startPolling() {
    if (!this._config?.survey || !this.isConnected || this._poll) return;
    this._poll = setInterval(() => this._pollLink(), LINK_MS);
    this._pollLink();
  }

  _stopPolling() {
    if (this._poll) clearInterval(this._poll);
    this._poll = null;
  }

  // The page's server answers {link: {band, channel, dbm, noise, bssid} | null}; a failed read is no link.
  // Same origin, so the request carries the page's key cookie as its own reads do.
  async _pollLink() {
    if (this._polling) return;     // a slow answer: the next tick waits for it, not a second request
    this._polling = true;
    let link = null;
    try {
      const r = await fetch("survey/link");
      link = r.ok ? (await r.json())?.link ?? null : null;
    } catch {
      link = null;
    } finally {
      this._polling = false;
    }
    this._link = link;
    // The link line alone: the panel's buttons stay under a finger about to press them.
    const line = this.shadowRoot?.querySelector(".survey-link");
    if (line) line.textContent = this._linkText();
    else this._drawSurvey();
  }

  // The plan's size changed (the card was shown, `fill` grew it, the window turned): readings and
  // markers are sized in screen pixels, so lay them out again. A card drawn while hidden (the
  // Ramka's plan view before its swipe) had no size and drew at a fallback scale.
  _resized() {
    const r = this._rect();
    if (`${Math.round(r.width)}x${Math.round(r.height)}` === this._drawnSize) return;
    this._drawSvg(this._status === "ready" && this._mode === "edit");
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
    // The element may be kept and shown again (the Ramka hides its plan): a tooltip a tap pinned
    // would come back over a plan the person has not touched since.
    if (this._pinned) this._unpinTip();
    this._stopPolling();
    clearTimeout(this._trafficTimer);
    clearInterval(this._tickTimer);
    this._trafficTimer = null;
    this._tickTimer = null;
    this._tickMs = 0;
  }

  // `fill`: as tall as the screen below the card's top; true when the height changed.
  _fill() {
    if (!this._config?.fill) return false;
    const top = this.getBoundingClientRect().top;
    const height = `${Math.max(280, Math.round(window.innerHeight - top - FILL_GAP_PX))}px`;
    if (this.style.height === height) return false;
    this.style.height = height;
    return true;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._registry();
    if (!this.shadowRoot) this._build();
    if (first) {
      this._loadEntries();
      this._load();
      return;
    }
    // hass is set for every state change in Home Assistant: redraw only what changed. A new reading
    // redraws the plan alone, so a half-typed area name or an open select survives it.
    this._wantStats();
    this._refresh();
  }

  _refresh() {
    const stamp = this._valueStamp();
    if (stamp === this._stamp) return void this._retip();     // the clock alone moves "Updated 5 s ago"
    if (stamp.split("\n")[0] !== this._stamp?.split("\n")[0]) this._render();
    else {
      this._drawSvg(this._status === "ready" && this._mode === "edit");
      this._stamp = stamp;
    }
  }

  // Config entry domains, so a device's integrations read as SPEC-010's scan reads them (Amendment 5).
  // `config_entries/get` needs no admin; a refusal leaves the entity platforms standing in.
  async _loadEntries() {
    try {
      const entries = await this._hass.callWS({ type: "config_entries/get" });
      this._entryDomains = Object.fromEntries((Array.isArray(entries) ? entries : []).map((e) => [e.entry_id, e.domain]));
    } catch {
      return;
    }
    this._render();
  }

  // The candidates and each point's readings, worked out again only when the registries or the
  // entry domains change: hass is set for every state change in Home Assistant. A device class or a
  // plant's sensors (states) changing alone shows with the next registry change or page load.
  _registry() {
    const h = this._hass || {};
    const key = [h.entities, h.devices, h.areas, this._entryDomains];
    if (this._regKey && key.every((v, i) => v === this._regKey[i])) return;
    this._regKey = key;
    const list = candidates(h, this._entryDomains);
    this._cands = new Map(list.map((c) => [c.key, c]));
    this._entities = entityMap(h, list);
    this._catCache = new WeakMap();
    this._readCache = new WeakMap();
    this._lamps = lampIndex(h);
    this._signalIds = signalEntities(h, wifiRules);
    this._obsIndex = observationIndex(h, wifiRules);
  }

  // A point's reading entities by device class (a plant's through its named sensors).
  _readings(point) {
    let ids = this._readCache.get(point);
    if (!ids) this._readCache.set(point, (ids = readingIds(this._hass, pointEntities(point, this._entities))));
    return ids;
  }

  // The layer whose maps the bar offers: the one shown of plants, climate, light and (with `wifi`)
  // radio, outside edit mode.
  _mapLayer() {
    if (!this._config.maps || this._mode === "edit" || this._status !== "ready" || !this._floor) return null;
    let ids;
    if (this._one) ids = [this._chosen];
    else if (this._config.layers) ids = this._config.layers;
    else ids = [...new Set(this._floor.points.flatMap((p) => this._cat(p).roles))].filter((id) => this._visible(id));
    if (ids.length !== 1 || !MAPS[ids[0]]) return null;
    // `wifi` is on unless false, and left out of the stored config: a host such as Pocket checks it.
    return ids[0] === "radio" && this._config.wifi === false ? null : ids[0];
  }

  // The map shown: {layer, cls, rule, maps (the layer's offered)}; null without one. On the radio
  // layer also its band; without an access point no map (cls null) and the hint why.
  _map() {
    const layer = this._mapLayer();
    if (!layer) return null;
    if (layer === "radio") return this._wifiMap();
    const [cls, rule] = MAPS[layer].find(([c]) => c === this._maps[layer]) ?? MAPS[layer][0];
    return { layer, cls, rule, maps: MAPS[layer] };
  }

  _wifiMap() {
    const bands = offeredBands(this._doc);
    const maps = radioMaps(bands, this._trafficOffered());
    if (!maps.length) return { layer: "radio", cls: null, rule: null, maps, hint: "no_access_points" };
    const [cls] = maps.find(([c]) => c === this._maps.radio) ?? maps[0];
    // A traffic map has no band, no Predicted / Calibrated switch and no Ranges: those are Wi-Fi's.
    if (TRAFFIC_MAPS.includes(cls)) return { layer: "radio", cls, rule: null, maps, bands, traffic: this._traffic(), idle: this._idle };
    const band = BAND_OF[cls] ?? (bands.includes(this._band) ? this._band : bands[0]);
    // Confidence is always the calibrated model's; the other maps follow the switch once there are readings.
    const observed = this._observations().list.length > 0;
    const calibrated = cls === "confidence" || (observed && this._calib !== "predicted");
    // Ranges (Amendment 3): on the band maps only, where the outline's level is the map's own.
    const ranges = !!BAND_OF[cls] && this._ranges;
    return { layer: "radio", cls, rule: null, maps, band, bands, observed, calibrated, ranges };
  }

  // The traffic maps are offered when the router integration of a traffic rule has client trackers (SPEC-047).
  _trafficOffered() {
    return this._config.traffic !== false && this._trafficIds().trackers.length > 0;
  }

  // The entities `clients()` reads, by the registries: the client trackers of the traffic rules' integrations
  // and the router's freshness sensor and polling switch.
  _trafficIds() {
    const h = this._hass;
    const m = this._trafficIdsMemo;
    if (m && m.entities === h.entities) return m;
    const rules = trafficRules(wifiRules);
    const platforms = new Set(rules.map((r) => r.integration));
    const suffixes = rules.flatMap((r) => [r.traffic.freshness?.updated, r.traffic.freshness?.polling]).filter(Boolean);
    const ids = Object.keys(h.entities || {}).filter((id) => platforms.has(h.entities[id].platform));
    const trackers = ids.filter((id) => id.startsWith("device_tracker."));
    const fresh = ids.filter((id) => /^(sensor|switch)\./.test(id) && suffixes.some((x) => id.endsWith(x)));
    this._trafficIdsMemo = { entities: h.entities, trackers, watched: [...trackers, ...fresh] };
    return this._trafficIdsMemo;
  }

  // The router's clients (traffic.js), worked out again only when the registries, the plan, the states of
  // the trackers and freshness entities or the clock's tick change: not for any other state.
  _traffic() {
    const h = this._hass;
    const { watched } = this._trafficIds();
    const m = this._trafficMemo;
    const tick = Math.floor(Date.now() / TRAFFIC_BUCKET_MS);
    if (m && m.entities === h.entities && m.devices === h.devices && m.doc === this._doc && m.tick === tick
      && watched.every((id, i) => h.states?.[id] === m.states[i])) return m.out;
    const out = this._readClients();
    this._trafficMemo = { entities: h.entities, devices: h.devices, doc: this._doc, tick, states: watched.map((id) => h.states?.[id]), out };
    return out;
  }

  // The reading itself: a method of its own, so a test counts the runs.
  _readClients() {
    return clients(this._hass, this._doc, wifiRules, Date.now(), this._obsIndex);
  }

  // The open or closed state of every opening with a sensor: live state the cache keys leave out.
  _openingStates() {
    return this._doc.floors.flatMap((f) => (f.openings || []).filter((o) => o.entity)
      .map((o) => openingState(o, this._hass, this._doc.wifi?.outdoor).open)).join();
  }

  // The prediction of the floor shown on one band, or the calibrated one, memoised by its cache key,
  // the openings' states and (calibrated) the readings' digest. The key itself is worked out again
  // only when the plan, the floor, the band, the cell, such a state or the digest changed. Cells carry
  // their confidence only for the Confidence map (`confidence`), which is always calibrated.
  _wifi(band, step, calibrated = false, confidence = false) {
    const doc = this._doc;
    const states = this._openingStates();
    const digest = calibrated ? this._observations().digest : null;
    const from = [doc, this._floorId, band, step, states, digest, confidence];
    if (!this._wifiKey || from.some((v, i) => v !== this._wifiKey.from[i])) {
      const params = priorParams(materials, doc.floors.flatMap((f) => f.access_points ?? []));
      this._wifiKey = { from, params,
        key: `${cacheKey(doc, this._floorId, band, params, step)}|${states}${calibrated ? `|calibrated|${digest}` : ""}${confidence ? "|confidence" : ""}` };
    }
    const { key, params } = this._wifiKey;
    let out = this._wifiMemo.get(key);
    if (!out) {
      if (calibrated) {
        const fit = this._calibration();
        out = calibratedCoverage(contextFor(doc, this._floorId, this._hass, materials, fit.params), band, step, fit, { confidence });
      } else out = this._predict(contextFor(doc, this._floorId, this._hass, materials, params), band, step);
      this._wifiMemo.set(key, out);
      if (this._wifiMemo.size > WIFI_MEMO) this._wifiMemo.delete(this._wifiMemo.keys().next().value);
    }
    return { key, ...out };
  }

  // The engine's coverage: a method of its own, so a test counts the computations.
  _predict(ctx, band, step) {
    return coverage(ctx, band, step);
  }

  // Every floor's device observations (the fit is home-wide), from the 24-hour means of their signal
  // sensors (a sensor without statistics gives its state), with the plan's survey and manual samples, and a digest of what the fit reads: the
  // readings to OBS_DB, their places, access points and bands. Worked out again when the plan, the
  // registries (the index), the statistics or the state of an entity the observations read (signal,
  // BSSID, router tracker) change, not for any other state; the fit only when the digest does.
  _observations() {
    const h = this._hass;
    const from = [this._doc, this._obsIndex, this._stats];
    const watched = this._obsIndex.watched.map((id) => h.states?.[id]);
    const m = this._obsMemo;
    if (m && from.every((v, i) => v === m.from[i]) && watched.every((v, i) => v === m.watched[i])) return m;
    const values = {};
    for (const id of this._signalIds) {
      const mean = figure(this._stats?.[id], "mean");
      if (mean !== undefined) values[id] = mean;
    }
    const list = this._buildObservations(values);
    const digest = list.map((o) => [o.entity ?? o.source, o.floorId, o.x, o.y, o.ap, o.band, Math.round(o.dbm / OBS_DB) * OBS_DB].join("|")).join(";");
    this._obsMemo = { from, watched, list, digest };
    return this._obsMemo;
  }

  // Every floor's device and sample observations: a method of its own, so a test counts the builds.
  _buildObservations(values) {
    return this._doc.floors.flatMap((f) => [...deviceObservations(this._hass, this._doc, f.floor_id, wifiRules, values, this._obsIndex),
      ...sampleObservations(this._doc, f.floor_id)]);
  }

  // The fit of the whole home, once per plan, openings' states and readings' digest: every band and
  // map shares it.
  _calibration() {
    const doc = this._doc;
    const states = this._openingStates();
    const { list, digest } = this._observations();
    const m = this._fitMemo;
    if (m && m.doc === doc && m.states === states && m.digest === digest) return m.fit;
    const fit = this._runFit(contextFor(doc, this._floorId, this._hass, materials), list);
    this._fitMemo = { doc, states, digest, fit };
    return fit;
  }

  // The engine's fit: a method of its own, so a test counts the fits.
  _runFit(ctx, observations) {
    return calibrate(ctx, observations, materials);
  }

  // The shown floor's observations of one point: what its label reports on a radio map.
  _sourceObs(point) {
    return this._observations().list.filter((o) => o.floorId === this._floorId
      && (point.device_id ? o.device === point.device_id : o.entity === point.entity_id));
  }

  // The signal sensors of the plan's devices and entities: the ones whose 24-hour means the fit reads.
  _planSignalIds() {
    const keys = new Set(this._doc.floors.flatMap((f) => (f.points || []).map(keyOf)));
    return this._signalIds.filter((id) => keys.has(id) || keys.has(this._hass.entities?.[id]?.device_id)).sort();
  }

  // Per room of the floor, its own sensor of the map's reading, or null: the one the home inputs
  // select for the room (option `rooms`, its climate's temperature or humidity; decision record of
  // #219, agreement 11), else the one its area names (Settings → Areas: the temperature and
  // humidity sensors).
  _roomSensors(map) {
    const field = areaSensorField(map.layer, map.cls);
    if (!field) return this._floor.rooms.map(() => null);
    return this._floor.rooms.map((r) => homeRoom(this._config.rooms, r.area_id)?.climate?.[map.cls]
      || this._hass.areas?.[r.area_id]?.[field] || null);
  }

  // A reading now, or its figure over the last 24 hours by the layer's rule.
  _value(id, cls, layer) {
    return this._day ? figure(this._stats?.[id], ruleOf(layer, cls)) : nowValue(this._hass, id);
  }

  // The last 24 hours' statistics of every reading on the floor, while a reading map shows them:
  // fetched when the readings change and every STATS_MS.
  // On a Wi-Fi map: the plan's Wi-Fi signal sensors, always (the calibration reads their means).
  _wantStats() {
    const map = this._map();
    if (!map) return;
    let ids;
    if (map.layer === "radio") {
      if (!map.cls) return;
      ids = this._planSignalIds().join(",");
    } else {
      if (!this._day || map.cls === "lamps") return;
      // Every point's: an unplaced one's label shows its figure too; only the heat leaves it out. And
      // the rooms' own sensors, which give a room its value placed or not.
      const own = this._roomSensors(map).filter(Boolean);
      ids = [...new Set([...this._floor.points.flatMap((p) => Object.values(this._readings(p))), ...own])]
        .sort().join(",");
    }
    if (!ids || (ids === this._statIds && Date.now() - this._statsAt < STATS_MS)) return;
    this._fetchStats(ids);
  }

  async _fetchStats(ids) {
    this._statIds = ids;
    this._statsAt = Date.now();
    try {
      this._stats = await this._hass.callWS({ type: "recorder/statistics_during_period", period: "hour",
        types: ["mean", "min", "max"], statistic_ids: ids.split(","),
        start_time: new Date(Date.now() - 24 * HOUR_MS).toISOString() });
    } catch {
      this._stats = {};
      this._statsAt = Date.now() - STATS_MS + 5 * 60 * 1000;     // try again in five minutes
    }
    this._heatCache = null;
    this._render();
  }

  // A point's category and roles, once per point object: an edit makes a new one.
  _cat(point) {
    let cat = this._catCache.get(point);
    if (!cat) this._catCache.set(point, (cat = pointCategory(this._hass, point, this._cands)));
    return cat;
  }

  _visible(categoryId) {
    if (this._one) return categoryId === this._chosen;
    return this._config.layers ? this._config.layers.includes(categoryId) : !this._hidden.has(categoryId);
  }

  // A point shows while any of its roles' layers is on (a radar on a proxy: radio or presence).
  _shown(cat) {
    return cat.roles.some((id) => this._visible(id));
  }

  get _floor() {
    const floor = this._doc?.floors.find((f) => f.floor_id === this._floorId) ?? null;
    return floor && this._config.area ? this._scope(floor) : floor;
  }

  // The view fitted to the floor drawn; with `area` and `context`, CONTEXT_M more on every side, so
  // the neighbouring rooms show at the edges.
  _fit() {
    const view = fitView(this._floor);
    if (!this._config.area || !this._config.context) return view;
    const box = { x: view.x - CONTEXT_M, y: view.y - CONTEXT_M, w: view.w + 2 * CONTEXT_M, h: view.h + 2 * CONTEXT_M };
    return { ...box, max: { w: box.w } };
  }

  // With `area` and `context`: the floor's other rooms, drawn first, faded, with their names and
  // nothing else (no points, no readings, no taps): where the room is in the home.
  _drawContext(svg, px) {
    const full = this._doc?.floors.find((f) => f.floor_id === this._floorId);
    if (!this._config.area || !this._config.context || !full) return;
    const group = el("g", { class: "context" }, svg);
    for (const room of full.rooms) {
      if (room.area_id === this._config.area) continue;
      el("polygon", { class: "room", points: room.polygon.map((p) => p.join(",")).join(" ") }, group);
      const label = roomLabel(room, this._hass, this._config.rooms);
      const spot = widestRow(room.polygon);
      el("text", { class: "label", x: fmt(spot.x), y: fmt(spot.y), "font-size": fmt(12 * px) }, group).textContent = label.text;
    }
  }

  // With `area`: the floor with that area's room alone, the points standing in it (or on its walls)
  // and its openings. An opening whose first room is the other one is turned round (the same wall,
  // the same side it opens into), so its shape is found from this room. Kept per floor object.
  _scope(floor) {
    let scoped = this._scoped.get(floor);
    if (scoped) return scoped;
    const area = this._config.area;
    const room = floor.rooms.find((r) => r.area_id === area);
    const inside = (p) => room && (pointInPolygon([p.x, p.y], room.polygon) || snapToEdge(room.polygon, [p.x, p.y], 1e-6));
    const openings = (floor.openings || []).filter((o) => room && o.rooms.includes(area)).map((o) =>
      (o.rooms.find((x) => x !== null) === area ? o
        : { ...o, rooms: [area, ...o.rooms.filter((x) => x !== area)], opens: opensInto(o) ?? "outside" }));
    scoped = { ...floor, rooms: room ? [room] : [], points: floor.points.filter(inside), openings, open_spaces: [] };
    this._scoped.set(floor, scoped);
    return scoped;
  }

  // The status, told to the host when it changes: data-status and a floorplan-status event.
  _announce() {
    if (this._announced === this._status) return;
    this._announced = this._status;
    this.setAttribute("data-status", this._status);
    this.dispatchEvent(new window.CustomEvent("floorplan-status", { detail: { status: this._status }, bubbles: true, composed: true }));
  }

  async _load() {
    if (this._config.plan) {
      this._setPlan(this._config.plan);
      return;
    }
    this._render();
    let plan = null;
    try {
      plan = extract(await this._hass.callWS({ type: "lovelace/config", url_path: URL_PATH }));
    } catch {
      plan = null;    // no dashboard: the same as no plan
    }
    this._setPlan(plan);
  }

  _setPlan(plan) {
    if (!plan) this._status = "none";
    else if (!supported(plan)) this._status = "unsupported";
    else if (this._config.area && !plan.floors.some((f) => f.rooms.some((r) => r.area_id === this._config.area))) {
      this._status = "no_area";
    } else {
      this._status = "ready";
      // `floors: []` is a valid plan (what `floorplan push` writes first): edit it as one floor without an id.
      this._doc = plan.floors.length ? plan : { ...plan, floors: emptyPlan([null]).floors };
      this._loaded = plan;
      this._base = this._doc;
      const wanted = this._config.area ? plan.floors.find((f) => f.rooms.some((r) => r.area_id === this._config.area))
        : plan.floors.find((f) => f.floor_id === this._config.floor);
      this._floorId = (wanted ?? plan.floors[0])?.floor_id ?? null;
      this._view = this._fit();
    }
    this._render();
  }

  // ---- DOM ---------------------------------------------------------------------------------

  _build() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
${STYLE}
      </style>
      <ha-card>
        <div class="layers"></div>
        <div class="bar"></div>
        <div class="survey"></div>
        <div class="area-panel"></div>
        <div class="body"><svg xmlns="${SVG_NS}" preserveAspectRatio="xMidYMid meet"></svg><div class="tray"></div><div class="cluster-list" hidden></div><div class="tip" hidden></div></div>
        <div class="hint"></div>
        <div class="message"></div>
      </ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    this._svg = this.shadowRoot.querySelector("svg");
    card.addEventListener("click", (e) => this._onClick(e));
    card.addEventListener("change", (e) => this._onChange(e));
    card.addEventListener("pointerdown", (e) => this._onDown(e));
    card.addEventListener("pointermove", (e) => this._onMove(e));
    card.addEventListener("pointerup", (e) => this._onUp(e));
    card.addEventListener("pointercancel", (e) => this._onUp(e, true));
    card.addEventListener("lostpointercapture", (e) => this._onUp(e, true));
    // A tooltip a finger's tap opened stays when the finger lifts (touch fires pointerleave then).
    card.addEventListener("pointerleave", () => { if (!this._pinned) this._showTip(null); });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => this._resized()).observe(this._svg);
    this._svg.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    this._svg.addEventListener("dblclick", (e) => this._onDblClick(e));
  }

  _say(key, vars) {
    this._message = key ? { key, vars } : null;
  }

  _render() {
    if (!this.shadowRoot) return;
    const h = this._hass;
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    const ready = this._status === "ready";
    const editing = ready && this._mode === "edit";
    $("ha-card").classList.toggle("editing", editing);
    $("ha-card").classList.toggle("fixed", !this._config.zoom);
    this._fill();
    $(".bar").innerHTML = ready ? this._barHtml(editing) : "";
    // One layer at a time (a wall tablet): the bars keep their taps (data-own-tap), so a page that
    // goes back on a tap anywhere does not go back on zoom, a map or a layer.
    $(".bar").toggleAttribute("data-own-tap", this._one);
    $(".layers").toggleAttribute("data-own-tap", this._one);
    this._wantStats();
    this._registry();
    this._tipKey = null;     // a tooltip shown before is drawn again on the next hover
    $(".layers").innerHTML = ready ? this._layersHtml() : "";
    $(".area-panel").innerHTML = editing ? this._areaPanelHtml() || this._pointPanelHtml() || this._openingPanelHtml()
      || this._readingPanelHtml() || this._wallPanelHtml() || this._offerHtml() + this._disabledHtml() : "";
    $(".tray").innerHTML = editing ? this._trayHtml() : "";
    const floor = this._floor;
    const empty = ready && floor && !floor.rooms.length && !floor.points.length;
    const hint = empty ? "card.floorplan.hint.empty" : editing ? `card.floorplan.hint.${this._tool}` : null;
    $(".hint").textContent = hint ? t(h, hint) : "";
    const notice = { loading: "card.floorplan.loading", none: "card.floorplan.no_plan",
      unsupported: "card.floorplan.unsupported", no_area: "card.floorplan.no_area" }[this._status];
    $(".message").innerHTML = notice
      ? `<div class="notice">${esc(t(h, notice))}</div>`
      : this._message ? esc(t(h, this._message.key, this._message.vars)) : "";
    this._svg.style.display = ready ? "" : "none";
    this._drawSvg(editing);
    this._drawSurvey();
    this._stamp = this._valueStamp();
    this._announce();
  }

  _barHtml(editing) {
    const h = this._hass;
    const btn = (action, text, title, extra = "") =>
      `<button data-action="${action}" ${title ? `title="${esc(title)}" aria-label="${esc(title)}"` : ""} ${extra}>${esc(text)}</button>`;
    const zoom = btn("zoom_in", "+", t(h, "card.floorplan.zoom_in"))
      + btn("zoom_out", "−", t(h, "card.floorplan.zoom_out"))
      + btn("fit", t(h, "card.floorplan.fit"));
    // View mode: the maps on the left, zoom on the right; edit mode: zoom, then the tools. A bar
    // with nothing in it (zoom: false, no maps, no Edit) is left out.
    if (!editing) {
      let tail = this._config.zoom ? zoom : "";
      if (this._config.edit && h?.user?.is_admin) tail += btn("edit", t(h, "card.floorplan.edit"));
      const maps = this._mapsHtml();
      // The wall weights' key wherever the walls are drawn by weight (Wi-Fi on), on every map and on the
      // plain plan; a host that turns the maps off (`maps: false`, a phone's fixed room) drops it with them.
      const key = this._wifiOn && this._config.maps ? this._wallKeyHtml() : "";
      return maps || tail || key ? `${maps}${key}<span class="spacer"></span>${tail}` : "";
    }
    let html = `${zoom}${this._wifiOn ? this._wallKeyHtml() : ""}<span class="spacer"></span>`;
    if (this._doc.floors.length > 1) {
      const name = (id) => h.floors?.[id]?.name || id;
      html += `<select class="floor" aria-label="${esc(t(h, "card.floorplan.floor"))}">${this._doc.floors.map((f) =>
        `<option value="${esc(f.floor_id)}" ${f.floor_id === this._floorId ? "selected" : ""}>${esc(name(f.floor_id))}</option>`).join("")}</select>`;
    }
    const wifiTools = this._wifiOn ? ["walls", ...(offeredBands(this._doc).length ? ["reading"] : [])] : [];
    for (const tool of ["move", "split", "join", "open", "openings", ...wifiTools]) {
      html += btn("tool", t(h, `card.floorplan.tool.${tool}`), "", `data-tool="${tool}" class="${tool === this._tool ? "on" : ""}"`);
    }
    const dirty = this._doc !== this._base;
    html += btn("cancel", t(h, "card.floorplan.cancel"), "", this._saving ? "disabled" : "");
    html += btn("save", t(h, this._saving ? "card.floorplan.saving" : "card.floorplan.save"), "",
      `class="primary" ${dirty && !this._saving ? "" : "disabled"}`);
    return html;
  }

  // The shown layer's maps, then now or the last 24 hours (not for the lamps nor the radio maps),
  // beside Serving and Confidence the band, and on the other Wi-Fi maps Predicted / Calibrated once
  // some device reports its signal.
  _mapsHtml() {
    const map = this._map();
    if (!map) return "";
    const h = this._hass;
    if (map.hint) return `<span class="legend">${esc(t(h, `card.floorplan.wifi.hint.${map.hint}`))}</span>`;
    const chip = (attrs, on, text) => `<button ${attrs} aria-pressed="${on}" class="chip">${esc(text)}</button>`;
    let html = `<span class="maps">${map.maps.map(([cls]) =>
      chip(`data-action="map" data-map="${cls}"`, cls === map.cls, t(h, `card.floorplan.maps.${cls}`))).join("")}</span>`;
    if (map.cls === "serving" || map.cls === "confidence") {
      html += `<span class="maps">${map.bands.map((b) => chip(`data-action="band" data-band="${b}"`, b === map.band,
        t(h, "card.floorplan.wifi.bands", { bands: bandsText([b], (x) => this._bandNumber(x)) }))).join("")}</span>`;
    }
    if (map.layer === "radio" && map.observed && map.cls !== "confidence") {
      html += `<span class="maps">${["predicted", "calibrated"].map((c) => chip(`data-action="calib" data-calib="${c}"`,
        (c === "calibrated") === map.calibrated, t(h, `card.floorplan.wifi.${c}`))).join("")}</span>`;
    }
    if (map.layer === "radio" && BAND_OF[map.cls]) {
      html += `<span class="maps">${chip('data-action="ranges"', map.ranges, t(h, "card.floorplan.wifi.ranges"))}</span>`;
    }
    if (map.cls === "traffic_links") {
      html += `<span class="maps">${chip('data-action="idle"', map.idle, t(h, "card.floorplan.traffic.idle"))}</span>`;
    }
    if (map.rule) {
      html += `<span class="maps">${chip('data-action="day" data-day="0"', !this._day, t(h, "card.floorplan.maps.now"))}`
        + chip('data-action="day" data-day="1"', this._day, t(h, "card.floorplan.maps.day",
          { figure: t(h, `card.floorplan.maps.figure.${map.rule === "mean" ? "mean" : `${map.cls}_${map.rule}`}`) }))
        + "</span>";
    }
    return html + this._legendHtml(map) + this._bannerHtml(map);
  }

  // Router data that is not current (SPEC-047): when it was last fresh, or that the integration is unavailable.
  _bannerHtml(map) {
    if (!TRAFFIC_MAPS.includes(map.cls) || map.traffic.live) return "";
    const h = this._hass;
    const text = map.traffic.reason === "unavailable" ? t(h, "card.floorplan.traffic.unavailable")
      : t(h, "card.floorplan.traffic.not_live", { time: formatDate(h, map.traffic.updated, { hour: "2-digit", minute: "2-digit" }) });
    return `<span class="banner" role="status">${esc(text)}</span>`;
  }

  // The map's scale, compact, in the bar: never over the plan (on the Ramka a legend on the plan
  // covered a room). The chips name the map and now or 24 h; the full sentence is its tooltip.
  _legendHtml(map) {
    const h = this._hass;
    if (TRAFFIC_MAPS.includes(map.cls)) return this._trafficLegendHtml(map);
    if (map.layer === "radio") return this._wifiLegendHtml(map);
    if (map.cls === "lamps") return `<span class="legend">${esc(t(h, "card.floorplan.maps.lamps_legend"))}</span>`;
    const s = SCALES[map.cls];
    const figureKey = map.rule === "mean" ? "mean" : `${map.cls}_${map.rule}`;
    const when = this._day ? t(h, "card.floorplan.maps.day_legend", { figure: t(h, `card.floorplan.maps.figure.${figureKey}`) })
      : t(h, "card.floorplan.maps.now_legend");
    return `<span class="legend" title="${esc(`${t(h, `card.floorplan.maps.${map.cls}`)}, ${when}`)}">`
      + `<span>${esc(formatValue(map.cls, s.lo))}</span>`
      + `<span class="scale" style="background: linear-gradient(90deg, ${s.ramp.join(", ")})"></span>`
      + `<span>${esc(formatValue(map.cls, s.hi))}</span>`
      + `<span class="hatch"></span><span>${esc(t(h, "card.floorplan.maps.no_sensor"))}</span></span>`;
  }

  // The plan's three wall weights (Amendment 3), on the Wi-Fi maps and in edit mode: a line each, as drawn.
  _wallKeyHtml() {
    const h = this._hass;
    return `<span class="legend wall-key" title="${esc(t(h, "card.floorplan.wall.weight.title"))}">${WEIGHTS.map((w) =>
      `<span class="wall-swatch ${w}"></span><span>${esc(t(h, `card.floorplan.wall.weight.${w}`))}</span>`).join("")}</span>`;
  }

  // The traffic maps' scale: 0.1 to 1000 Mbit/s on a log scale, marked at 1, 10 and 100.
  _trafficLegendHtml(map) {
    const h = this._hass;
    const s = SCALES.mbps;
    const at = (v) => fmt((Math.log10(v / s.lo) / Math.log10(s.hi / s.lo)) * 100);
    return `<span class="legend" title="${esc(`${t(h, `card.floorplan.maps.${map.cls}`)}, ${t(h, "card.floorplan.traffic.legend")}`)}">`
      + `<span>${esc(`${s.lo} ${s.unit}`)}</span>`
      + `<span class="scale" style="background: linear-gradient(90deg, ${s.ramp.join(", ")})">${s.marks.map((m) =>
        `<span class="mark" data-mark="${m}" style="left: ${at(m)}%"></span>`).join("")}</span>`
      + `<span>${esc(`${s.hi} ${s.unit}`)}</span></span>`;
  }

  // A band map: the dBm scale with its marks (with Ranges each access point's colour and the outlines'
  // levels); Serving: each access point's colour and the hatching. (The wall key follows in the bar.)
  _wifiLegendHtml(map) {
    return this._wifiScaleHtml(map);
  }

  _wifiScaleHtml(map) {
    const h = this._hass;
    const name = t(h, `card.floorplan.maps.${map.cls}`);
    if (map.cls === "serving") {
      const aps = accessPoints(this._doc).filter((ap) => ap.bands.includes(map.band));
      const title = t(h, "card.floorplan.wifi.serving_legend", { bands: bandsText([map.band], (x) => this._bandNumber(x)) });
      return `<span class="legend" title="${esc(`${name}, ${title}`)}">${aps.map((ap, i) =>
        `<span class="swatch" style="background: ${servingColour(i)}"></span><span>${esc(pointName(h, this._apPoint(ap.key) ?? { device_id: ap.key }))}</span>`).join("")}`
        + `<span class="hatch"></span><span>${esc(t(h, "card.floorplan.wifi.handover"))}</span></span>`;
    }
    if (map.cls === "confidence") {
      const title = t(h, "card.floorplan.wifi.confidence_legend", { bands: bandsText([map.band], (x) => this._bandNumber(x)) });
      return `<span class="legend" title="${esc(`${name}, ${title}`)}">${Object.entries(CONFIDENCE).map(([level, fill]) =>
        `<span class="swatch" style="background: ${fill}"></span><span>${esc(t(h, `card.floorplan.wifi.confidence.${level}`))}</span>`).join("")}</span>`;
    }
    const s = SCALES.dbm;
    const at = (v) => fmt(((v - s.lo) / (s.hi - s.lo)) * 100);
    const [call, weak] = s.marks;
    const count = this._observations().list.length;
    const what = map.calibrated ? t(h, "card.floorplan.wifi.dbm_calibrated_legend", { count, call, weak })
      : t(h, "card.floorplan.wifi.dbm_legend", { call, weak });
    return `<span class="legend" title="${esc(`${name}, ${what}`)}">`
      + `<span>${esc(formatValue("dbm", s.lo))}</span>`
      + `<span class="scale" style="background: linear-gradient(90deg, ${s.ramp.join(", ")})">${s.marks.map((m) =>
        `<span class="mark" data-mark="${m}" style="left: ${at(m)}%"></span>`).join("")}</span>`
      + `<span>${esc(formatValue("dbm", s.hi))}</span></span>`
      + (map.ranges ? this._rangesLegendHtml(map) : "");
  }

  // Ranges: each access point on the band in its colour, and which line is which level.
  _rangesLegendHtml(map) {
    const h = this._hass;
    const [call, weak] = SCALES.dbm.marks;
    const aps = accessPoints(this._doc).filter((ap) => ap.bands.includes(map.band));
    return `<span class="legend ranges-legend">${aps.map((ap, i) =>
      `<span class="swatch" style="background: ${servingColour(i)}"></span><span>${esc(pointName(h, this._apPoint(ap.key) ?? { device_id: ap.key }))}</span>`).join("")}`
      + `<span>${esc(t(h, "card.floorplan.wifi.ranges_legend", { call, weak }))}</span></span>`;
  }

  // A band as this language writes the number: 2.4, or 2,4.
  _bandNumber(band) {
    return band.includes(".") ? numberText(this._hass, Number(band), 1) : band;
  }

  // The point an access point stands on, on any floor.
  _apPoint(key) {
    for (const f of this._doc.floors) {
      const p = (f.points ?? []).find((q) => keyOf(q) === key);
      if (p) return p;
    }
    return null;
  }

  _areaPanelHtml() {
    const h = this._hass;
    const target = this._pendingSplit ? null : this._selected;
    if (!target && !this._pendingSplit) return "";
    const used = new Set(this._floor.rooms.map((r) => r.area_id));
    const areas = Object.values(h.areas || {}).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const label = t(h, this._pendingSplit ? "card.floorplan.area.for_split" : "card.floorplan.area.label");
    const options = areas.map((a) => {
      const current = a.area_id === target;
      return `<option value="${esc(a.area_id)}" ${current ? "selected" : ""} ${used.has(a.area_id) && !current ? "disabled" : ""}>${esc(a.name)}</option>`;
    }).join("");
    // A room of an open space names the rooms it is open to, and can be closed off.
    const group = target && openSpaces(this._floor).find((g) => g.includes(target));
    const open = group ? `<span class="open-to">${esc(t(h, "card.floorplan.area.open_to", {
      rooms: group.filter((a) => a !== target).map((a) => h.areas?.[a]?.name || a).join(", ") }))}</span>`
      + `<button data-action="close_room">${esc(t(h, "card.floorplan.area.close_off"))}</button>` : "";
    return `${open}<label>${esc(label)}</label>
      <select class="area"><option value="" ${target && h.areas?.[target] ? "" : "selected"} disabled>${esc(t(h, "card.floorplan.area.choose"))}</option>${options}</select>
      <input type="text" placeholder="${esc(t(h, "card.floorplan.area.new"))}">
      <button data-action="create_area">${esc(t(h, "card.floorplan.area.create"))}</button>`;
  }

  // The layer chips: a category each with a point on this floor, unless the config fixes the
  // layers; `on` while its layer shows. Read by a host that shows them itself (chips: false).
  get layerChips() {
    if (this._status !== "ready" || (this._config.layers && !this._one) || !this._floor) return [];
    const lang = this._hass?.language;
    const ids = new Set(this._one ? this._config.layers : this._floor.points.flatMap((p) => this._cat(p).roles));
    return PLACEABLE.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, name: categoryName(c, lang), colour: colourOf(c),
      on: this._one ? c.id === this._chosen : !this._hidden.has(c.id) }));
  }

  // A chip pressed (here or by a host): one layer chosen, or one switched off or on.
  pressLayer(id) {
    if (this._one) {
      this._chosen = id;
      save(CHOSEN_KEY, this._chosen);
    } else {
      if (this._hidden.has(id)) this._hidden.delete(id);
      else this._hidden.add(id);
      save(HIDDEN_KEY, [...this._hidden]);
    }
    this._render();
  }

  // A chip per category with a point on this floor, unless the config fixes the layers.
  _layersHtml() {
    if ((this._config.layers && !this._one) || !this._floor || !this._config.chips) return "";
    const h = this._hass;
    const roles = this._floor.points.map((p) => this._cat(p).roles);
    const cats = this.layerChips.map((chip) => ({ ...categoryById(chip.id), on: chip.on }));
    // One layer at a time (a wall tablet): the chips keep their taps (data-own-tap), so a page that
    // goes back on a tap anywhere does not go back on them.
    const pressed = (c) => c.on;
    const own = this._one ? " data-own-tap" : "";
    if (!cats.length) return "";
    // A ring on the plan gets its explanation here once.
    const legend = roles.some((r) => r.length > 1)
      ? `<span class="ring-legend"><span class="ring"></span>${esc(t(h, "card.floorplan.roles.legend"))}</span>` : "";
    return `<span class="layers-label">${esc(t(h, "card.floorplan.layers"))}</span>` + cats.map((c) =>
      `<button data-action="layer" data-layer="${esc(c.id)}" aria-pressed="${pressed(c)}" class="chip"${own}>`
      + `${dotHtml(c)}${esc(categoryName(c, h?.language))}</button>`).join("")
      + legend;
  }

  // The tapped point's category: what the catalog says it is, or an override.
  _pointPanelHtml() {
    const point = this._picked && this._floor?.points.find((p) => keyOf(p) === this._picked);
    if (!point) return "";
    const h = this._hass;
    const current = this._cat(point).id;
    const options = PLACEABLE.map((c) =>
      `<option value="${esc(c.id)}" ${c.id === current ? "selected" : ""}>${esc(categoryName(c, h?.language))}</option>`).join("");
    const [, ...names] = this._pointNames(point);
    const joined = (point.also || []).map((id, i) => `<span class="joined">${esc(names[i])}`
      + `<button data-action="separate" data-device="${esc(id)}">${esc(t(h, "card.floorplan.point.separate"))}</button></span>`).join("");
    return `<div class="point-panel"><label>${esc(pointName(h, point))}: ${esc(t(h, "card.floorplan.point.category"))}</label>`
      + `<select class="category">${options}</select>`
      + (joined ? `<span class="joined-label">${esc(t(h, "card.floorplan.point.joined"))}</span>${joined}` : "")
      + this._apFieldsHtml(point)
      + "</div>";
  }

  // `wifi` is on unless false: the Wi-Fi tools and fields with it.
  get _wifiOn() {
    return this._config.wifi !== false;
  }

  // A point's access point fields: on/off, then its bands, transmit power per band and mount height.
  _apFieldsHtml(point) {
    if (!this._wifiOn) return "";
    const h = this._hass;
    const ap = this._floor.access_points?.find((a) => (a.device_id ?? a.entity_id) === keyOf(point));
    const box = (attrs, on, text) => `<label class="ap-check"><input type="checkbox" class="ap-field" ${attrs} ${on ? "checked" : ""}>${esc(text)}</label>`;
    let html = box('data-field="ap"', !!ap, t(h, "card.floorplan.wifi.access_point"));
    if (!ap) return html;
    const ghz = (b) => t(h, "card.floorplan.wifi.bands", { bands: bandsText([b], (x) => this._bandNumber(x)) });
    html += BANDS.map((b) => box(`data-field="ap_band" data-band="${b}"`, ap.bands.includes(b), ghz(b))).join("");
    for (const b of ap.bands) {
      html += `<label>${esc(t(h, "card.floorplan.wifi.tx", { band: this._bandNumber(b) }))}</label>`
        + `<input type="number" class="ap-field" data-field="ap_tx" data-band="${b}" min="-10" max="36" step="1"`
        + ` placeholder="${materials.bands[b].tx}" value="${esc(String(ap.tx?.[b] ?? ""))}">`;
    }
    return html + `<label>${esc(t(h, "card.floorplan.wifi.mount"))}</label>`
      + `<input type="number" class="ap-field" data-field="ap_mount" min="0" max="5" step="0.1"`
      + ` placeholder="${MOUNT_M}" value="${esc(String(ap.mount ?? ""))}">`;
  }

  // The reading tool, once a spot is tapped: the reading's dBm, its band (one some access point serves) and
  // the access point it was on, or unknown.
  _readingPanelHtml() {
    if (this._tool !== "reading" || !this._wifiOn || !this._reading) return "";
    const h = this._hass;
    const label = (key) => `<label>${esc(t(h, `card.floorplan.reading.${key}`))}</label>`;
    const opt = (value, text) => `<option value="${esc(value)}">${esc(text)}</option>`;
    const bands = offeredBands(this._doc).map((b) => opt(b, t(h, "card.floorplan.wifi.bands", { bands: bandsText([b], (x) => this._bandNumber(x)) })));
    const aps = accessPoints(this._doc).map((ap) => opt(ap.key, pointName(h, this._apPoint(ap.key) ?? { device_id: ap.key })));
    return `<div class="reading-panel">${label("dbm")}<input type="number" class="reading-field" data-field="dbm" min="-110" max="0" step="1">`
      + `${label("band")}<select class="reading-field" data-field="band">${bands.join("")}</select>`
      + `${label("ap")}<select class="reading-field" data-field="ap">${opt("", t(h, "card.floorplan.reading.unknown"))}${aps.join("")}</select>`
      + `<button data-action="add_reading" class="primary">${esc(t(h, "card.floorplan.reading.add"))}</button></div>`;
  }

  // The walls tool: the selected wall's material and the buttons that make it the interior or
  // exterior default, then this floor's height, the floor under it and which of its rooms are outdoors.
  _wallPanelHtml() {
    if (this._tool !== "walls" || !this._wifiOn || !this._floor) return "";
    const h = this._hass;
    const floor = this._floor;
    const options = (cls, current) => materialsFor(cls).map((id) =>
      `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(t(h, `card.floorplan.material.${id}`))}</option>`).join("");
    const label = (key) => `<label>${esc(t(h, `card.floorplan.wall.${key}`))}</label>`;
    let html = "";
    const seg = this._wall && wallSegmentAt(floor, this._doc.wifi, this._wall, PICK_PX * this._px());
    if (seg) {
      // An outdoor room's own edge (a balcony's railing side) is no wall until a material is chosen (R24).
      const none = seg.cls === "outdoor"
        ? `<option value="" ${seg.material === null ? "selected" : ""}>${esc(t(h, "card.floorplan.wall.none"))}</option>` : "";
      html += label("material") + `<select class="wall-field" data-field="wall">${none}${options("wall", seg.material)}</select>`;
      if (seg.material !== null) {
        // Amendment 3: a balcony frame or a balustrade; the open edge of an outdoor room has nothing to lower.
        html += `<label class="half-check"><input type="checkbox" class="wall-field" data-field="half" ${seg.half ? "checked" : ""}>`
          + `${esc(t(h, "card.floorplan.wall.half"))}</label>`;
        html += ["interior", "exterior"].map((w) => `<button data-action="wall_default" data-which="${w}">`
          + `${esc(t(h, `card.floorplan.wall.default.${w}`))}</button>`).join("");
      }
    }
    html += `<span class="floor-label">${esc(t(h, "card.floorplan.wall.floor"))}</span>` + label("height")
      + `<input type="number" class="wall-field" data-field="height" min="2" max="10" step="0.05" value="${esc(String(floor.height ?? FLOOR_HEIGHT_M))}">`
      + label("slab") + `<select class="wall-field" data-field="slab">${options("slab", floor.slab ?? materials.defaults.slab)}</select>`;
    const outdoor = this._doc.wifi?.outdoor ?? [];
    html += `<span class="floor-label">${esc(t(h, "card.floorplan.wall.outdoor"))}</span>` + floor.rooms.map((room) =>
      `<label class="outdoor-check"><input type="checkbox" class="wall-field" data-field="outdoor" data-area="${esc(room.area_id)}"`
      + ` ${outdoor.includes(room.area_id) ? "checked" : ""}>${esc(roomLabel(room, h, this._config.rooms).text)}</label>`).join("");
    return `<div class="wall-panel">${html}</div>`;
  }

  // The plan's switched-off Wi-Fi signal sensors, read when edit mode started: enabling them calibrates
  // the maps. (Edit mode has no maps, so the list stands in the panel, not in the Confidence legend.)
  _disabledHtml() {
    if (!this._wifiOn || !this._disabled?.length) return "";
    const h = this._hass;
    const name = (d) => pointName(h, d.device_id ? { device_id: d.device_id } : { entity_id: d.entity_id });
    return `<div class="wifi-disabled"><span>${esc(t(h, "card.floorplan.wifi.disabled"))}</span><ul>${this._disabled.map((d) =>
      `<li>${esc(name(d))}: <code>${esc(d.entity_id)}</code></li>`).join("")}</ul></div>`;
  }

  // "Use as access point?" for the first point of the floor the rules match, asked once per browser.
  _offerHtml() {
    if (!this._wifiOn || !this._floor) return "";
    const key = accessPointCandidates(this._hass, this._floor, wifiRules).find((k) => !this._offered.has(k));
    const point = key && this._floor.points.find((p) => keyOf(p) === key);
    if (!point) return "";
    const h = this._hass;
    const answer = (a) => `<button data-action="ap_offer" data-key="${esc(key)}" data-answer="${a}">${esc(t(h, `card.floorplan.wifi.${a}`))}</button>`;
    return `<div class="ap-offer"><span>${esc(t(h, "card.floorplan.wifi.offer", { name: pointName(h, point) }))}</span>${answer("yes")}${answer("no")}</div>`;
  }

  // The selected opening: its kind, width, state without a sensor and sensor; a door's
  // style and the buttons that swap its hinge and its side; the whole wall; remove.
  _openingPanelHtml() {
    const o = this._tool === "openings" && this._floor?.openings?.[this._opening];
    if (!o) return "";
    const h = this._hass;
    const kind = kindOf(o);
    const opt = (value, text, on) => `<option value="${esc(value)}" ${on ? "selected" : ""}>${esc(text)}</option>`;
    const sel = (name, label, options) => `<label>${esc(t(h, `card.floorplan.opening.${label}`))}</label>`
      + `<select class="opening-field" data-field="${name}">${options}</select>`;
    const button = (action, label) => `<button data-action="${action}">${esc(t(h, `card.floorplan.opening.${label}`))}</button>`;
    let html = sel("kind", "kind", KINDS.map((k) => opt(k, t(h, `card.floorplan.opening.kinds.${k}`), k === kind)).join(""));
    if (kind === "door") {
      html += sel("sliding", "style", STYLES.map((v) => opt(v === "sliding" ? "true" : "", t(h, `card.floorplan.opening.styles.${v}`), v === styleOf(o))).join(""))
        + button("swap_hinge", "swap_hinge") + button("swap_side", "swap_side");
    }
    const cls = { door: "door", window: "window", fixed: "window" }[kind];
    if (cls && this._wifiOn) {
      const current = o.material ?? openingDefaults(this._doc.wifi, o).material;
      html += sel("material", "material", materialsFor(cls).map((id) => opt(id, t(h, `card.floorplan.material.${id}`), id === current)).join(""));
    }
    html += `<label>${esc(t(h, "card.floorplan.opening.width"))}</label>`
      + `<input class="opening-field" data-field="width" type="number" min="0.1" step="0.05" value="${esc(String(widthOf(o)))}">`
      + button("fill_wall", "fill_wall");
    if (kind === "door" || kind === "window") {
      const state = o.state ?? openingDefaults(this._doc.wifi, o).state;
      html += sel("state", "default", ["open", "closed"].map((s) => opt(s, t(h, `card.floorplan.opening.${s}`), s === state)).join(""))
        + sel("entity", "sensor", opt("", t(h, "card.floorplan.opening.no_sensor"), !o.entity)
          + openingSensors(h, o).map((c) => opt(c.id, c.name, c.id === o.entity)).join(""));
    }
    return `<div class="opening-panel">${html}${button("remove_opening", "remove")}</div>`;
  }

  _trayHtml() {
    const groups = trayGroups(this._doc, this._hass, [...this._cands.values()]);
    this._oneGroup = groups.length === 1;    // a lone group starts open, several start collapsed
    return trayHtml(this._hass, t, groups, (key) => this._groupOpen(key));
  }

  _groupOpen(key) {
    return this._trayOpen.get(key) ?? this._oneGroup;
  }

  _rect() {
    return this._svg.getBoundingClientRect();
  }

  // Metres per screen pixel, so handles and text keep their size at any zoom.
  _px() {
    const { s } = frame(this._view, this._rect());
    return s ? 1 / s : this._view.w / 800;
  }

  _drawSvg(editing) {
    const svg = this._svg;
    svg.replaceChildren();
    const size = this._rect();
    this._drawnSize = `${Math.round(size.width)}x${Math.round(size.height)}`;
    this._registry();
    if (this._status !== "ready" || !this._floor) return;
    const floor = this._drawnFloor();
    const v = this._view;
    svg.setAttribute("viewBox", `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.w)} ${fmt(v.h)}`);
    const px = this._px();
    const h = this._hass;
    const names = [];       // where each room's name is, for readings to keep clear of
    const map = this._map();
    this._mapNow = map;
    this._syncTick(map);
    this._drawContext(svg, px);
    for (const room of floor.rooms) {
      const cls = ["room"];
      if (room.area_id === this._selected) cls.push("selected");
      if (this._picks.includes(room.area_id)) cls.push("picked");
      if (this._wifiOn) cls.push("walled");      // its edges drawn as walls, by weight
      el("polygon", { class: cls.join(" "), "data-kind": "room", "data-area": room.area_id,
        points: room.polygon.map((p) => p.join(",")).join(" ") }, svg);
    }
    if (map) this._defs(svg, px);
    if (map?.layer === "radio") {
      if (map.cls) (TRAFFIC_MAPS.includes(map.cls) ? this._drawTraffic(svg, floor, map) : this._drawWifi(svg, floor, map));
    } else if (map && map.cls !== "lamps") this._drawHeat(svg, floor, map);
    if (this._wifiOn) {
      this._drawWalls(svg);
      if (map?.layer === "radio" && map.ranges) this._drawRanges(svg, map, px);
    } else {
      // Walls between rooms of one open space: dashed and lighter, over the solid outline.
      for (const [a, b] of facingWalls(floor)) {
        const at = { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) };
        el("line", { class: "open-wall-mask", ...at }, svg);
        el("line", { class: "open-wall", ...at }, svg);
      }
    }
    this._drawOpenings(svg, floor, px, editing);
    if (editing && this._tool === "walls" && this._wall) this._drawWall(svg, px);
    this._drawSamples(svg, px, editing, map);
    // Room names. In edit mode they stay in the middle of the room, the floor area under them, and
    // readings keep clear of them; in view mode the readings are laid out first and a name they
    // would cover moves to a free corner of its room (placeNames, after the layout below).
    const nameGroup = el("g", {}, svg);
    const roomNames = floor.rooms.map((room) => {
      const label = roomLabel(room, h, this._config.rooms);
      const spot = widestRow(room.polygon);
      const size = labelSize(label.text, spot.width, px) * px;
      const w = String(label.text).length * CHAR_EM * size;
      if (editing) {
        names.push({ x0: spot.x - w / 2, x1: spot.x + w / 2, y0: spot.y - size * 0.6,
          y1: spot.y + size * 0.6 + 16 * px });     // the floor area sits under it
      }
      return { label, size, poly: room.polygon, at: [spot.x, spot.y], w, h: size * 1.2 };
    });
    if (editing) drawGrid(svg, el, v, px);
    if (editing && this._tool === "move") {
      for (const room of floor.rooms) {
        room.polygon.forEach((a, i) => {
          const b = room.polygon[(i + 1) % room.polygon.length];
          el("line", { class: "edge", "data-kind": "edge", "data-area": room.area_id, "data-edge": i,
            x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, svg);
        });
      }
      for (const room of floor.rooms) {
        room.polygon.forEach((p, i) => el("circle", { class: "corner", "data-kind": "corner",
          "data-area": room.area_id, "data-index": i, cx: p[0], cy: p[1], r: 6 * px }, svg));
      }
    }
    const active = this._drag?.kind === "corner" ? this._drag.area : this._selected;
    if (editing) drawDims(svg, el, { hass: h, t, floor, px, active });
    for (const p of this._picks.filter(Array.isArray)) el("circle", { class: "pick", cx: p[0], cy: p[1], r: 5 * px }, svg);
    // A room's unplaced devices are one dot with their count; its list opens with a tap (edit mode).
    const clusters = this._clusters(floor);
    const inCluster = new Map([...clusters].flatMap(([area, c]) => c.points.map((p) => [keyOf(p), area])));
    // The registry links of the point dragged, hovered or (in edit mode) tapped. A device inside a
    // cluster has no marker of its own: its links end at the cluster's dot, which is named there.
    const linked = this._drag?.kind === "point" ? this._drag.key : this._hoverKey ?? (editing ? this._picked : null);
    if (linked) {
      const at = new Map(floor.points.map((p) => [keyOf(p), p]));
      const spot = (key) => (inCluster.has(key) ? clusters.get(inCluster.get(key)).at : [at.get(key).x, at.get(key).y]);
      const ends = new Map();     // far end -> {to, names}
      for (const link of registryLinks(h, floor.points)) {
        if (link.from !== linked && link.to !== linked) continue;
        const far = link.from === linked ? link.to : link.from;
        const end = inCluster.has(far) ? `cluster:${inCluster.get(far)}` : far;
        if (!ends.has(end)) ends.set(end, { to: spot(far), names: [], cluster: inCluster.has(far) });
        ends.get(end).names.push(pointName(h, at.get(far)));
      }
      const from = spot(linked);
      for (const { to, names, cluster } of ends.values()) {
        el("line", { class: "link", x1: from[0], y1: from[1], x2: to[0], y2: to[1] }, svg);
        if (cluster) {
          el("text", { class: "link-label", x: to[0], y: to[1] - 16 * px, "font-size": 11 * px }, svg)
            .textContent = linkLabel(names);
        }
      }
    }
    const clustered = new Set(inCluster.keys());
    // Readings laid out clear of walls, dots and each other; cluster dots are obstacles too. A
    // reading map also shows every placed point that measures it, whatever its layer.
    const measures = (p) => map && p.placed && (map.layer === "radio" ? this._sourceObs(p).length > 0
      : map.cls !== "lamps" && this._readings(p)[map.cls] && this._value(this._readings(p)[map.cls], map.cls, map.layer) !== undefined);
    const shown = floor.points.filter((p) => !clustered.has(keyOf(p)) && (this._shown(this._cat(p)) || measures(p)));
    const labels = new Map(layoutLabels([
      ...shown.map((p) => ({ key: keyOf(p), at: [p.x, p.y], lines: this._lines(p).map((l) => l.text) })),
      ...[...clusters.values()].map((c) => ({ key: null, at: c.at, lines: [] })),
    ], { rooms: floor.rooms.map((r) => r.polygon), px, obstacles: names }).map((l) => [l.key, l]));
    const r = 9 * px;
    const taken = [...[...labels.values()].map((l) => l.box),
      ...[...shown.map((p) => [p.x, p.y]), ...[...clusters.values()].map((c) => c.at)]
        .map(([x, y]) => ({ x0: x - r, x1: x + r, y0: y - r, y1: y + r }))];
    const spots = editing ? roomNames.map((n) => n.at) : placeNames(roomNames, taken, px);
    roomNames.forEach(({ label, size }, i) => {
      const text = el("text", { class: `label${label.missing ? " missing" : ""}`, x: fmt(spots[i][0]),
        y: fmt(spots[i][1]), "font-size": size }, nameGroup);
      text.textContent = label.text;
      if (label.missing) el("title", {}, text).textContent = t(h, "card.floorplan.missing_area");
    });
    for (const point of shown) this._drawMarker(svg, point, px, editing, labels.get(keyOf(point)));
    for (const [area, c] of clusters) {
      const g = el("g", { class: "cluster", "data-kind": "cluster", "data-cluster": area,
        transform: `translate(${fmt(c.at[0])} ${fmt(c.at[1])})` }, svg);
      el("circle", { r: 11 * px }, g);
      el("text", { "font-size": 12 * px, "dominant-baseline": "central" }, g).textContent = String(c.points.length);
    }
    this._clusterList(clusters);
    const picked = editing && floor.points.find((p) => keyOf(p) === this._picked);
    const room = picked && floor.rooms.find((r) => pointInPolygon([picked.x, picked.y], r.polygon));
    if (room) drawWallDistances(svg, el, { hass: h, t, poly: room.polygon, pt: [picked.x, picked.y], px });
    const ghost = this._drag?.ghost;
    if (ghost) {
      const g = el("g", { class: "marker ghost", transform: `translate(${fmt(ghost.at[0])} ${fmt(ghost.at[1])})` }, svg);
      el("circle", { class: "shape", r: 7 * px }, g);
      el("text", { y: 22 * px, "font-size": 13 * px }, g).textContent = ghost.label;
    }
    this._retip();
  }

  // Survey and manual samples, a small dot with its dBm: on the Confidence map and in edit mode only (the
  // survey page's panel names the newest). On the survey page the next spots and the spot tapped; the
  // reading tool's spot.
  _drawSamples(svg, px, editing, map) {
    if (!this._wifiOn) return;
    const survey = this._config.survey && !editing;
    if (editing || map?.cls === "confidence") {
      const g = el("g", {}, svg);
      for (const s of this._doc.wifi?.samples || []) {
        if (s.floor_id !== this._floorId || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
        const dot = el("g", { class: "sample", "data-source": s.source ?? "survey", transform: `translate(${fmt(s.x)} ${fmt(s.y)})` }, g);
        el("circle", { r: fmt(3 * px) }, dot);
        el("text", { class: "sample-label", x: fmt(5 * px), "font-size": fmt(10 * px), "stroke-width": fmt(3 * px),
          "dominant-baseline": "central" }, dot)
          .textContent = dbmText(s.dbm);
      }
    }
    if (survey) {
      this._nextSpots().forEach((spot, i) => {
        el("circle", { class: "next-spot", cx: fmt(spot.x), cy: fmt(spot.y), r: fmt(10 * px), "data-why": spot.why }, svg);
        el("text", { class: "next-spot-label", x: fmt(spot.x), y: fmt(spot.y), "font-size": fmt(11 * px), "dominant-baseline": "central" }, svg)
          .textContent = String(i + 1);
      });
      if (this._spot) el("circle", { class: "survey-spot", cx: fmt(this._spot[0]), cy: fmt(this._spot[1]), r: fmt(7 * px) }, svg);
    }
    if (editing && this._tool === "reading" && this._reading) {
      el("circle", { class: "reading-spot", cx: fmt(this._reading[0]), cy: fmt(this._reading[1]), r: fmt(7 * px) }, svg);
    }
  }

  // The survey's next spots on the floor and band shown (the map's cells, calibrated where it is), worked
  // out again when the map or the readings change.
  _nextSpots() {
    const map = this._map();
    if (!map?.band || !map.cls) return [];
    const step = this._rect().width < NARROW_PX ? NARROW_STEP_M : STEP_M;
    const { key, cells } = this._wifi(map.band, step, map.calibrated, map.cls === "confidence");
    const { list, digest } = this._observations();
    const memo = `${key}|${digest}`;
    if (this._spotsMemo?.key !== memo) {
      const obs = list.filter((o) => o.floorId === this._floorId && o.band === map.band);
      const rooms = this._doc.floors.find((f) => f.floor_id === this._floorId)?.rooms ?? [];
      const centred = cells.map((c) => ({ ...c, x: c.x + step / 2, y: c.y + step / 2 }));
      this._spotsMemo = { key: memo, spots: nextSpots(centred, obs, rooms) };
    }
    return this._spotsMemo.spots;
  }

  // The Survey panel (survey page, view mode): the live link, I'm here, the last sample's outcome, the next
  // spots and how to walk.
  _drawSurvey() {
    const box = this.shadowRoot?.querySelector(".survey");
    if (!box) return;
    if (!this._config.survey || this._status !== "ready" || this._mode === "edit") {
      box.innerHTML = "";
      return;
    }
    const h = this._hass;
    const note = this._surveyNote && t(h, this._surveyNote.key, this._surveyNote.vars);
    const spots = this._nextSpots();
    box.innerHTML = `<div class="survey-link">${esc(this._linkText())}</div>`
      + `<div class="survey-actions"><button data-action="survey_here" class="primary" ${this._spot && !this._taking ? "" : "disabled"}>`
      + `${esc(t(h, "card.floorplan.survey.here"))}</button>`
      + (this._taking ? `<span class="survey-progress"><span></span></span><span>${esc(t(h, "card.floorplan.survey.recording"))}</span>`
        : !this._spot ? `<span>${esc(t(h, "card.floorplan.survey.pick"))}</span>` : "")
      + (note && !this._taking ? `<span class="survey-note">${esc(note)}</span>` : "") + "</div>"
      + (spots.length ? `<div class="survey-next"><span>${esc(t(h, "card.floorplan.survey.next"))}</span><ol>${spots.map((s) =>
        `<li>${esc(t(h, `card.floorplan.survey.why.${s.why}`))}</li>`).join("")}</ol></div>` : "")
      + `<p class="survey-help">${esc(t(h, "card.floorplan.survey.help"))}</p>`;
  }

  _linkText() {
    const h = this._hass;
    const l = this._link;
    if (!l) return t(h, "card.floorplan.survey.no_link");
    const vars = { band: this._bandNumber(String(l.band)), channel: l.channel, dbm: dbmText(l.dbm) };
    return Number.isFinite(l.noise) ? t(h, "card.floorplan.survey.link", { ...vars, noise: dbmText(l.noise) })
      : t(h, "card.floorplan.survey.link_no_noise", vars);
  }

  // I'm here: the page's server records the next 5 readings (about 10 s) at the tapped spot and writes the
  // sample to the plan file; the card adds it to the plan as read, so a later save keeps it.
  async _takeSample() {
    if (!this._spot || this._taking) return;
    const [x, y] = this._spot.map(mm);
    this._taking = true;
    this._surveyNote = null;
    this._drawSurvey();
    let note;
    try {
      const r = await fetch("survey/sample", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floor_id: this._floorId, x, y }) });
      if (!r.ok) note = { key: "card.floorplan.survey.failed", vars: { error: await r.text() } };
      else {
        const got = await r.json();
        if (got?.sample) {
          this._addSample(got.sample);
          this._spot = null;
          note = { key: "card.floorplan.survey.taken", vars: { dbm: dbmText(got.sample.dbm), band: this._bandNumber(String(got.sample.band)) } };
        } else note = { key: "card.floorplan.survey.skipped", vars: { reason: got?.skipped ?? "" } };
      }
    } catch (err) {
      note = { key: "card.floorplan.survey.failed", vars: { error: err?.message || String(err) } };
    }
    this._taking = false;
    this._surveyNote = note;
    this._render();
  }

  // A sample the server wrote: in the plan as read, as edited and as Cancel returns to.
  _addSample(sample) {
    const add = (doc) => doc && { ...doc, wifi: { ...doc.wifi, samples: [...(doc.wifi?.samples || []), sample] } };
    const clean = this._doc === this._base;
    this._loaded = add(this._loaded);
    this._base = add(this._base);
    this._doc = clean ? this._base : add(this._doc);
  }

  // The floor as drawn: a sensor linked to an opening stands on it (SPEC-028 Amendment 9).
  _drawnFloor() {
    const floor = this._floor;
    const spots = linkedSpots(floor);
    if (!spots.size) return floor;
    // A sensor's point: its own entity's, or its device's (the device's readings need not include it).
    const owner = new Map([...spots.keys()].map((id) => [this._hass?.entities?.[id]?.device_id ?? id, spots.get(id)]));
    const points = floor.points.map((p) => {
      const spot = [p.entity_id, p.device_id, ...(p.also || [])].map((k) => k && owner.get(k)).find(Boolean);
      return spot ? { ...p, x: spot[0], y: spot[1], placed: true, linked: true } : p;
    });
    return { ...floor, points };
  }

  // Doors, windows, doorways and fixed glass: a gap in the wall; a hinged door's leaf (open: across
  // its swing, closed: in the gap), a sliding door's leaf beside its track (open: over the wall), a
  // window's two panes and sash, fixed glass's two panes. A linked one shows its sensor's state;
  // unknown is dashed. The selected or dragged one measures the free wall either side.
  _drawOpenings(svg, floor, px, editing) {
    const h = this._hass;
    const tool = editing && this._tool === "openings";
    (floor.openings || []).forEach((o, i) => {
      const shape = openingShape(floor, o);
      if (!shape) return;
      const kind = kindOf(o);
      const state = openingState(o, h, this._doc.wifi?.outdoor);
      const cls = ["opening", kind, state.open ? "open" : "closed"];
      if (styleOf(o) === "sliding") cls.push("sliding");
      if (state.linked) cls.push("linked");
      if (!state.known) cls.push("unknown");
      if (tool && this._opening === i) cls.push("selected");
      // On a thick wall the opening is drawn on the wall's middle line, where its gap in the wall line is.
      const [dx, dy] = this._wifiOn && this._wallMemo ? openingShift(this._wallMemo.paired, shape.centre) : [0, 0];
      const g = el("g", { class: cls.join(" "), "data-kind": "opening", "data-index": i,
        ...(dx || dy ? { transform: `translate(${fmt(dx)} ${fmt(dy)})` } : {}) }, svg);
      const line = (a, b, c) => el("line", { class: c, x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) }, g);
      const [p, q] = shape.ends;
      const n = shape.normal;
      const off = (pt, d) => [pt[0] + n[0] * d, pt[1] + n[1] * d];
      line(p, q, "gap");
      // Jambs across the wall at both ends: a closed door or window still reads as one.
      if (kind !== "opening") for (const end of [p, q]) line(off(end, -4 * px), off(end, 4 * px), "jamb");
      if (kind === "window" || kind === "fixed") {
        line(off(p, 2 * px), off(q, 2 * px), "pane");
        line(off(p, -2 * px), off(q, -2 * px), "pane");
        if (kind === "window") line(p, q, "sash");
      } else if (kind === "door" && styleOf(o) === "sliding") {
        // Its track runs the gap and as far again past the hinge end, where it slides to.
        const { hinge, free } = shape;
        const past = [2 * hinge[0] - free[0], 2 * hinge[1] - free[1]];
        line(off(free, 3 * px), off(past, 3 * px), "track");
        if (state.open) line(off(hinge, 3 * px), off(past, 3 * px), "leaf");
        else line(off(p, 3 * px), off(q, 3 * px), "leaf");
      } else if (kind === "door" && state.open) {
        const { hinge, free } = shape;
        const tip = off(hinge, shape.width);
        line(hinge, tip, "leaf");
        // A quarter circle about the hinge from the gap's free end to the leaf's tip.
        const d = [free[0] - hinge[0], free[1] - hinge[1]];
        const sweep = d[0] * n[1] - d[1] * n[0] > 0 ? 1 : 0;
        el("path", { class: "swing", d: `M ${fmt(free[0])} ${fmt(free[1])} A ${fmt(shape.width)} ${fmt(shape.width)} 0 0 ${sweep} ${fmt(tip[0])} ${fmt(tip[1])}` }, g);
      } else if (kind === "door") line(p, q, "leaf");
      if (tool) line(p, q, "hit");
      const name = o.entity ? h?.states?.[o.entity]?.attributes?.friendly_name || o.entity : null;
      el("title", {}, g).textContent = [t(h, `card.floorplan.opening.kinds.${kind}`), name, kind === "fixed" ? null
        : t(h, `card.floorplan.opening.${!state.known ? "unknown" : state.open ? "open" : "closed"}`)].filter(Boolean).join(" · ");
      const dragged = this._drag?.kind === "opening" && this._drag.index === i;
      if (tool && (this._opening === i || dragged)) this._drawSpan(svg, floor, shape, px);
    });
  }

  // The floor's walls as lines by weight (Amendment 3), over the maps: light, solid, heavy by their 5 GHz
  // loss, glazing tinted, a half wall dashed, an edge with no wall faintly dotted; a thick wall once, on
  // the middle of its gap. Worked out on the whole floor, as the Wi-Fi model sees it, so a card showing one
  // room (`area`) draws that room's walls classified among its neighbours. Kept while the floor and the
  // plan's Wi-Fi settings are the same.
  _drawWalls(svg) {
    const full = this._doc.floors.find((f) => f.floor_id === this._floorId);
    const m = this._wallMemo;
    if (!m || m.floor !== full || m.wifi !== this._doc.wifi) {
      this._wallMemo = { floor: full, wifi: this._doc.wifi, lines: wallLines(full, this._doc.wifi, this._hass),
        paired: wallSegments({ ...full, openings: [] }, this._doc.wifi, {}).filter((s) => s.pair) };
    }
    const area = this._config.area;
    const g = el("g", { class: "walls" }, svg);
    for (const l of this._wallMemo.lines) {
      if (area && !l.areas.includes(area)) continue;
      const cls = ["wall-line", l.weight, ...(l.glass ? ["glass"] : []), ...(l.half ? ["half"] : [])];
      el("line", { class: cls.join(" "), "data-weight": l.weight, x1: fmt(l.a[0]), y1: fmt(l.a[1]), x2: fmt(l.b[0]), y2: fmt(l.b[1]) }, g);
    }
  }

  // Ranges (Amendment 3): each access point's outline at -67 dBm (solid) and -75 dBm (dashed) on the map's
  // band and mode in its Serving colour, inside the rooms, and a ring at its place with its name.
  _drawRanges(svg, map, px) {
    const step = this._rect().width < NARROW_PX ? NARROW_STEP_M : STEP_M;
    const { aps, lines } = this._rangeLines(map, step);
    const rooms = this._doc.floors.find((f) => f.floor_id === this._floorId)?.rooms ?? [];
    const g = el("g", { class: "ranges" }, svg);
    const clip = el("clipPath", { id: "fp-ranges" }, el("defs", {}, g));
    for (const room of rooms) el("polygon", { points: room.polygon.map((p) => p.join(",")).join(" ") }, clip);
    const inside = el("g", { "clip-path": "url(#fp-ranges)" }, g);
    const path = (l) => `M ${l.points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(" L ")}${l.closed ? " Z" : ""}`;
    const [call, weak] = SCALES.dbm.marks;
    lines.forEach(({ ap, outlines }, i) => {
      const stroke = servingColour(i);
      for (const [level, ls] of [[call, outlines.call], [weak, outlines.weak]]) {
        for (const l of ls) el("path", { class: `range ${level === call ? "call" : "weak"}`, "data-ap": ap, "data-dbm": level, d: path(l), stroke }, inside);
      }
    });
    const h = this._hass;
    for (const ap of accessPoints(this._doc)) {
      const i = aps.indexOf(ap.key);
      const point = ap.floorId === this._floorId && i >= 0 && this._floor.points.find((p) => keyOf(p) === ap.key);
      if (!point) continue;
      const stroke = servingColour(i);
      el("circle", { class: "range-ring", "data-ap": ap.key, cx: fmt(point.x), cy: fmt(point.y), r: fmt(14 * px), stroke }, g);
      // The halo is a stroke in the plan's metres (vector-effect does not reach text): 3 px, scaled like the font.
      el("text", { class: "range-name", x: fmt(point.x), y: fmt(point.y - 18 * px), "font-size": fmt(11 * px),
        "stroke-width": fmt(3 * px), fill: stroke }, g)
        .textContent = pointName(h, point);
    }
  }

  // Every access point's outlines on the band and mode of the map, from the levels on one grid over the
  // floor (wifi.js levelGrid; calibrated like the map's cells), worked out again when the map's cache key changes.
  _rangeLines(map, step) {
    const { key } = this._wifi(map.band, step, map.calibrated);
    if (this._rangeMemo?.key === key) return this._rangeMemo;
    const grid = this._levels(map, step);
    const [call, weak] = SCALES.dbm.marks;
    const lines = (grid?.aps ?? []).map((ap, i) => ({ ap, outlines: { call: rangeOutlines(grid, grid.levels[i], call), weak: rangeOutlines(grid, grid.levels[i], weak) } }));
    this._rangeMemo = { key, aps: grid?.aps ?? [], lines };
    return this._rangeMemo;
  }

  // The engine's per-access-point grid: a method of its own, so a test counts the computations.
  _levels(map, step) {
    const doc = this._doc;
    if (map.calibrated) {
      const fit = this._calibration();
      return calibratedLevelGrid(contextFor(doc, this._floorId, this._hass, materials, fit.params), map.band, step, fit);
    }
    return levelGrid(contextFor(doc, this._floorId, this._hass, materials, this._wifiKey.params), map.band, step);
  }

  // A tap for an opening: on a thick wall (drawn on the middle of its gap) the point on its room's edge.
  _onWall(pt, tol) {
    return this._wifiOn ? wallPickPoint(this._floor, this._doc.wifi, pt, tol) : pt;
  }

  // An opening on a thick wall parts its two rooms (Amendment 3), not a room from the outside, though the
  // other room's edge is across the gap: its second room set, an "outside" it opens into dropped.
  _pairRooms(doc, index) {
    if (!this._wifiOn) return doc;
    const floor = doc.floors.find((f) => f.floor_id === this._floorId);
    const o = floor.openings?.[index];
    const seg = o && o.rooms[1] === null && wallSegmentAt(floor, doc.wifi, o.at, 0.01);
    const other = seg?.pair && seg.areas.find((a) => a !== o.rooms[0]);
    if (!other) return doc;
    return setOpening(doc, this._floorId, index, { rooms: [o.rooms[0], other], ...(o.opens === "outside" ? { opens: null } : {}) }) ?? doc;
  }

  // The wall stretch the walls tool selected, corner to corner.
  _drawWall(svg, px) {
    const seg = wallSegmentAt(this._floor, this._doc.wifi, this._wall, PICK_PX * px);
    if (!seg) return;
    // A thick wall is drawn on the middle of its gap: selected there too.
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const [a, b] = seg.pair ? [mid(seg.a, seg.pair[0]), mid(seg.b, seg.pair[1])] : [seg.a, seg.b];
    el("line", { class: "wall-selected", x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) }, svg);
  }

  // Along the wall, 12 px off it on the side the opening opens into: the free wall from each end of
  // the opening to the nearest corner or junction, and its length.
  _drawSpan(svg, floor, shape, px) {
    const h = this._hass;
    const m = t(h, "card.floorplan.units.m");
    const n = shape.normal;
    const off = (pt) => [pt[0] + n[0] * 12 * px, pt[1] + n[1] * 12 * px];
    let angle = (Math.atan2(shape.dir[1], shape.dir[0]) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    else if (angle <= -90) angle += 180;
    for (const part of Object.values(wallSpan(floor, shape))) {
      if (part.length < 0.005) continue;
      const [a, b] = [off(part.from), off(part.to)];
      el("line", { class: "to-wall", x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) }, svg);
      for (const end of [part.from, part.to]) {
        el("line", { class: "to-wall tick", x1: fmt(end[0] + n[0] * 8 * px), y1: fmt(end[1] + n[1] * 8 * px),
          x2: fmt(end[0] + n[0] * 16 * px), y2: fmt(end[1] + n[1] * 16 * px) }, svg);
      }
      const x = (a[0] + b[0]) / 2 + n[0] * 9 * px;
      const y = (a[1] + b[1]) / 2 + n[1] * 9 * px;
      el("text", { class: "dim to-wall", x: fmt(x), y: fmt(y), "font-size": 11 * px, "dominant-baseline": "central",
        transform: `rotate(${Math.round(angle * 10) / 10} ${fmt(x)} ${fmt(y)})` }, svg)
        .textContent = `${numberText(h, part.length, 2)} ${m}`;
    }
  }

  // Dots that would cover each other, as clusters of two or more: unplaced points by the room they
  // stand in (key: the area id), and placed points closer on screen than STACK_PX to one another
  // (a stack, key "at:" and its first point's key): zooming in parts them.
  _clusters(floor) {
    const byRoom = new Map();
    const placed = [];
    for (const point of floor.points) {
      if (!this._shown(this._cat(point))) continue;
      if (point.placed) {
        placed.push(point);
        continue;
      }
      const room = floor.rooms.find((r) => pointInPolygon([point.x, point.y], r.polygon));
      const key = room?.area_id ?? "";
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key).push(point);
    }
    // Single linkage: a dot within reach of any dot of a stack is in that stack.
    const reach = STACK_PX * this._px();
    const parent = placed.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    placed.forEach((a, i) => placed.forEach((b, j) => {
      if (j > i && Math.hypot(a.x - b.x, a.y - b.y) <= reach) parent[root(j)] = root(i);
    }));
    const stacks = new Map();
    placed.forEach((p, i) => {
      if (!stacks.has(root(i))) stacks.set(root(i), []);
      stacks.get(root(i)).push(p);
    });
    for (const points of stacks.values()) {
      const first = [...points].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1))[0];
      byRoom.set(`at:${keyOf(first)}`, points);
    }
    const out = new Map();
    for (const [area, points] of byRoom) {
      if (points.length < 2) continue;
      const at = [0, 1].map((i) => points.reduce((sum, p) => sum + (i ? p.y : p.x), 0) / points.length);
      out.set(area, { points, at });
    }
    return out;
  }

  // The open cluster's devices beside its dot: drag one out to where it stands, tap one to pick it.
  _clusterList(clusters) {
    const list = this.shadowRoot.querySelector(".cluster-list");
    const open = this._openCluster != null && clusters.get(this._openCluster);
    // Out of the way while a device is being dragged (from the list or the plan); back after the drop.
    if (open && this._drag?.kind === "point" && this._drag.moved) {
      list.hidden = true;
      return;
    }
    if (!open || this._mode !== "edit") {
      list.hidden = true;
      list.innerHTML = "";
      if (!open) this._openCluster = null;
      return;
    }
    const h = this._hass;
    const items = [...open.points].sort((a, b) => pointName(h, a).localeCompare(pointName(h, b)));
    list.innerHTML = items.map((p) => `<div class="item" data-point="${esc(keyOf(p))}" title="${esc(t(h, "card.floorplan.tray.drag"))}">`
      + `${dotHtml(categoryById(this._cat(p).id))}${esc(this._pointNames(p).join(" + "))}</div>`).join("");
    list.hidden = false;
    const { s, ox, oy } = frame(this._view, this._rect());
    const svgLeft = this._rect().left - this.shadowRoot.querySelector(".body").getBoundingClientRect().left;
    list.style.left = `${svgLeft + ox + (open.at[0] - this._view.x) * s + 16}px`;
    list.style.top = `${oy + (open.at[1] - this._view.y) * s - 12}px`;
  }

  _drawMarker(svg, point, px, editing, label = null) {
    const h = this._hass;
    const cls = ["marker"];
    if (editing && !point.placed) cls.push("unplaced");
    if (editing && keyOf(point) === this._picked) cls.push("picked");
    const cat = this._cat(point);
    cls.push(`cat-${cat.id}`);
    if (point.linked) cls.push("linked");
    const g = el("g", { class: cls.join(" "), "data-kind": point.linked ? "linked-point" : "point",
      "data-key": keyOf(point), transform: `translate(${fmt(point.x)} ${fmt(point.y)})` }, svg);
    const shape = { class: "shape", style: `fill: ${colourOf(categoryById(cat.id))}` };
    if (cat.marker === "square") el("rect", { ...shape, x: -6 * px, y: -6 * px, width: 12 * px, height: 12 * px }, g);
    else if (cat.marker === "diamond") {
      el("polygon", { ...shape, points: [[0, -8], [8, 0], [0, 8], [-8, 0]].map(([x, y]) => `${fmt(x * px)},${fmt(y * px)}`).join(" ") }, g);
    } else el("circle", { ...shape, r: 7 * px }, g);
    // Further roles (what else it senses) as rings in their colours, two at most.
    cat.roles.slice(1, 3).forEach((id, i) => el("circle", { class: "role-ring", r: (11 + 3 * i) * px,
      style: `stroke: ${colourOf(categoryById(id))}` }, g));
    // Its readings where the layout put them (relative to the dot), with a leader when moved away.
    // The lamps map: a lamp that is on glows by its brightness, one that is off is grey.
    const lamp = this._mapNow?.cls === "lamps" && point.device_id && lampOf(h, this._lamps, [point.device_id, ...(point.also || [])]);
    if (lamp?.on) g.insertBefore(el("circle", { class: "glow", r: (18 + lamp.brightness * 0.4) * px }), g.firstChild);
    else if (lamp) g.querySelector(".shape").setAttribute("style", "fill: var(--disabled-text-color, #888)");
    if (!label) return;
    const [x0, y0] = [label.cx - point.x, label.top - point.y];
    if (label.leader) {
      const near = [Math.max(label.box.x0, Math.min(point.x, label.box.x1)) - point.x,
        Math.max(label.box.y0, Math.min(point.y, label.box.y1)) - point.y];
      el("line", { class: "leader", x1: 0, y1: 0, x2: fmt(near[0]), y2: fmt(near[1]) }, g);
    }
    this._lines(point).forEach(({ text, main }, i) => {
      el("text", { class: main ? "value main" : "value", x: fmt(x0), y: fmt(y0 + (11 + 15 * i) * px),
        "font-size": 13 * px }, g).textContent = text;
    });
  }

  // The hatching of a room without a sensor and a lamp's glow, sized for this zoom.
  _defs(svg, px) {
    const defs = el("defs", {}, svg);
    const w = 8 * px;
    const hatch = el("pattern", { id: "fp-hatch", width: w, height: w, patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)" }, defs);
    el("line", { class: "hatch-line", x1: 0, y1: 0, x2: 0, y2: w, "stroke-width": 2 * px }, hatch);
    const glow = el("radialGradient", { id: "fp-glow" }, defs);
    el("stop", { offset: 0, "stop-color": "#fff3b0", "stop-opacity": 0.8 }, glow);
    el("stop", { offset: 1, "stop-color": "#fdd835", "stop-opacity": 0 }, glow);
  }

  // The heat of a reading map inside each room, hatched where a room has no such reading. Kept while
  // its samples are the same: a hover redraws the plan, and a few thousand cells are not free.
  _drawHeat(svg, floor, map) {
    const samples = floor.points.filter((p) => p.placed).flatMap((p) => {
      const id = this._readings(p)[map.cls];
      const value = id && this._value(id, map.cls, map.layer);
      return value === undefined ? [] : [{ at: [p.x, p.y], value, id }];
    });
    // Each room's own sensor, as its area names it: the room's value; null without a value.
    const bases = this._roomSensors(map).map((id) => {
      if (!id) return undefined;
      const value = this._value(id, map.cls, map.layer);
      return { id, value: value === undefined ? null : value };
    });
    // Rooms of one open space share their readings.
    const index = new Map(floor.rooms.map((r, i) => [r.area_id, i]));
    const groups = openSpaces(floor).map((g) => g.map((area) => index.get(area)));
    const key = JSON.stringify([map.cls, samples, groups, bases]);
    if (this._heatCache?.key !== key || this._heatCache.floor !== floor) {
      const g = el("g", { class: "heat" });
      const { cells, empty } = heat(floor.rooms.map((r) => r.polygon), samples, STEP_M, groups, bases);
      // Cells on a slanted or offset wall overhang it: each room's cells are clipped to the room.
      const defs = el("defs", {}, g);
      const byRoom = new Map();
      floor.rooms.forEach((room, i) => {
        const clip = el("clipPath", { id: `fp-room-${i}` }, defs);
        el("polygon", { points: room.polygon.map((p) => p.join(",")).join(" ") }, clip);
        byRoom.set(i, el("g", { "clip-path": `url(#fp-room-${i})` }, g));
      });
      for (const c of cells) {
        el("rect", { x: fmt(c.x), y: fmt(c.y), width: STEP_M + 0.01, height: STEP_M + 0.01,
          fill: colourAt(map.cls, c.value) }, byRoom.get(c.room));
      }
      for (const i of empty) el("polygon", { class: "no-sensor", points: floor.rooms[i].polygon.map((p) => p.join(",")).join(" ") }, g);
      // The walls again, over the heat (with Wi-Fi on, the wall lines are drawn over every map instead).
      if (!this._wifiOn) for (const room of floor.rooms) el("polygon", { class: "wall", points: room.polygon.map((p) => p.join(",")).join(" ") }, g);
      this._heatCache = { key, floor, g };
    }
    svg.appendChild(this._heatCache.g);
  }

  // The predicted (or calibrated) Wi-Fi of the floor's rooms, drawn like the heat: a band map in the
  // dBm ramp, the Serving map in each access point's colour with handover cells hatched, Confidence
  // in its three fills. Cells are 0.3 m on a narrow card. Kept while the prediction and the map are the same.
  _drawWifi(svg, floor, map) {
    const step = this._rect().width < NARROW_PX ? NARROW_STEP_M : STEP_M;
    const { key, cells, aps } = this._wifi(map.band, step, map.calibrated, map.cls === "confidence");
    // The rooms drawn (one with `area`), by their index in the plan's floor, which the cells carry.
    const rooms = this._doc.floors.find((f) => f.floor_id === this._floorId).rooms;
    const drawn = new Set(floor.rooms.map((r) => r.area_id));
    const cacheKey = `wifi|${key}|${map.cls}|${[...drawn].join()}`;
    if (this._heatCache?.key !== cacheKey) {
      const g = el("g", { class: "heat" });
      const defs = el("defs", {}, g);
      const byRoom = new Map();
      rooms.forEach((room, i) => {
        if (!drawn.has(room.area_id)) return;
        const clip = el("clipPath", { id: `fp-room-${i}` }, defs);
        el("polygon", { points: room.polygon.map((p) => p.join(",")).join(" ") }, clip);
        byRoom.set(i, el("g", { "clip-path": `url(#fp-room-${i})` }, g));
      });
      const serving = map.cls === "serving";
      const confidence = map.cls === "confidence";
      const size = step + 0.01;
      for (const c of cells) {
        const parent = byRoom.get(c.room);
        if (!parent) continue;
        const at = { x: fmt(c.x), y: fmt(c.y), width: size, height: size };
        const fill = confidence ? CONFIDENCE[c.conf] : serving ? servingColour(aps.indexOf(c.ap)) : colourAt("dbm", c.dbm);
        el("rect", { ...at, "data-dbm": Math.round(c.dbm), ...(serving ? { "data-ap": c.ap } : {}),
          ...(confidence ? { "data-conf": c.conf } : {}), fill }, parent);
        if (serving && isHandover(c)) el("rect", { ...at, class: "handover" }, parent);
      }
      this._heatCache = { key: cacheKey, floor, g };
    }
    svg.appendChild(this._heatCache.g);
  }

  // The traffic maps (SPEC-047). The heat: each cell of heatCells() on the global lattice,
  // clipped to the drawn rooms. Rebuilt at most once a second; kept while the router's data is not
  // live (the banner says so). The links map draws no layer of its own here.
  _drawTraffic(svg, floor, map) {
    if (map.cls === "traffic_links") return void this._drawLinks(svg, floor, map);
    if (!map.traffic.live) return;
    const step = this._rect().width < NARROW_PX ? NARROW_STEP_M : STEP_M;
    // Serving cells as the Serving map has them: calibrated once there are readings, unless Predicted is chosen.
    const calibrated = this._observations().list.length > 0 && this._calib !== "predicted";
    const key = JSON.stringify([this._floorId, floor.rooms.map((r) => r.area_id), step, calibrated]);
    const kept = this._trafficCache;
    const age = kept ? Date.now() - kept.at : Infinity;
    if (!kept || kept.key !== key || kept.doc !== this._doc || age >= TRAFFIC_MS) {
      this._trafficCache = { key, doc: this._doc, at: Date.now(), g: this._trafficHeat(floor, map, step, calibrated), list: map.traffic.list };
    } else if (kept.list !== map.traffic.list && !this._trafficTimer) {
      // Throttled: one rebuild when the second is up, so the last change is not left unseen.
      this._trafficTimer = setTimeout(() => {
        this._trafficTimer = null;
        this._drawSvg(this._status === "ready" && this._mode === "edit");
      }, TRAFFIC_MS - age);
      this._trafficTimer.unref?.();
    }
    svg.appendChild(this._trafficCache.g);
  }

  // While a traffic map is shown the stamp is checked every `interval_s` of the router, so a router that
  // goes silent shows its banner without any state change.
  _syncTick(map) {
    const want = map && TRAFFIC_MAPS.includes(map.cls) ? (trafficRules(wifiRules)[0]?.traffic.freshness?.interval_s ?? 30) * 1000 : 0;
    if (want === this._tickMs) return;
    clearInterval(this._tickTimer);
    this._tickMs = want;
    this._tickTimer = want ? setInterval(() => this._refresh(), want) : null;
    this._tickTimer?.unref?.();
  }

  _trafficHeat(floor, map, step, calibrated) {
    const full = this._doc.floors.find((f) => f.floor_id === this._floorId);
    const list = map.traffic.list;
    // Serving cells for the bands some unplaced Wi-Fi client uses, as the Serving map has them.
    const bands = offeredBands(this._doc);
    const serving = {};
    for (const c of list) {
      if (c.link === "wired" || c.point || !c.ap || serving[c.link]) continue;
      serving[c.link] = bands.includes(c.link) ? this._wifi(c.link, step, calibrated).cells : [];
    }
    const placed = ({ floorId, key }) => {
      const p = floorId === this._floorId && floor.points.find((q) => keyOf(q) === key);
      return p && p.placed !== false && Number.isFinite(p.x) && Number.isFinite(p.y) ? [p.x, p.y] : null;
    };
    const apAt = (key) => {
      for (const f of this._doc.floors) {
        const p = (f.points ?? []).find((q) => keyOf(q) === key && q.placed !== false && Number.isFinite(q.x) && Number.isFinite(q.y));
        if (p) {
          const i = f.rooms.findIndex((r) => pointInPolygon([p.x, p.y], r.polygon));
          return { x: p.x, y: p.y, floorId: f.floor_id, roomIndex: i < 0 ? null : i };
        }
      }
      return null;
    };
    const cells = heatCells(list, full, serving, placed, apAt, step);
    const g = el("g", { class: "heat traffic" });
    const defs = el("defs", {}, g);
    const clip = el("clipPath", { id: "fp-traffic-clip" }, defs);
    for (const room of floor.rooms) el("polygon", { points: room.polygon.map((p) => p.join(",")).join(" ") }, clip);
    const clipped = el("g", { "clip-path": "url(#fp-traffic-clip)" }, g);
    const inner = clipped;
    for (const c of cells) {
      if (c.value < SCALES.mbps.lo) continue;     // under the scale's floor the heat is transparent, not the lowest colour
      el("rect", { x: fmt(c.x), y: fmt(c.y), width: step, height: step, "data-mbps": Math.round(c.value * 1e6) / 1e6,
        fill: colourAt("mbps", c.value) }, inner);
    }
    return g;
  }

  // A rate as the card writes it: 12.50 Mbit/s.
  _mbit(v) {
    return `${numberText(this._hass, v, SCALES.mbps.digits)} ${SCALES.mbps.unit}`;
  }

  // Traffic links (SPEC-047): each client a dot joined to its access point by a line, solid wired and dashed
  // Wi-Fi, in its link's colour, width and dot size by `total`; an unplaced client on a ring around its access
  // point, a placed one at its point (clients sharing a point spread on a small ring). Sizes are screen pixels.
  // Idle clients (under 0.01 Mbit/s) are small and unlabelled, or hidden with the Idle switch off. Not live: grey.
  _drawLinks(svg, floor, map) {
    const px = this._px();
    const h = this._hass;
    const at = (key) => floor.points.find((q) => keyOf(q) === key && q.placed !== false && Number.isFinite(q.x) && Number.isFinite(q.y));
    const apAt = new Map(accessPoints(this._doc).filter((a) => a.floorId === this._floorId)
      .flatMap((a) => { const p = at(a.key); return p ? [[a.key, [p.x, p.y]]] : []; }));
    const shown = map.traffic.list.filter((c) => map.idle || c.total >= IDLE_MBPS)
      .sort((a, b) => (a.mac < b.mac ? -1 : 1));
    // Where each dot stands: its point, or the ring of its access point; clients on one spot are spread.
    const spot = new Map();      // mac -> {centre, radius, group, placed}
    const groups = new Map();
    for (const c of shown) {
      let s = null;
      if (c.point) {
        if (c.point.floorId !== this._floorId) continue;
        const p = at(c.point.key);
        if (p) s = { centre: [p.x, p.y], radius: SHARED_RING_M, group: `p:${c.point.key}`, placed: true,
          marker: this._shown(this._cat(p)) || this._sourceObs(p).length > 0 };     // is its device's marker drawn there?
      }
      if (!s && c.ap && apAt.has(c.ap)) s = { centre: apAt.get(c.ap), radius: 1.2, group: `a:${c.ap}`, placed: false };
      if (!s) continue;
      spot.set(c.mac, s);
      groups.set(s.group, [...(groups.get(s.group) ?? []), c.mac]);
    }
    const g = el("g", { class: "traffic-links" }, svg);
    const dots = [];
    for (const c of shown) {
      const s = spot.get(c.mac);
      if (!s) continue;
      const mates = groups.get(s.group);
      // An unplaced client always takes its place on the ring; a placed one stays on its point when alone.
      const at2 = !s.placed ? ringPosition(s.centre, mates.indexOf(c.mac), mates.length, s.radius)
        : mates.length === 1 ? s.centre : ringPosition(s.centre, mates.indexOf(c.mac), mates.length, s.radius);
      dots.push({ c, at: at2, placed: s.placed, ring: s.placed && s.marker && mates.length === 1 });
      const to = c.ap && apAt.get(c.ap);
      if (!to) continue;
      const attrs = { class: c.stale ? "client-line stale" : "client-line", "data-mac": c.mac, x1: fmt(at2[0]), y1: fmt(at2[1]),
        x2: fmt(to[0]), y2: fmt(to[1]), stroke: LINK_COLOURS[c.link], "stroke-width": fmt(lineWidth(c.total)) };
      if (c.link !== "wired") attrs["stroke-dasharray"] = "6 4";
      el("line", attrs, g);
    }
    for (const { c, at: [x, y], placed, ring } of dots) {
      if (ring) {
        // A lone placed client is a ring round its device's marker (a disc would hide under it); the marker's tip lists it.
        el("circle", { class: c.stale ? "client-ring stale" : "client-ring", "data-mac": c.mac, cx: fmt(x), cy: fmt(y),
          r: fmt((MARKER_R + dotRadius(c.total)) * px), fill: "none", stroke: LINK_COLOURS[c.link], "stroke-width": fmt(lineWidth(c.total)) }, g);
        continue;
      }
      const idle = c.total < IDLE_MBPS;
      const cls = ["client"];
      if (!placed) cls.push("unplaced");
      if (c.stale) cls.push("stale");
      const dot = el("g", { class: cls.join(" "), "data-kind": "client", "data-key": `client:${c.mac}`, "data-mac": c.mac,
        transform: `translate(${fmt(x)} ${fmt(y)})` }, g);
      const r = dotRadius(c.total) * px;
      const rim = placed ? {} : { "stroke-dasharray": "2 2" };
      el("circle", { r: fmt(r), fill: LINK_COLOURS[c.link], ...rim }, dot);
      if (!idle) el("text", { class: "client-label", y: fmt(r + 11 * px), "font-size": fmt(11 * px) }, dot).textContent = this._clientTitle(c);
    }
  }

  // A client's name: its device's when the registry or a point's MAC found one, else the router's.
  _clientTitle(c) {
    const dev = c.device_id && this._hass.devices?.[c.device_id];
    return (dev && (dev.name_by_user || dev.name)) || c.name;
  }

  // "5 s", "3 min", "2 h" since a time.
  _since(date) {
    const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
  }

  _clientLink(link) {
    return link === "wired" ? t(this._hass, "card.floorplan.traffic.links.wired")
      : t(this._hass, "card.floorplan.wifi.bands", { bands: this._bandNumber(link) });
  }

  // The tap panel's lines for one client: the router's name when it differs from the title, its access
  // point, link, down and up, how it was matched to a device, and the time since its last update.
  _clientRows(c, title = this._clientTitle(c)) {
    const h = this._hass;
    const tt = (key, vars) => t(h, `card.floorplan.traffic.${key}`, vars);
    const ap = c.ap ? pointName(h, this._apPoint(c.ap) ?? { device_id: c.ap }) : "\u2014";
    return [
      ...(c.name !== title ? [tt("router_name", { name: c.name })] : []),
      tt("access_point", { name: ap }),
      tt("link", { link: this._clientLink(c.link) }),
      tt("down", { value: this._mbit(c.down) }),
      tt("up", { value: this._mbit(c.up) }),
      tt(`matched.${c.matched_by ?? "none"}`),
      tt("updated_ago", { time: this._since(c.updated) }),
    ];
  }

  // The tip a Traffic links client opens: its name and rows.
  _clientTip(key) {
    const c = this._trafficList().find((x) => `client:${x.mac}` === key);
    if (!c) return null;
    return { key: `m:${key}`, name: this._clientTitle(c), ids: [], rows: this._clientRows(c) };
  }

  // The tip's traffic lines for a marker on Traffic links: an access point's clients against its own
  // node rates and the clients on access points the plan does not have; a device its placed clients'.
  _trafficRows(point) {
    const h = this._hass;
    const list = this._trafficList();
    const key = keyOf(point);
    const tt = (k, vars) => t(h, `card.floorplan.traffic.${k}`, vars);
    if (accessPoints(this._doc).some((a) => a.key === key)) {
      const sum = apTotals(list).get(key)?.total ?? 0;
      const node = nodeRates(h, wifiRules, key);
      const num = (v) => numberText(h, v, SCALES.mbps.digits);
      const rows = [node ? tt("clients_vs_node", { clients: num(sum), node: num(node.down + node.up) }) : tt("clients_total", { clients: num(sum) })];
      const known = new Set(accessPoints(this._doc).map((a) => a.key));
      const off = list.filter((c) => !c.ap || !known.has(c.ap));
      if (off.length) rows.push(tt("off_plan"), ...off.map((c) => `${this._clientTitle(c)}: ${this._mbit(c.total)}`));
      return rows;
    }
    // A heading per client; with several on one device they are told apart by the router's name.
    const mine = list.filter((c) => c.point?.key === key);
    return mine.flatMap((c) => { const head = mine.length > 1 ? c.name : this._clientTitle(c); return [head, ...this._clientRows(c, head)]; });
  }

  _trafficList() {
    return this._mapNow?.traffic?.list ?? [];
  }

  // A marker's lines: its readings, or on a map the map's (the shown one first and marked main). On
  // a radio map an access point lists its bands, a signal source what it reports ("−52 dBm · 2.4 · its
  // access point", the 24-hour mean once the statistics are in), any other point its readings.
  _lines(point) {
    const map = this._mapNow;
    if (!map || !this._config.values) return this._values(point).map((text) => ({ text, main: false }));
    const h = this._hass;
    if (map.layer === "radio") {
      const ap = accessPoints(this._doc).find((a) => a.key === keyOf(point));
      if (ap && map.cls === "traffic_links") {
        const sum = apTotals(map.traffic.list).get(ap.key) ?? { total: 0, count: 0 };
        return [{ text: t(h, "card.floorplan.traffic.ap_label", { total: this._mbit(sum.total), count: sum.count }), main: true }];
      }
      if (ap) return [{ text: t(h, "card.floorplan.wifi.bands", { bands: bandsText(ap.bands, (b) => this._bandNumber(b)) }), main: true }];
      const own = this._sourceObs(point);
      if (own.length) return own.map((o) => ({ text: this._sourceText(o), main: true }));
      return this._values(point).map((text) => ({ text, main: false }));
    }
    if (map.cls === "lamps") {
      const lamp = point.device_id && lampOf(h, this._lamps, [point.device_id, ...(point.also || [])]);
      return lamp ? [{ text: lamp.on ? `${lamp.brightness} %` : t(h, "card.floorplan.maps.off"), main: false }] : [];
    }
    const ids = this._readings(point);
    const plant = this._cat(point).id === "plants";
    return labelClasses(map.layer, plant, map.cls).flatMap((cls) => {
      const value = ids[cls] && this._value(ids[cls], cls, map.layer);
      return value === undefined ? [] : [{ text: formatValue(cls, value), main: cls === map.cls }];
    });
  }

  // An observation as a label: its dBm with a true minus, its band, its access point's name (— unknown).
  _sourceText(o) {
    const h = this._hass;
    const v = Math.round(o.dbm);
    return t(h, "card.floorplan.wifi.source", { dbm: `${v < 0 ? "\u2212" : ""}${Math.abs(v)}`, band: this._bandNumber(o.band),
      ap: o.ap ? pointName(h, this._apPoint(o.ap) ?? { device_id: o.ap }) : "\u2014" });
  }

  // Readings only: names would collide once a plan holds many sensors, so they are in the tooltip.
  // A plant's value is its name, so a plant is a dot.
  _values(point) {
    if (!this._config.values) return [];
    const h = this._hass;
    const name = pointName(h, point);
    return pointEntities(point, this._entities).map((id) => valueText(h, id)).filter((v) => v !== "—" && v !== name);
  }

  _valueStamp() {
    const floor = this._floor;
    if (!floor || !this._hass) return "";
    const ids = this._config.values ? floor.points.flatMap((p) => pointEntities(p, this._entities)) : [];
    for (const o of floor.openings || []) if (o.entity) ids.push(o.entity);
    // A map also follows a plant's sensors and the lamps; a Wi-Fi map the signal sensors.
    const map = this._map();
    let traffic = "";
    let liveness = "";     // the banner is in the bar: a change of it is a full render
    if (map) {
      for (const p of floor.points) {
        ids.push(...Object.values(this._readings(p)));
        if (p.device_id && this._lamps.has(p.device_id)) ids.push(this._lamps.get(p.device_id));
      }
      if (map.layer === "radio") ids.push(...this._observations().list.filter((o) => o.entity).map((o) => o.entity));
      // A traffic map follows the router's clients: their rates, links and nodes, and whether it is live.
      if (TRAFFIC_MAPS.includes(map.cls)) {
        const { list, reason, updated } = this._traffic();
        traffic = JSON.stringify([updated?.getTime(), list.map((c) => [c.mac, c.down, c.up, c.link, c.ap, c.stale])]);
        liveness = reason;
      }
    }
    // The first line (the language and the areas' names) changes labels and selects: a full render.
    // An area created from the card arrives in a later hass and must show by name. JSON keeps a
    // name with a newline on that first line.
    const areas = Object.values(this._hass.areas || {}).map((a) => [a.area_id, a.name]).sort();
    return [JSON.stringify([this._hass.language, areas, liveness]),
      ids.map((id) => this._hass.states?.[id]?.state).join("|") + traffic].join("\n");
  }

  // ---- buttons and selects -----------------------------------------------------------------

  _onClick(e) {
    // A pointer tap on a group's summary toggles it in _onUp; a keyboard one (detail 0) here.
    const group = e.target.closest?.(".tray summary[data-group]");
    if (group) {
      e.preventDefault();
      if (e.detail === 0) this._toggleGroup(group.getAttribute("data-group"));
      return;
    }
    const button = e.target.closest?.("button[data-action]");
    if (!button || button.disabled) return;
    const action = button.getAttribute("data-action");
    const centre = [this._view.x + this._view.w / 2, this._view.y + this._view.h / 2];
    if (action === "zoom_in") this._view = zoomAt(this._view, 1 / ZOOM_STEP, centre);
    else if (action === "zoom_out") this._view = zoomAt(this._view, ZOOM_STEP, centre);
    else if (action === "fit") this._view = this._fit();
    else if (action === "edit") this._enterEdit();
    else if (action === "cancel") this._leaveEdit(this._base);
    else if (action === "save") return void this._save();
    else if (action === "survey_here") return void this._takeSample();
    else if (action === "add_reading") {
      const panel = this.shadowRoot.querySelector(".reading-panel");
      const value = (name) => panel?.querySelector(`[data-field="${name}"]`)?.value ?? "";
      const raw = value("dbm").trim();
      const next = this._reading && addReading(this._doc, this._floorId,
        { x: mm(this._reading[0]), y: mm(this._reading[1]), band: value("band"), dbm: raw === "" ? NaN : Number(raw), ap: value("ap") || null });
      if (this._edit(next)) this._reading = null;
    }
    else if (action === "tool") {
      this._tool = button.getAttribute("data-tool");
      this._resetPicks();
    } else if (action === "create_area") return void this._createArea();
    else if (action === "close_room") this._edit(closeRoom(this._doc, this._floorId, this._selected));
    else if (action === "remove_opening") {
      if (this._edit(removeOpening(this._doc, this._floorId, this._opening))) this._opening = null;
    } else if (action === "swap_hinge") this._edit(swapHinge(this._doc, this._floorId, this._opening));
    else if (action === "swap_side") this._edit(swapSide(this._doc, this._floorId, this._opening));
    else if (action === "fill_wall") this._edit(fillWall(this._doc, this._floorId, this._opening));
    else if (action === "wall_default") {
      // The selected wall's material for every wall of its kind without one of its own; its own entry goes.
      const seg = this._wall && wallSegmentAt(this._floor, this._doc.wifi, this._wall, PICK_PX * this._px());
      const next = seg && setWifiDefault(this._doc, button.getAttribute("data-which"), seg.material);
      if (this._edit(next)) this._doc = setWallMaterial(next, this._floorId, seg.at, seg.material) ?? next;
    } else if (action === "ap_offer") {
      const key = button.getAttribute("data-key");
      if (button.getAttribute("data-answer") === "yes") this._edit(setAccessPoint(this._doc, this._floorId, key, {}));
      this._offered.add(key);
      save(OFFER_KEY, [...this._offered]);
    }
    else if (action === "separate") {
      this._edit(separatePoint(this._doc, this._floorId, this._picked, button.getAttribute("data-device")));
    } else if (action === "map") {
      this._maps = { ...this._maps, [this._mapLayer()]: button.getAttribute("data-map") };
      save(MAP_KEY, this._maps);
    } else if (action === "band") {
      this._band = button.getAttribute("data-band");
      save(BAND_KEY, this._band);
    } else if (action === "calib") {
      this._calib = button.getAttribute("data-calib");
      save(CALIB_KEY, this._calib);
    } else if (action === "idle") {
      this._idle = !this._idle;
      save(IDLE_KEY, this._idle);
    } else if (action === "ranges") {
      this._ranges = !this._ranges;
      save(RANGES_KEY, this._ranges);
    } else if (action === "day") {
      this._day = button.getAttribute("data-day") === "1";
      save(AGG_KEY, this._day);
      this._heatCache = null;
    } else if (action === "layer") return void this.pressLayer(button.getAttribute("data-layer"));
    this._render();
  }

  _toggleGroup(key) {     // the tray alone: _render would rebuild the area panel and drop a half-typed name
    this._trayOpen.set(key, !this._groupOpen(key));
    this.shadowRoot.querySelector(".tray").innerHTML = this._trayHtml();
  }

  _onChange(e) {
    if (e.target.matches?.("select.floor")) {
      this._floorId = this._doc.floors.find((f) => String(f.floor_id) === e.target.value)?.floor_id ?? this._floorId;
      this._doc = autoPlace(this._doc, this._hass, this._floorId, [...this._cands.values()]);
      this._view = this._fit();
      this._resetPicks();
      this._render();
    } else if (e.target.matches?.("select.area") && e.target.value) {
      this._applyArea(e.target.value);
    } else if (e.target.matches?.(".opening-field") && this._opening != null) {
      const field = e.target.getAttribute("data-field");
      const raw = e.target.value;
      if (field === "material") this._edit(setOpeningMaterial(this._doc, this._floorId, this._opening, raw));
      else {
        const value = field === "width" ? Number(raw) || "" : field === "sliding" ? raw === "true" : raw;
        const next = setOpening(this._doc, this._floorId, this._opening, { [field]: value });
        // A new kind sheds a material it cannot have (wood on a window, any on a doorway).
        const o = next?.floors.find((f) => f.floor_id === this._floorId).openings[this._opening];
        const fits = !o?.material || !!setOpeningMaterial(next, this._floorId, this._opening, o.material);
        this._edit(fits ? next : setOpeningMaterial(next, this._floorId, this._opening, null));
      }
      this._render();
    } else if (e.target.matches?.(".wall-field")) {
      const field = e.target.getAttribute("data-field");
      const raw = e.target.value;
      if (field === "outdoor") this._edit(setOutdoor(this._doc, e.target.getAttribute("data-area"), e.target.checked));
      else if (field === "wall" || field === "half") {
        const seg = this._wall && wallSegmentAt(this._floor, this._doc.wifi, this._wall, PICK_PX * this._px());
        if (seg && field === "wall") this._edit(setWallMaterial(this._doc, this._floorId, seg.at, raw || null));
        else if (seg) this._edit(setWallHeight(this._doc, this._floorId, seg.at, e.target.checked));
      } else this._edit(setFloorWifi(this._doc, this._floorId, { [field]: field === "height" ? (raw === "" ? null : Number(raw)) : raw }));
      this._render();
    } else if (e.target.matches?.(".ap-field") && this._picked) {
      this._edit(this._apChange(e.target));
      this._render();
    } else if (e.target.matches?.("select.category") && this._picked) {
      const own = this._cands?.get(this._picked)?.category ?? null;
      this._edit(setPointCategory(this._doc, this._floorId, this._picked, e.target.value, own));
      this._render();
    }
  }

  // The picked point's access point after a change of one of its fields; null when refused.
  _apChange(input) {
    const key = this._picked;
    const field = input.getAttribute("data-field");
    const band = input.getAttribute("data-band");
    const num = (raw) => (raw === "" ? null : Number(raw));
    if (field === "ap") return setAccessPoint(this._doc, this._floorId, key, input.checked ? {} : null);
    const ap = this._floor.access_points?.find((a) => (a.device_id ?? a.entity_id) === key);
    if (!ap) return null;
    if (field === "ap_band") {
      return setAccessPoint(this._doc, this._floorId, key, { bands: input.checked ? [...ap.bands, band] : ap.bands.filter((b) => b !== band) });
    }
    if (field === "ap_tx") return setAccessPoint(this._doc, this._floorId, key, { tx: { [band]: num(input.value) } });
    return setAccessPoint(this._doc, this._floorId, key, { mount: num(input.value) });
  }

  _enterEdit() {
    this._mode = "edit";
    this._tool = "move";
    this._say(null);
    this._doc = autoPlace(this._doc, this._hass, this._floorId, [...this._cands.values()]);
    this._loadDisabled();
  }

  _leaveEdit(doc) {
    this._mode = "view";
    this._doc = doc;
    this._disabled = null;
    this._editSession++;
    this._resetPicks();
  }

  // The plan's switched-off Wi-Fi signal sensors, read once per edit session: config/entity_registry/list
  // is an admin call, so view mode and a kiosk user never make it.
  async _loadDisabled() {
    const h = this._hass;
    this._disabled = null;
    // Only a plan with an access point has Wi-Fi maps to calibrate.
    if (!this._wifiOn || !h?.user?.is_admin || !this._doc.floors.some((f) => f.access_points?.length)) return;
    const session = ++this._editSession;
    let entries;
    try {
      entries = await h.callWS({ type: "config/entity_registry/list" });
    } catch {
      return;
    }
    if (session !== this._editSession || this._mode !== "edit") return;
    const keys = new Set(this._doc.floors.flatMap((f) => (f.points || []).map(keyOf)));
    this._disabled = disabledSignalEntities(this._hass, entries, wifiRules, keys);
    if (this._disabled.length) this._render();
  }

  _resetPicks() {
    this._picks = [];
    this._selected = null;
    this._picked = null;
    this._openCluster = null;
    this._pendingSplit = null;
    this._opening = null;
    this._wall = null;
    this._reading = null;
  }

  // Apply a refusable edit: a refused one leaves the plan as it was and says so.
  _edit(next) {
    if (next) {
      this._doc = next;
      this._say(null);
    } else this._say("card.floorplan.refused");
    return !!next;
  }

  _applyArea(areaId) {
    if (this._pendingSplit) {
      const { area, a, b } = this._pendingSplit;
      this._edit(splitRoom(this._doc, this._floorId, area, a, b, areaId));
      this._resetPicks();
    } else if (this._selected) {
      if (this._edit(linkRoom(this._doc, this._floorId, this._selected, areaId))) this._selected = areaId;
    }
    this._render();
  }

  async _createArea() {
    const input = this.shadowRoot.querySelector(".area-panel input");
    const name = input?.value.trim();
    if (!name) return;
    try {
      const entry = await this._hass.callWS({ type: "config/area_registry/create", name });
      this._applyArea(entry.area_id);
    } catch (err) {
      this._say("card.floorplan.create_failed", { error: err?.message || String(err) });
      this._render();
    }
  }

  async _save() {
    this._saving = true;
    this._render();
    try {
      const config = await this._hass.callWS({ type: "lovelace/config", url_path: URL_PATH });
      if (JSON.stringify(extract(config)) !== JSON.stringify(this._loaded)) {
        this._say("card.floorplan.changed_elsewhere");
        return;
      }
      await this._hass.callWS({ type: "lovelace/config/save", url_path: URL_PATH, config: withPlan(config, this._doc) });
      this._loaded = this._doc;
      this._base = this._doc;
      this._leaveEdit(this._doc);
      this._say("card.floorplan.saved");
    } catch (err) {
      this._say("card.floorplan.save_failed", { error: err?.message || String(err) });
    } finally {
      this._saving = false;
      this._render();
    }
  }

  // ---- pointer: zoom, pan, drag, pick ------------------------------------------------------

  _at(e) {
    return toPlan(this._view, this._rect(), e.clientX, e.clientY);
  }

  _onWheel(e) {
    if (this._status !== "ready" || !this._config.zoom) return;
    e.preventDefault();
    this._view = zoomAt(this._view, e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, this._at(e));
    this._render();
  }

  _onDown(e) {
    if (this._status !== "ready" || (e.button !== undefined && e.button !== 0)) return;
    this._showTip(null);
    this._hoverKey = null;
    // A tooltip a tap opened closes with this pointer; if it is a tap, it does nothing else.
    const hadTip = !!this._pinned;
    this._pinned = null;
    const item = e.target.closest?.(".tray [data-key], .tray summary[data-group]");
    const listed = e.target.closest?.(".cluster-list [data-point]");
    const inSvg = this._svg.contains(e.target) || e.target === this._svg;
    if (!item && !listed && !inSvg) return;
    if (listed) e.preventDefault();
    // No text selection or native drag from the tray: either would take the pointer away (pointercancel).
    if (item) e.preventDefault();
    // A primary pointer going down means no other is down: drop any whose pointerup never came.
    if (e.isPrimary) this._pointers.clear();
    this._pointers.set(e.pointerId, [e.clientX, e.clientY]);
    try {
      // On the svg even for a tray drag: the tray is redrawn while editing and would drop the capture.
      this._svg.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic or already released pointer cannot be captured; the events still bubble here
    }
    if (this._pointers.size === 2 && this._config.zoom) {
      this._drag = { kind: "pinch", dist: this._pinchDist() };
      return;
    }
    const editing = this._mode === "edit";
    const target = e.target.closest?.("[data-kind]");
    const kind = target?.getAttribute("data-kind");
    const base = { start: [e.clientX, e.clientY], view0: this._view, moved: false };
    // A dot from a cluster's list or from the plan: drawn picked on the first move or the pointerup.
    const pointKey = listed?.getAttribute("data-point")
      ?? (editing && this._tool === "move" && kind === "point" ? target.getAttribute("data-key") : null);
    if (pointKey) {
      this._drag = { ...base, kind: "point", key: pointKey };
      this._picked = pointKey;
      this._selected = null;
    } else if (item) {
      const group = item.getAttribute("data-group");
      this._drag = group ? { ...base, kind: "group", key: group } : { ...base, kind: "tray", key: item.getAttribute("data-key") };
      this._drag.label = this._dragLabel(this._drag);     // the ghost's, fixed for the drag
    } else if (editing && this._tool === "openings" && kind === "opening") {
      this._drag = { ...base, kind: "opening", index: Number(target.getAttribute("data-index")) };
      this._opening = this._drag.index;
    } else if (editing && this._tool === "move" && kind === "corner") {
      this._drag = { ...base, kind: "corner", area: target.getAttribute("data-area"), index: Number(target.getAttribute("data-index")) };
    } else {
      // A cluster drags like the background (a pan); a tap on it opens its list.
      const cluster = kind === "cluster" ? target.getAttribute("data-cluster") : null;
      // A finger (no hover) on a marker in view mode: a tap shows its tooltip.
      const touch = !!e.pointerType && e.pointerType !== "mouse";
      const marker = touch ? e.target.closest?.(TIP_TARGET)?.getAttribute("data-key") ?? null : null;
      this._drag = { ...base, kind: "pan", area: kind === "room" ? target.getAttribute("data-area") : null, cluster, touch, marker, hadTip };
    }
  }

  // ---- tooltip: a sensor's photo (a plant's, from the plants component), name and readings ------

  _hover(e) {
    const marker = e.target.closest?.(TIP_TARGET);
    const cluster = !marker && e.target.closest?.("g.cluster");
    const item = !marker && !cluster && e.target.closest?.(".tray [data-key], .cluster-list [data-point]");
    const hoverKey = marker ? marker.getAttribute("data-key") : null;
    const linkKey = hoverKey?.startsWith("client:") ? null : hoverKey;     // a traffic client has no registry links
    if (linkKey !== this._hoverKey) {
      this._hoverKey = linkKey;     // its registry links show while it is hovered
      this._drawSvg(this._status === "ready" && this._mode === "edit");
    }
    // The tooltip's content is worked out only when the pointer reaches something new.
    const key = marker ? `m:${hoverKey}` : cluster ? `c:${cluster.getAttribute("data-cluster")}`
      : item?.hasAttribute("data-point") ? `l:${item.getAttribute("data-point")}` : item ? `t:${item.getAttribute("data-key")}` : null;
    if (key && key === this._tipKey) return void this._showTip({ key }, e);
    let content = null;
    if (marker) {
      content = this._markerTip(hoverKey);
    } else if (cluster) {
      const c = this._clusters(this._floor).get(cluster.getAttribute("data-cluster"));
      if (c) content = { key, ids: [],
        name: c.points.map((p) => this._pointNames(p).join(" + ")).join(", ") };
    } else if (item?.hasAttribute("data-point")) {
      const point = this._floor?.points.find((p) => keyOf(p) === item.getAttribute("data-point"));
      if (point) content = { key, name: this._pointNames(point).join(" + "), ids: pointEntities(point, this._entities) };
    } else if (item) {
      const c = this._cands.get(item.getAttribute("data-key"));
      if (c) content = { key, name: candidateName(this._hass, c), ids: c.entities };
    }
    this._showTip(content, e);
  }

  // A marker's tooltip content: its names, readings, presence sensors and roles; null when gone.
  _markerTip(pointKey) {
    if (pointKey.startsWith("client:")) return this._clientTip(pointKey);
    const point = this._floor?.points.find((p) => keyOf(p) === pointKey);
    if (!point) return null;
    const rows = this._mapNow?.cls === "traffic_links" ? this._trafficRows(point) : [];
    return { key: `m:${pointKey}`, name: this._pointNames(point).join(" + "), ids: pointEntities(point, this._entities),
      presence: presenceEntities(this._hass, point), roles: this._cat(point).roles, rows };
  }

  // A tooltip a tap opened (no hover on a phone): it stays, with the marker's links, until the next
  // tap; a pointerdown hides it at once.
  _pinTip(pointKey, e) {
    const content = this._markerTip(pointKey);
    if (!content) return;
    this._pinned = pointKey;
    this._hoverKey = pointKey.startsWith("client:") ? null : pointKey;
    this._drawSvg(false);
    this._showTip(content, e);
  }

  // An open marker tip is worked out again from the current states: a client's rates and age change, and the
  // client may be gone. Same place; closed (and unpinned) when its subject is no more.
  _retip() {
    const tip = this.shadowRoot?.querySelector(".tip");
    const subject = this._tipSubject;
    if (!tip || tip.hidden || !subject?.startsWith("m:")) return;
    const content = this._markerTip(subject.slice(2));
    if (!content) return void (this._pinned ? this._unpinTip() : this._showTip(null));
    this._tipKey = null;
    this._showTip(content, this._tipAt);
  }

  _unpinTip() {
    this._pinned = null;
    this._hoverKey = null;
    this._showTip(null);
    this._drawSvg(false);
  }

  // A point's device name, then those of the devices joined to it as the same hardware.
  _pointNames(point) {
    const h = this._hass;
    const joined = (point.also || []).map((id) => h.devices?.[id]?.name_by_user || h.devices?.[id]?.name || id);
    return [pointName(h, point), ...joined];
  }

  _showTip(content, e) {
    const tip = this.shadowRoot?.querySelector(".tip");
    if (!tip) return;
    if (!content) {
      tip.hidden = true;
      this._tipKey = null;
      return;
    }
    if (content.key !== this._tipKey) {
      const h = this._hass;
      const pic = content.ids.map((id) => h.states?.[id]?.attributes?.entity_picture).find(safePicture);
      const values = content.ids.map((id) => valueText(h, id)).filter((v) => v !== "—" && v !== content.name);
      // Presence and contact sensors by name: "Presence: Detected".
      const named = (id) => h.entities?.[id]?.name || h.entities?.[id]?.original_name
        || h.states?.[id]?.attributes?.friendly_name || id;
      const presence = (content.presence || []).map((id) => `${named(id)}: ${valueText(h, id)}`);
      // What the dot's colour and rings mean: its category, then "Also senses:" each further role.
      const lang = h?.language;
      const [main, ...further] = (content.roles || []).map(categoryById).filter(Boolean);
      const roles = main ? `<div class="tip-roles"><span class="dot" style="background: ${colourOf(main)}"></span>`
        + `${esc(categoryName(main, lang))}${further.map((c) => `<br><span class="ring" style="border-color: ${colourOf(c)}"></span>`
          + `${esc(t(h, "card.floorplan.roles.also"))} ${esc(categoryName(c, lang))}`).join("")}</div>` : "";
      // A room's own sensor, as its area names it, gives the room its colour on the climate maps.
      const roomSensor = Object.values(h.areas || {}).some((a) => content.ids.includes(a.temperature_entity_id)
        || content.ids.includes(a.humidity_entity_id));
      tip.innerHTML = (pic ? `<img src="${esc(pic)}" alt="">` : "")
        + `<div class="tip-name">${esc(content.name)}</div>` + roles
        + (roomSensor ? `<div class="tip-value">${esc(t(h, "card.floorplan.maps.room_sensor"))}</div>` : "")
        + [...values, ...presence, ...(content.rows || [])].map((v) => `<div class="tip-value">${esc(v)}</div>`).join("");
      this._tipKey = content.key;
    }
    tip.hidden = false;
    this._tipAt = { clientX: e.clientX, clientY: e.clientY };
    this._tipSubject = content.key;
    // Below right of the pointer, flipped to its left near the card's right edge.
    const body = this.shadowRoot.querySelector(".body").getBoundingClientRect();
    const x = e.clientX - body.left;
    const y = e.clientY - body.top;
    const flip = x + 12 + (tip.offsetWidth || 0) > body.width;
    tip.style.left = `${flip ? Math.max(0, x - 12 - tip.offsetWidth) : x + 12}px`;
    tip.style.top = `${y + 12}px`;
  }

  // The point under a plan position, within a marker's reach on screen: a device point (a tray drop
  // joins it), or any placed point but `except` (a dragged dot stacks onto it).
  _pointAt([x, y], except = null, devices = true) {
    const reach = 10 * this._px();
    return this._floor?.points.find((p) => keyOf(p) !== except && (devices ? p.device_id : p.placed)
      && Math.hypot(p.x - x, p.y - y) <= reach) ?? null;
  }

  // Where a dot may stand: inside a room, else on the nearest wall.
  _inRooms(pt) {
    return insideRooms(pt, (this._floor?.rooms || []).map((r) => r.polygon));
  }

  _dragLabel(d) {
    if (d.kind === "group") {
      const g = trayGroups(this._doc, this._hass, [...this._cands.values()]).find((x) => x.key === d.key);
      return g ? `${g.name ?? t(this._hass, "card.floorplan.tray.no_room")} (${g.items.length})` : "";
    }
    const c = this._cands.get(d.key);
    return c ? candidateName(this._hass, c) : "";
  }

  // Whether the pointer is over the plan (a tray drop lands only there).
  _overSvg(e) {
    const r = this._rect();
    return e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
  }

  _pinchDist() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  }

  _onMove(e) {
    const d = this._drag;
    if (!d) this._hover(e);
    if (!d || !this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (d.kind === "pinch") {
      if (this._pointers.size < 2) return;
      const dist = this._pinchDist();
      const [a, b] = [...this._pointers.values()];
      const mid = toPlan(this._view, this._rect(), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      this._view = zoomAt(this._view, d.dist / dist, mid);
      d.dist = dist;
      this._drawSvg(this._mode === "edit");
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) < TAP_PX) return;
    d.moved = true;
    if (d.kind === "pan" && !this._config.zoom) return;     // a fixed plan: the move is only not a tap
    if (d.kind === "pan") {
      const { s } = frame(d.view0, this._rect());
      if (!s) return;
      this._view = { ...d.view0, x: d.view0.x - (e.clientX - d.start[0]) / s, y: d.view0.y - (e.clientY - d.start[1]) / s };
    } else if (d.kind === "point") {
      this._doc = movePoint(this._doc, this._floorId, d.key, this._inRooms(this._at(e))) ?? this._doc;
    } else if (d.kind === "opening") {
      const tol = PICK_PX * 3 * this._px();
      const moved = moveOpening(this._doc, this._floorId, d.index, this._onWall(this._at(e), tol), tol);
      this._doc = (moved && this._pairRooms(moved, d.index)) ?? this._doc;
    } else if (d.kind === "corner") {
      this._doc = moveCorner(this._doc, this._floorId, d.area, d.index, this._at(e)) ?? this._doc;
    } else {      // a tray item or group is dropped on pointerup; until then a ghost shows where
      d.ghost = this._overSvg(e) ? { at: this._at(e), label: d.label } : null;
    }
    // The plan alone while dragging: the bar, panels and tray follow on the pointerup.
    this._drawSvg(this._mode === "edit");
  }

  _onUp(e, cancelled = false) {
    if (!this._pointers.delete(e.pointerId)) return;
    const d = this._drag;
    if (d?.kind === "pinch") {
      if (!this._pointers.size) this._drag = null;
      return;
    }
    this._drag = null;
    if (d?.ghost) this._drawSvg(this._mode === "edit");
    if (!d || cancelled) return;
    if (d.kind === "corner" && d.moved) {
      const pt = snapCorner(this._floor, d.area, this._at(e));
      this._doc = moveCorner(this._doc, this._floorId, d.area, d.index, pt) ?? this._doc;
    } else if (d.kind === "group" && !d.moved) {
      return void this._toggleGroup(d.key);
    } else if ((d.kind === "tray" || d.kind === "group") && d.moved) {
      if (this._overSvg(e)) {
        const cands = [...this._cands.values()];
        const g = d.kind === "group" && trayGroups(this._doc, this._hass, cands).find((x) => x.key === d.key);
        const c = d.kind === "tray" && tray(this._doc, this._hass, cands).find((x) => x.key === d.key);
        // A device dropped on a marker is the same hardware as that point (an amplifier's Cast device).
        const onto = c && c.kind === "device" && this._pointAt(this._at(e));
        if (g) this._edit(addPoints(this._doc, this._floorId, g.items, this._inRooms(this._at(e))));
        else if (onto) this._edit(joinPoint(this._doc, this._floorId, keyOf(onto), c));
        else if (c) this._edit(addPoint(this._doc, this._floorId, c, this._inRooms(this._at(e))));
      }
    } else if (d.kind === "pan" && !d.moved && this._mode === "edit" && d.cluster != null) {
      this._openCluster = d.cluster;
    } else if (d.kind === "pan" && !d.moved && this._mode === "edit") {
      this._openCluster = null;
      this._tap(this._at(e), d.area);
    } else if (d.kind === "opening") {
      // A tap selects it (on the pointerdown); a drag has slid it along the walls.
    } else if (d.kind === "point" && !d.moved) {
      // A tap picks the point: its distances to the walls and its category show.
    } else if (d.kind === "pan" && !d.moved && this._mode !== "edit" && this._config.survey) {
      // The survey page: a tap inside a room is where the owner stands.
      const pt = this._at(e);
      if (!this._floor?.rooms.some((r) => pointInPolygon(pt, r.polygon))) return;
      this._spot = pt;
      this._surveyNote = null;
    } else if (d.kind === "pan" && !d.moved && this._mode !== "edit") {
      // A finger's tap on a marker shows its tooltip until the next tap elsewhere; that tap only
      // closes it (it opens no room).
      if (d.touch && this._config.tap_tips) {
        if (d.marker) return void this._pinTip(d.marker, e);
        if (d.hadTip) return void this._unpinTip();
      }
      // View mode: a tap on a room tells the host which area it is (a phone opens its page).
      const pt = this._at(e);
      const room = this._floor?.rooms.find((r) => pointInPolygon(pt, r.polygon));
      if (room) {
        this.dispatchEvent(new window.CustomEvent("room-tap", { detail: { area_id: room.area_id }, bubbles: true, composed: true }));
      }
      return;
    } else if (d.kind === "point") {
      // Dropped on another placed dot: onto it exactly, so the two stack into one dot with a list.
      const at = this._inRooms(this._at(e));
      const onto = this._pointAt(at, d.key, false);
      this._doc = movePoint(this._doc, this._floorId, d.key, onto ? [onto.x, onto.y] : at) ?? this._doc;
    } else if (!d.moved) return;
    this._render();
  }

  // A tap in edit mode: what it does depends on the tool. In view mode taps do nothing.
  _tap(pt, area) {
    if (this._tool === "move") {
      this._selected = area && area !== this._selected ? area : null;
      this._picked = null;
    } else if (this._tool === "join") {
      if (!area) return;
      this._picks = [...this._picks, area];
      if (this._picks.length === 2) {
        const [keep, drop] = this._picks;
        this._picks = [];
        if (keep !== drop) this._edit(joinRooms(this._doc, this._floorId, keep, drop));
      }
    } else if (this._tool === "open") {
      if (!area) return;
      this._picks = [...this._picks, area];
      if (this._picks.length === 2) {
        const [a, b] = this._picks;
        this._picks = [];
        if (a !== b) this._edit(openRooms(this._doc, this._floorId, a, b));
      }
    } else if (this._tool === "openings") {
      const placed = addOpening(this._doc, this._floorId, this._onWall(pt, PICK_PX * this._px()), PICK_PX * this._px());
      const next = placed && this._pairRooms(placed, (placed.floors.find((f) => f.floor_id === this._floorId).openings.length - 1));
      if (next) {
        this._edit(next);
        this._opening = this._floor.openings.length - 1;
      } else this._opening = null;
    } else if (this._tool === "reading") {
      this._reading = this._floor.rooms.some((r) => pointInPolygon(pt, r.polygon)) ? pt : null;
    } else if (this._tool === "walls") {
      this._wall = wallSegmentAt(this._floor, this._doc.wifi, pt, PICK_PX * this._px())?.at ?? null;
    } else if (this._tool === "split") {
      const wall = nearestWall(this._floor, pt, PICK_PX * this._px());
      if (!wall) return;
      this._picks = [...this._picks, wall];
      if (this._picks.length === 2) this._startSplit();
    }
  }

  // Two wall points: the room is the one both lie on whose inside holds the line's middle (a shared
  // wall belongs to both rooms). The new half's area is chosen in the area panel.
  _startSplit() {
    const [a, b] = this._picks;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const room = this._floor.rooms.find((r) => snapToEdge(r.polygon, a, 1e-6) && snapToEdge(r.polygon, b, 1e-6)
      && pointInPolygon(mid, r.polygon));
    if (!room) {
      this._picks = [];
      this._say("card.floorplan.refused");
      return;
    }
    this._pendingSplit = { area: room.area_id, a, b };
  }

  _onDblClick(e) {
    if (this._mode !== "edit" || this._tool !== "move") return;
    const target = e.target.closest?.("[data-kind]");
    const kind = target?.getAttribute("data-kind");
    const area = target?.getAttribute("data-area");
    if (kind === "corner") {
      this._edit(removeCorner(this._doc, this._floorId, area, Number(target.getAttribute("data-index"))));
    } else if (kind === "edge") {
      const i = Number(target.getAttribute("data-edge"));
      const poly = this._floor.rooms.find((r) => r.area_id === area).polygon;
      const hit = snapToEdge([poly[i], poly[(i + 1) % poly.length]], this._at(e), Infinity);
      this._edit(insertCorner(this._doc, this._floorId, area, i, gridOnWall(poly, i, hit.pt)));
    } else return;
    this._render();
  }
}

if (!customElements.get("floorplan-card")) customElements.define("floorplan-card", FloorplanCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "floorplan-card")) {
  window.customCards.push({
    type: "floorplan-card",
    name: t(null, "card.floorplan.name"),
    description: t(null, "card.floorplan.description"),
  });
}
