// The Media page's Sound tab (config `sound`, with the audio-sensor component): the room's sound
// level live on audio-sensor's own meter (custom:room-meter-card, consumed as an element; its
// resource comes with that component) and the home's averages under it, one square each.
//
//   config.sound = {level, offset?, averages?: {leq_1_min?, leq_15_min?, leq_1_h?}}
//     level, offset   audio-sensor's music aliases (sensor.music_level, dB SPL, and
//                     sensor.music_spl_offset: its `calibrated` attribute and the clip mark)
//     averages        the home's own Leq sensors (dB SPL), as the pocket's inputs name them; the
//                     1 min one is also the meter's marker
//
//   renderSound(ctx) -> {el, update(ctx)}
//
// The meter is made once its element is defined (customElements.whenDefined): a home whose
// audio-sensor is missing shows the averages alone. A square shows its value with one decimal,
// a dash while it is unavailable, and opens the trend sheet of its sensor.

import { el, number, setAttr, setText } from "./page-kit.js";

export const ELEMENT = "room-meter-card";
export const AVERAGES = ["leq_1_min", "leq_15_min", "leq_1_h"];

export const STYLE = `
  .media .sound[hidden], .media .sound .meter[hidden], .media .sound .avg[hidden] { display: none; }
  /* The meter's dial and its strip of recent readings fit a phone's width at this height. */
  .media .sound .meter { height: 360px; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); }
  .media .sound .sec { font-size: 12.5px; font-weight: 600; margin: 18px 4px 8px; color: var(--mut);
                       text-transform: uppercase; letter-spacing: .5px; }
  .media .sound .avgs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  .media .sound .avg { box-sizing: border-box; min-width: 44px; min-height: 64px; margin: 0; padding: 10px;
                       display: flex; flex-direction: column; justify-content: space-between; gap: 4px;
                       text-align: left; font: inherit; color: var(--fg); background: var(--card);
                       border: 1px solid var(--line); border-radius: 16px; cursor: pointer; overflow-wrap: anywhere; }
  .media .sound .avg:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  .media .sound .avg small { font-size: 11.5px; color: var(--mut); }
  .media .sound .avg b { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
`;

const dbOf = (hass, id) => {
  const value = parseFloat(hass?.states?.[id]?.state);
  return Number.isFinite(value) ? value : null;
};

export function meterConfig(sound) {
  const config = { type: `custom:${ELEMENT}`, level: sound.level, seconds: 60 };
  if (sound.offset) config.offset = sound.offset;
  if (sound.averages?.leq_1_min) config.leq = sound.averages.leq_1_min;
  return config;
}

export function renderSound(ctx) {
  const sound = ctx.config?.sound ?? {};
  const root = el("div", "sound", `<div class="meter" hidden></div><div class="sec"></div><div class="avgs"></div>`);
  const parts = { ctx, card: null, meter: root.querySelector(".meter"), sec: root.querySelector(".sec") };
  parts.avgs = AVERAGES.filter((key) => sound.averages?.[key]).map((key) => {
    const button = el("button", "avg", "<small></small><b></b>");
    button.type = "button";
    button.dataset.average = key;
    button.addEventListener("click", () => {
      const label = parts.ctx.t(`card.pocket.sound.average.${key}`);
      parts.ctx.openSheet?.({ kind: "trend", entity: sound.averages[key], title: label, digits: 1 });
    });
    return { key, button };
  });
  root.querySelector(".avgs").replaceChildren(...parts.avgs.map((a) => a.button));
  parts.sec.hidden = parts.avgs.length === 0;

  if (sound.level) {
    const defined = customElements.get(ELEMENT) ? Promise.resolve() : customElements.whenDefined(ELEMENT);
    defined.then(() => {
      const card = document.createElement(ELEMENT);
      card.setConfig(meterConfig(sound));
      parts.card = card;
      parts.meter.append(card);
      parts.meter.hidden = false;
      card.hass = parts.ctx.hass;
    });
  }

  const update = (next) => {
    parts.ctx = next;
    if (parts.card && next.hass) parts.card.hass = next.hass;
    setText(parts.sec, next.t("card.pocket.sound.averages"));
    for (const { key, button } of parts.avgs) {
      const label = next.t(`card.pocket.sound.average.${key}`);
      const value = dbOf(next.hass, sound.averages[key]);
      const shown = value == null ? next.t("card.pocket.format.none")
        : next.t("card.pocket.sound.db", { value: number(next, value, 1) });
      setText(button.querySelector("small"), label);
      setText(button.querySelector("b"), shown);
      setAttr(button, "aria-label", `${label}: ${shown}`);
    }
  };
  update(ctx);
  return { el: root, update, parts };
}
