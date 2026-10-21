// Lovelace card for a wall tablet: today's events large on the left, the next six days
// beside them, in type readable from across the room. Events come from HA's calendar REST
// endpoint (/api/calendars/<entity>?start&end, any signed-in user), one request per calendar,
// refreshed every five minutes and whenever the card is (re)attached. Text and dates follow
// the Home Assistant language (en, de, pl; anything else falls back to en).
//
//   type: custom:agenda-card
//   entities:
//     - calendar.family                       # a string, or {entity, color}
//     - {entity: calendar.home, color: "#8bc34a"}
//   days: 7                                   # today plus this many minus one (default 7)
//   todo: todo.family                         # optional: open items of this to-do list (or a
//                                             # list of entities) under today's events
//   height: calc(100dvh - 16px)               # optional: fill the screen instead of grid rows
//
// A multi-day event appears on every day it covers, with the part of the time range that
// belongs to that day; a day it covers whole shows it as all-day.

import { createT, formatDate, weekdayShort } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const COLORS = ["#4fc3f7", "#aed581", "#ffb74d", "#ce93d8", "#f06292", "#80cbc4"];
const REFRESH_MS = 5 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Calendar days, not 24 h steps: the day the clocks go back is 25 h long, and today + 6 x 24 h
// then lands on that Sunday twice (seen on staging, 2026-10-20, for Sunday 2026-10-25).
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

class AgendaCard extends HTMLElement {
  setConfig(config) {
    if (!config.entities || !config.entities.length) throw new Error("agenda-card: entities is required");
    this._config = { days: 7, ...config };
    this._calendars = config.entities.map((e, i) =>
      typeof e === "string" ? { entity: e, color: COLORS[i % COLORS.length] } : { color: COLORS[i % COLORS.length], ...e });
  }

  getCardSize() {
    return 8;
  }

  get _todos() {
    const todo = this._config.todo;
    return !todo ? [] : Array.isArray(todo) ? todo : [todo];
  }

  getGridOptions() {
    return { columns: "full", rows: this._config.height ? "auto" : 8 };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) this._build();
    if (first) this._refresh();
  }

  connectedCallback() {
    this._timer = setInterval(() => this._refresh(), REFRESH_MS);
    // The day boundary and "now" move on their own: redraw every minute from the cached events.
    this._clock = setInterval(() => this._render(), 60 * 1000);
    if (this._hass) this._refresh();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    clearInterval(this._clock);
  }

  async _refresh() {
    if (!this._hass) return;
    const start = dayStart(new Date());
    const end = addDays(start, this._config.days);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const all = [];
    for (const cal of this._calendars) {
      try {
        const events = await this._hass.callApi("GET", `calendars/${cal.entity}?${q}`);
        for (const ev of events) all.push(this._parse(ev, cal));
      } catch (e) {
        // A calendar that fails to answer is simply absent this round; the next refresh retries.
      }
    }
    this._events = all.filter(Boolean).sort((a, b) => a.start - b.start);
    const items = [];
    for (const entity of this._todos) {
      try {
        const res = await this._hass.callWS({ type: "todo/item/list", entity_id: entity });
        for (const it of res.items || []) if (it.status !== "completed") items.push({ summary: it.summary, due: it.due ? new Date(it.due) : null });
      } catch (e) {
        // Same as a calendar: absent this round.
      }
    }
    // Dated first, soonest first; undated keep the list's own order.
    this._items = items.sort((a, b) => (a.due ? a.due : Infinity) - (b.due ? b.due : Infinity));
    this._render();
  }

  // HA's event: start/end are {dateTime} or {date} (all-day, end exclusive).
  _parse(ev, cal) {
    const allDay = !!(ev.start && ev.start.date);
    const start = new Date(allDay ? ev.start.date + "T00:00:00" : ev.start.dateTime);
    const end = new Date(allDay ? ev.end.date + "T00:00:00" : ev.end.dateTime);
    if (isNaN(start) || isNaN(end)) return null;
    return { summary: ev.summary || "", location: ev.location || "", start, end, allDay, color: cal.color };
  }

  // The events that touch a given day, each with its time label for that day.
  _forDay(day) {
    const next = addDays(day, 1);
    const out = [];
    for (const ev of this._events || []) {
      if (ev.end <= day || ev.start >= next) continue;
      const wholeDay = ev.allDay || (ev.start <= day && ev.end >= next);
      let time = "";
      if (!wholeDay) {
        const from = ev.start > day ? hm(ev.start) : "";
        const to = ev.end < next ? hm(ev.end) : "";
        time = from && to ? `${from}–${to}` : from ? `${from} →` : `→ ${to}`;
      }
      out.push({ ...ev, wholeDay, time, sortKey: wholeDay ? -1 : Math.max(ev.start, day) });
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }

  _build() {
    this._built = true;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; height: ${this._config.height || "100%"}; }
        ha-card { height: 100%; box-sizing: border-box; padding: 2cqh 1.5cqw; container-type: size;
                  display: flex; gap: 2cqw; overflow: hidden; }
        .today { flex: 0 0 38%; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid var(--divider-color); padding-right: 2cqw; }
        .week { flex: 1 1 auto; min-width: 0; display: grid; grid-auto-rows: 1fr; gap: 1cqh; }
        .head { font-size: 5cqh; font-weight: 600; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .head small { display: block; font-size: 2.8cqh; font-weight: 400; color: var(--secondary-text-color); margin-top: 0.5cqh; }
        .list { margin-top: 2cqh; display: flex; flex-direction: column; gap: 1.6cqh; overflow: hidden; }
        .ev { display: flex; align-items: flex-start; gap: 1.2cqw; min-width: 0; }
        .ev .time { flex: none; font-variant-numeric: tabular-nums; color: var(--secondary-text-color); white-space: nowrap; }
        .ev .title { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .ev .dot { flex: none; width: 1.4cqh; height: 1.4cqh; border-radius: 50%; margin-top: 0.6em; }
        .today .ev { font-size: 4cqh; line-height: 1.2; }
        .today .ev .time { font-size: 3.2cqh; min-width: 6.4em; }
        .today .allday .time { font-size: 2.6cqh; text-transform: uppercase; letter-spacing: 0.05em; }
        .none { font-size: 3.4cqh; color: var(--secondary-text-color); margin-top: 2cqh; }
        .todos { margin-top: auto; padding-top: 1.5cqh; border-top: 1px solid var(--divider-color); overflow: hidden; }
        .todos:empty { display: none; }
        .todos .label { font-size: 2.6cqh; text-transform: uppercase; letter-spacing: 0.05em; color: var(--secondary-text-color); margin-bottom: 1cqh; }
        .todos .ev { font-size: 3.2cqh; line-height: 1.2; margin-bottom: 0.8cqh; }
        .todos .ev .time { font-size: 2.6cqh; min-width: 5em; }
        .todos .ev .time:empty { display: none; }
        .todos .ev .dot { border: 0.25cqh solid var(--secondary-text-color); background: transparent; box-sizing: border-box; }
        .day { display: flex; gap: 1.5cqw; min-height: 0; border-top: 1px solid var(--divider-color); padding-top: 0.8cqh; }
        .day:first-child { border-top: none; padding-top: 0; }
        .day .label { flex: 0 0 9em; font-size: 2.8cqh; font-weight: 600; line-height: 1.15; white-space: nowrap; }
        .day .label small { display: block; font-weight: 400; color: var(--secondary-text-color); font-size: 2.2cqh; }
        .day .events { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 0.5cqh; overflow: hidden; }
        .day .ev { font-size: 2.7cqh; line-height: 1.2; }
        .day .ev .time { font-size: 2.4cqh; min-width: 5.8em; }
        .day .allday .time { font-size: 2cqh; text-transform: uppercase; letter-spacing: 0.05em; }
        .day .none { font-size: 2.4cqh; margin-top: 0; }
      </style>
      <ha-card>
        <div class="today"><div class="head"></div><div class="list"></div><div class="todos"></div></div>
        <div class="week"></div>
      </ha-card>`;
    this._q = (sel) => root.querySelector(sel);
  }

  _eventHtml(ev) {
    const time = ev.wholeDay ? t(this._hass, "card.agenda.allDay") : ev.time;
    return `<div class="ev${ev.wholeDay ? " allday" : ""}"><span class="dot" style="background:${esc(ev.color)}"></span>` +
      `<span class="time">${esc(time)}</span><span class="title">${esc(ev.summary || t(this._hass, "card.agenda.untitled"))}</span></div>`;
  }

  _render() {
    if (!this._built) return;
    const hass = this._hass;
    const today = dayStart(new Date());
    const head = this._q(".head");
    head.innerHTML = `${esc(t(hass, "card.agenda.today"))}<small>${esc(formatDate(hass, today, { weekday: "long", day: "numeric", month: "long" }))}</small>`;
    const todays = this._forDay(today);
    this._q(".list").innerHTML = todays.length ? todays.map((e) => this._eventHtml(e)).join("")
      : `<div class="none">${esc(t(hass, "card.agenda.empty"))}</div>`;
    const rows = [];
    for (let i = 1; i < this._config.days; i++) {
      const day = addDays(today, i);
      const evs = this._forDay(day);
      const name = i === 1 ? t(hass, "card.agenda.tomorrow") : weekdayShort(hass, day, t);
      rows.push(`<div class="day"><div class="label">${esc(name)}<small>${esc(formatDate(hass, day, { day: "numeric", month: "long" }))}</small></div>` +
        `<div class="events">${evs.length ? evs.map((e) => this._eventHtml(e)).join("") : `<div class="none">—</div>`}</div></div>`);
    }
    this._q(".week").innerHTML = rows.join("");
    const items = this._items || [];
    this._q(".todos").innerHTML = !this._todos.length ? "" : `<div class="label">${esc(t(hass, "card.agenda.reminders"))}</div>` +
      (items.length ? items.map((it) => `<div class="ev"><span class="dot"></span><span class="time">${it.due ? esc(formatDate(hass, it.due, { day: "numeric", month: "short" })) : ""}</span><span class="title">${esc(it.summary)}</span></div>`).join("")
        : `<div class="none">${esc(t(hass, "card.agenda.nothingToDo"))}</div>`);
  }
}

customElements.define("agenda-card", AgendaCard);
