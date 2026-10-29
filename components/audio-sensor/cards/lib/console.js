// Console: the session-only control strip under the canvas (`controls: true`). An input monitor (bars as
// received, the smoothed line, the overall level as text) and native controls for flavour, palette,
// demo, scenario, rise, fall, line width, neutral, hot and tilt. Each starts from the resolved value; a change
// goes to `onChange(patch)` and nowhere else: the card keeps the patch for this card instance and
// merges it over its resolved options. Nothing here talks to Home Assistant.

import { FLAVOURS, flavoursFor } from "./flavours/index.js";
import { SCENARIOS, NAMED_PALETTES, LINE_WIDTH_RANGE } from "./config.js";

const STYLE = `
  .console { display: grid; gap: 12px; padding: 12px; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    color: var(--primary-text-color); font-size: 14px; }
  .monitor { min-width: 0; display: grid; gap: 6px; align-content: start; }
  .monitor canvas { width: 100%; height: 92px; display: block; border-radius: 8px;
    background: var(--secondary-background-color, rgba(128, 128, 128, 0.12)); }
  .readout { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 12px; color: var(--secondary-text-color); }
  .readout b { color: var(--primary-text-color); font-weight: 500; font-variant-numeric: tabular-nums; }
  .fields { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; align-content: start; }
  .field { display: grid; gap: 3px; min-width: 0; }
  .field label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color);
    display: flex; justify-content: space-between; gap: 8px; }
  .field output { letter-spacing: 0; text-transform: none; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .console select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
    border: 1px solid var(--divider-color); border-radius: 8px; padding: 6px 8px; min-width: 0; }
  .console input[type=range] { width: 100%; margin: 0; accent-color: var(--primary-color); }
  .console input[type=checkbox] { accent-color: var(--primary-color); margin: 0 6px 0 0; }
  .field.check { align-content: end; }
  .field.check label { text-transform: none; letter-spacing: 0; font-size: 14px; color: var(--primary-text-color);
    justify-content: flex-start; align-items: center; }
  .console :focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  @media (max-width: 560px) { .console { grid-template-columns: minmax(0, 1fr); } }
`;

const fmt = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : "–");

export function mountConsole(root, { resolved, kind, onChange, t }) {
  const doc = root.ownerDocument ?? document;
  const host = root.querySelector(".controls") ?? root;
  const el = (tag, props = {}, ...children) => {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  };

  const box = el("div", { class: "console" });
  const style = el("style");
  style.textContent = STYLE;
  const canvas = el("canvas", { role: "img", "aria-label": t("card.ambient_wave.console.monitor") });
  const level = el("b", { id: "aw-level" }, "–");
  const smoothed = el("b", { id: "aw-smoothed" }, "–");
  const unitText = el("span");
  const readout = el("div", { class: "readout" },
    el("span", {}, `${t("card.ambient_wave.console.level")} `, level, unitText),
    el("span", {}, `${t("card.ambient_wave.console.smoothed")} `, smoothed, unitText.cloneNode(true)),
    el("span", {}, t("card.ambient_wave.console.monitor_hint")));
  const fields = el("div", { class: "fields" });
  box.append(style, el("div", { class: "monitor" }, canvas, readout), fields);

  // `emit` takes the path and value; the patch keeps the nested shape of the options.
  const emit = (path, value) => {
    const patch = {};
    path.split(".").reduce((o, k, i, a) => (o[k] = i === a.length - 1 ? value : {}), patch);
    onChange(patch);
  };
  const listen = (input, handler) => {
    // `input` while dragging or typing, `change` for the rest; the handlers are idempotent.
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  };
  const field = (id, label, input, extra = {}) => {
    const wrap = el("div", { class: `field${extra.check ? " check" : ""}` });
    const lab = el("label", { for: id }, extra.check ? input : label);
    if (extra.check) lab.append(label);
    else if (extra.output) lab.append(extra.output);
    wrap.append(...(extra.check ? [lab] : [lab, input]));
    fields.append(wrap);
  };

  const select = (id, label, values, current, group, path) => {
    const input = el("select", { id });
    for (const v of values) input.append(el("option", { value: v }, t(`card.ambient_wave.${group}.${v}`)));
    input.value = current;
    listen(input, () => emit(path, input.value));
    field(id, label, input);
  };

  const range = (id, label, { min, max, step, value, unit = "", path, digits = 0, onValue }) => {
    // The bounds always include the starting value: a bound entity may hold anything.
    const lo = Math.min(min, value);
    const hi = Math.max(max, value);
    const input = el("input", { id, type: "range", min: String(lo), max: String(hi), step: String(step) });
    input.value = String(value);
    const out = el("output", { for: id }, `${fmt(value, digits)}${unit}`);
    listen(input, () => {
      const v = Number(input.value);
      out.textContent = `${fmt(v, digits)}${unit}`;
      onValue?.(v);
      emit(path, v);
    });
    field(id, label, input, { output: out });
    return input;
  };

  const l = (name) => t(`card.ambient_wave.console.${name}`);
  select("aw-flavour", l("flavour"), flavoursFor(kind), resolved.flavour, "flavour", "flavour");
  select("aw-palette", l("palette"), NAMED_PALETTES, resolved.colour.palette, "palette", "colour.palette");

  const demo = el("input", { id: "aw-demo", type: "checkbox" });
  demo.checked = resolved.source.demo === true;
  listen(demo, () => emit("source.demo", demo.checked));
  field("aw-demo", l("demo"), demo, { check: true });

  select("aw-scenario", l("scenario"), SCENARIOS, resolved.source.scenario, "scenario", "source.scenario");

  range("aw-rise", l("rise"), { min: 0, max: 2000, step: 10, value: resolved.dynamics.rise, unit: " ms", path: "dynamics.rise" });
  range("aw-fall", l("fall"), { min: 0, max: 30, step: 0.1, value: resolved.dynamics.fall, unit: " s", path: "dynamics.fall", digits: 1 });

  range("aw-line-width", l("line_width"), { min: LINE_WIDTH_RANGE[0], max: LINE_WIDTH_RANGE[1], step: 0.1, value: resolved.style.line_width, unit: " px", path: "style.line_width", digits: 1 });

  // dB for sound; any other unit gets a window around the author's own neutral and hot.
  const { neutral, hot } = resolved.colour;
  const span = hot - neutral;
  const bounds = kind === "spectrum" ? [0, 130] : [neutral - 2 * span, hot + 2 * span];
  const step = span >= 20 ? 1 : 0.1;
  const digits = step < 1 ? 1 : 0;
  // Hot stays above neutral, as the config validation demands.
  let neutralInput;
  let hotInput;
  const keepOrder = () => {
    neutralInput.max = String(Number(hotInput.value) - step);
    hotInput.min = String(Number(neutralInput.value) + step);
  };
  neutralInput = range("aw-neutral", l("neutral"), { min: bounds[0], max: bounds[1], step, value: neutral, path: "colour.neutral", digits, onValue: keepOrder });
  hotInput = range("aw-hot", l("hot"), { min: bounds[0], max: bounds[1], step, value: hot, path: "colour.hot", digits, onValue: keepOrder });
  keepOrder();

  if (kind === "spectrum") {
    const tilt = el("input", { id: "aw-tilt", type: "checkbox" });
    tilt.checked = resolved.dynamics.tilt === true;
    listen(tilt, () => emit("dynamics.tilt", tilt.checked));
    field("aw-tilt", l("tilt"), tilt, { check: true });
  }

  host.append(box);

  let dims = "";
  return {
    update(frame, unit = "") {
      level.textContent = fmt(frame.value);
      smoothed.textContent = fmt(frame.smoothValue);
      for (const node of readout.querySelectorAll("span > span")) node.textContent = unit ? ` ${unit}` : "";
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      if (!w || !h || !frame.palette) return;
      if (dims !== `${w}x${h}x${dpr}`) {
        dims = `${w}x${h}x${dpr}`;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const bars = FLAVOURS.bars;
      bars.draw(ctx, w, h, 0, frame, { ...bars.defaults, raw: true, line: true, peaks: false });
    },
    destroy() { box.remove(); },
  };
}
