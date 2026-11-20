// The photo albums the Ramka's photo series come from, for the settings dashboard's Photos page:
// a summary of the choice and a "Choose albums" button that opens the album picker, a modal dialog.
//
//   type: custom:photo-albums-card
//   entity: sensor.ramka_photo_albums          # attributes `available`, `chosen` (lists), `all`
//   script: script.ramka_photo_albums_set      # called with {chosen: [...], all_albums: true|false}
//
// The picker edits a draft and writes it once, with Save; Cancel, Escape or a tap beside it leave the
// choice as it was. Ticking a box changes the draft only, so the list is never redrawn under a finger
// and keeps its scroll; updates of the sensor wait until the dialog closes. It filters by name, shows
// all, the ticked or the unticked albums, sorts by the date in the name (newest or oldest first) or by
// name, and ticks or unticks every album shown at once.
//
// "All albums" is every album, the ones added later too. Then every box shows ticked; unticking one
// leaves all the others ticked as a choice of their own. Unticking "All albums" itself brings back the
// ticks saved before it. A choice saves only with an album ticked. Without `all` (a sensor from before
// it), all is none chosen. A chosen album no longer in the folder stays listed, marked, until it is
// unticked (its folder may come back).

import { createT, language } from "./lib/i18n.js";
import en from "../translations/en.json" with { type: "json" };
import de from "../translations/de.json" with { type: "json" };
import pl from "../translations/pl.json" with { type: "json" };

const t = createT({ en, de, pl });

const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);

const SORTS = ["newest", "oldest", "az", "za"];
const SHOWS = ["all", "chosen", "unchosen"];
const SUMMARY_NAMES = 3;

const day = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? Date.UTC(y, m - 1, d) : null);

// The date an album's name starts with, as a sortable number, or null: "01.02.2024 Paris",
// "14.08-16.08.2023 trip" (a span: its first day), "2024-05-01 x", "2024 x"; else a year anywhere.
export function albumDate(name) {
  let m = name.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:\s*[-–]\s*\d{1,2}\.\d{1,2}(?:\.(\d{4}))?)?(?!\d)/);
  if (m && (m[3] || m[4])) return day(+(m[3] || m[4]), +m[2], +m[1]);
  m = name.match(/^((?:19|20)\d{2})(?:[-._](\d{1,2})(?:[-._](\d{1,2}))?)?(?!\d)/);
  if (m) return day(+m[1], +(m[2] || 1), +(m[3] || 1));
  m = name.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/);
  return m ? Date.UTC(+m[0], 0, 1) : null;
}

// `names` in the order `sort` names; albums without a date after the dated ones, by name.
export function sortAlbums(names, sort, lang = "en") {
  const byName = new Intl.Collator(lang, { numeric: true, sensitivity: "base" }).compare;
  const byDate = (sign) => (a, b) => (a[1] === b[1] ? byName(a[0], b[0]) : a[1] === null ? 1 : b[1] === null ? -1 : sign * (a[1] - b[1]));
  const cmp = { az: (a, b) => byName(a[0], b[0]), za: (a, b) => byName(b[0], a[0]), newest: byDate(-1), oldest: byDate(1) }[sort];
  return names.map((name) => [name, albumDate(name)]).sort(cmp).map(([name]) => name);
}

const STYLE = `
  ha-card { padding: 12px 16px; display: grid; gap: 10px; }
  .summary { margin: 0; }
  .names { margin: 0; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .names:empty, .warn:empty { display: none; }
  .warn { margin: 0; color: var(--warning-color, #ffa600); }
  button { font: inherit; color: var(--primary-text-color); background: none; border: 1px solid var(--divider-color);
           border-radius: 6px; min-height: 36px; padding: 0 14px; cursor: pointer; }
  button:disabled { opacity: 0.4; cursor: default; }
  button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
  ha-card > button.choose { justify-self: start; }
  dialog { border: none; border-radius: 12px; padding: 0; width: min(92vw, 560px); max-height: 90vh; box-sizing: border-box;
           background: var(--card-background-color, #fff); color: var(--primary-text-color);
           box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); }
  dialog[open] { display: flex; }
  dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
  form { display: flex; flex-direction: column; gap: 12px; padding: 20px; min-height: 0; width: 100%; box-sizing: border-box; }
  h2 { margin: 0; font-size: 1.2em; font-weight: 500; }
  label.row { display: flex; align-items: center; gap: 12px; min-height: 40px; cursor: pointer; }
  label.row input { width: 18px; height: 18px; margin: 0; flex: none; accent-color: var(--primary-color); }
  label.all { border-bottom: 1px solid var(--divider-color); padding-bottom: 6px; }
  label.all span span { font-weight: 500; }
  label.all small { display: block; color: var(--secondary-text-color); }
  .tools { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; }
  .tools input, .tools select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
                                border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 8px; min-height: 36px;
                                box-sizing: border-box; min-width: 0; }
  @media (max-width: 480px) { .tools { grid-template-columns: 1fr 1fr; } .tools input { grid-column: 1 / -1; } }
  .bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .bulk .count { flex: 1; color: var(--secondary-text-color); min-width: 8em; }
  ul { list-style: none; margin: 0; padding: 0 4px 0 0; overflow-y: auto; min-height: 120px; flex: 1 1 auto;
       border-top: 1px solid var(--divider-color); border-bottom: 1px solid var(--divider-color); }
  li + li { border-top: 1px solid var(--divider-color); }
  .missing { color: var(--secondary-text-color); font-style: italic; }
  .empty { color: var(--secondary-text-color); padding: 12px 0; }
  .hint { margin: 0; color: var(--error-color, #db4437); }
  .hint:empty { display: none; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
`;

class PhotoAlbumsCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("photo-albums-card: entity is required");
    if (!config.script) throw new Error("photo-albums-card: script is required");
    this._config = config;
    this._sort = "newest";
    this._show = "all";
    this._filter = "";
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    const attrs = hass.states[this._config.entity]?.attributes || {};
    const available = list(attrs.available);
    const chosen = list(attrs.chosen);
    const all = typeof attrs.all === "boolean" ? attrs.all : chosen.length === 0;
    const key = JSON.stringify([available, chosen, all, hass.locale?.language]);
    // An open picker keeps its draft; what came in meanwhile is drawn when it closes.
    if (key === this._built || this._dialog) return;
    this._built = key;
    this._available = available;
    this._chosen = chosen;
    this._all = all;
    this._render();
  }

  _t(key, vars) {
    return t(this._hass, key, vars);
  }

  _render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style><ha-card><p class="summary"></p><p class="names"></p><p class="warn"></p>
      <button type="button" class="choose"></button></ha-card>`;
    const total = this._available.length;
    const ticked = this._chosen.filter((a) => this._available.includes(a));
    const missing = this._chosen.filter((a) => !this._available.includes(a));
    root.querySelector(".summary").textContent = !total && !this._chosen.length
      ? this._t("card.photo_albums.none")
      : this._all
        ? this._t("card.photo_albums.summary_all", { total })
        : this._t("card.photo_albums.summary_some", { n: ticked.length, total });
    if (!this._all) {
      const names = sortAlbums(ticked, "newest", language(this._hass));
      const more = names.length - SUMMARY_NAMES;
      root.querySelector(".names").textContent = names.slice(0, SUMMARY_NAMES).join(", ")
        + (more > 0 ? ` ${this._t("card.photo_albums.more", { n: more })}` : "");
      if (missing.length) root.querySelector(".warn").textContent = this._t("card.photo_albums.missing_count", { n: missing.length });
    }
    const choose = root.querySelector("button.choose");
    choose.textContent = this._t("card.photo_albums.choose");
    choose.addEventListener("click", () => this._open());
  }

  // ---- The album picker ---------------------------------------------------------------------------

  // A modal <dialog> over the page (the browser's top layer, so no card clips it).
  _open() {
    this._draft = { all: this._all, chosen: [...this._chosen], before: [...this._chosen] };
    const dialog = document.createElement("dialog");
    dialog.className = "album-picker";
    dialog.setAttribute("aria-labelledby", "album-picker-title");
    dialog.innerHTML = `
      <form method="dialog">
        <h2 id="album-picker-title"></h2>
        <label class="row all"><input type="checkbox" name="all"><span><span></span><small></small></span></label>
        <div class="tools">
          <input type="search" name="filter">
          <select name="show"></select>
          <select name="sort"></select>
        </div>
        <div class="bulk">
          <span class="count" aria-live="polite"></span>
          <button type="button" class="tick-shown"></button>
          <button type="button" class="untick-shown"></button>
        </div>
        <ul></ul>
        <p class="hint" role="alert"></p>
        <div class="actions">
          <button type="button" class="cancel"></button>
          <button type="submit" class="save primary"></button>
        </div>
      </form>`;
    const q = (sel) => dialog.querySelector(sel);
    q("h2").textContent = this._t("card.photo_albums.title");
    q("label.all span span").textContent = this._t("card.photo_albums.all");
    q("label.all small").textContent = this._t("card.photo_albums.all_hint");
    const allBox = q("input[name=all]");
    allBox.addEventListener("change", () => {
      this._draft.all = allBox.checked;
      // Back from all: the ticks as they were before it.
      if (!allBox.checked) this._draft.chosen = [...this._draft.before];
      this._sync();
    });
    const search = q("input[name=filter]");
    search.placeholder = this._t("card.photo_albums.filter");
    search.setAttribute("aria-label", this._t("card.photo_albums.filter"));
    search.value = this._filter;
    search.addEventListener("input", () => { this._filter = search.value; this._list(true); });
    for (const [name, values] of [["show", SHOWS], ["sort", SORTS]]) {
      const select = q(`select[name=${name}]`);
      select.setAttribute("aria-label", this._t(`card.photo_albums.${name}_label`));
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = this._t(`card.photo_albums.${name}.${value}`);
        select.append(option);
      }
      select.value = this[`_${name}`];
      select.addEventListener("change", () => { this[`_${name}`] = select.value; this._list(true); });
    }
    q("button.tick-shown").textContent = this._t("card.photo_albums.tick_shown");
    q("button.untick-shown").textContent = this._t("card.photo_albums.untick_shown");
    q("button.tick-shown").addEventListener("click", () => this._bulk(true));
    q("button.untick-shown").addEventListener("click", () => this._bulk(false));
    q("button.cancel").textContent = this._t("card.photo_albums.cancel");
    q("button.save").textContent = this._t("card.photo_albums.save");
    q("ul").addEventListener("change", (ev) => {
      const name = ev.target?.dataset?.name;
      if (name !== undefined) this._toggle(name, ev.target.checked);
    });

    const close = () => {
      if (dialog.open && dialog.close) dialog.close();
      dialog.remove();
      if (this._dialog !== dialog) return;
      this._dialog = null;
      this._built = null;
      if (this._hass) this.hass = this._hass;
    };
    q("button.cancel").addEventListener("click", close);
    dialog.addEventListener("cancel", (ev) => { ev.preventDefault(); close(); });
    dialog.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.preventDefault(); close(); } });
    // A click on the dialog itself, not on the form that fills its box, is on the backdrop.
    dialog.addEventListener("click", (ev) => { if (ev.target === dialog) close(); });
    q("form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const chosen = this._draft.all ? this._draft.before : this._names().filter((n) => this._draft.chosen.includes(n));
      if (!this._draft.all && !chosen.length) return;
      const [domain, service] = this._config.script.split(".");
      this._hass.callService(domain, service, { chosen, all_albums: this._draft.all });
      close();
    });

    this.shadowRoot.append(dialog);
    this._dialog = dialog;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    this._list(true);
    return dialog;
  }

  // Every album the picker lists: the folder's, then the chosen ones no longer in it.
  _names() {
    return [...this._available, ...this._draft.chosen.filter((a) => this._isMissing(a))];
  }

  _isMissing(name) {
    return !this._available.includes(name);
  }

  // What shows ticked: under All albums every album in the folder too.
  _ticked() {
    return new Set(this._draft.all ? [...this._available, ...this._draft.chosen] : this._draft.chosen);
  }

  _shown() {
    const needle = this._filter.trim().toLocaleLowerCase();
    const ticked = this._ticked();
    const names = this._names().filter((n) => (!needle || n.toLocaleLowerCase().includes(needle))
      && (this._show === "all" || (this._show === "chosen") === ticked.has(n)));
    return sortAlbums(names, this._sort, language(this._hass));
  }

  // The rows, drawn again for a new filter, show or sort only, from the top.
  _list(top = false) {
    const ul = this._dialog.querySelector("ul");
    const scroll = ul.scrollTop;
    ul.replaceChildren();
    const ticked = this._ticked();
    const shown = this._shown();
    for (const name of shown) {
      const li = document.createElement("li");
      const label = document.createElement("label");
      label.className = "row";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.name = name;
      box.checked = ticked.has(name);
      const span = document.createElement("span");
      span.textContent = this._isMissing(name) ? `${name} (${this._t("card.photo_albums.missing")})` : name;
      if (this._isMissing(name)) span.className = "missing";
      label.append(box, span);
      li.append(label);
      ul.append(li);
    }
    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = this._t(this._names().length ? "card.photo_albums.no_match" : "card.photo_albums.none");
      ul.append(li);
    }
    ul.scrollTop = top ? 0 : scroll;
    this._status();
  }

  // The boxes and counts after a change of the draft, without drawing the rows again: under show
  // ticked or unticked a changed row stays until the next filter, show or sort.
  _sync() {
    const ticked = this._ticked();
    for (const box of this._dialog.querySelectorAll("ul input[type=checkbox]")) box.checked = ticked.has(box.dataset.name);
    this._status();
  }

  _status() {
    const q = (sel) => this._dialog.querySelector(sel);
    q("input[name=all]").checked = this._draft.all;
    const n = this._draft.all ? this._available.length : this._draft.chosen.filter((a) => !this._isMissing(a)).length;
    q(".count").textContent = this._t("card.photo_albums.count", { n, total: this._available.length });
    const empty = !this._draft.all && !this._draft.chosen.length;
    q(".hint").textContent = empty ? this._t("card.photo_albums.pick_one") : "";
    q("button.save").disabled = empty;
  }

  // A box ticked or unticked; under All albums that makes the other albums a choice of their own.
  _toggle(name, on) {
    const ticked = this._ticked();
    if (on) ticked.add(name);
    else ticked.delete(name);
    this._draft.all = false;
    this._draft.chosen = this._names().filter((n) => ticked.has(n));
    this._sync();
  }

  // Tick or untick every album shown.
  _bulk(on) {
    if (on && this._draft.all) return;
    const ticked = this._ticked();
    for (const name of this._shown()) {
      if (on) ticked.add(name);
      else ticked.delete(name);
    }
    this._draft.all = false;
    this._draft.chosen = this._names().filter((n) => ticked.has(n));
    this._sync();
  }
}

customElements.define("photo-albums-card", PhotoAlbumsCard);
