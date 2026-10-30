// Colour palettes: stops over "excess" (0 = at or below neutral, 1 = at hot), or custom stops
// in source units. Pure maths, no DOM, so the card and the tests share it.

export const PALETTES = {
  zones: [[0, "#03a9f4"], [0.15, "#26a69a"], [0.3, "#66bb6a"], [0.45, "#9ccc65"], [0.58, "#d4e157"],
    [0.7, "#ffca28"], [0.8, "#ffa726"], [0.9, "#ff7043"], [1, "#e53935"]],
  series: [[0, "#03a9f4"], [0.25, "#4fd1b5"], [0.5, "#f5c542"], [0.7, "#ffa94d"], [0.85, "#ff7a5c"],
    [1, "#e53935"]],
  calm: [[0, "#03a9f4"], [0.35, "#8fd3ff"], [0.65, "#f5c542"], [0.85, "#ff7a5c"], [1, "#e53935"]],
};

export function parseColour(css) {
  const s = String(css ?? "").trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(s);
  if (m) return [1, 2, 3].map((i) => Math.min(255, Number(m[i])));
  return null;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function makePalette({ palette, neutral, hot }, neutralRgb) {
  const named = !Array.isArray(palette);
  const raw = named ? PALETTES[palette] ?? PALETTES.zones : palette;
  const stops = raw
    .map(([at, css], i) => [Number(at), (named && i === 0 ? neutralRgb : parseColour(css)) ?? neutralRgb])
    .filter(([at]) => Number.isFinite(at))
    .sort((a, b) => a[0] - b[0]);
  // Named stops sit on excess 0…1; custom ones are looked up by the value itself.
  const excess = (value) => (Number.isFinite(value) ? clamp01((value - neutral) / (hot - neutral)) : 0);

  function colourAt(value) {
    if (!Number.isFinite(value)) return [...stops[0][1]];
    const x = named ? excess(value) : value;
    if (x <= stops[0][0]) return [...stops[0][1]];
    for (let i = 1; i < stops.length; i++) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      if (x <= b) {
        const f = (x - a) / (b - a);
        return ca.map((c, k) => Math.round(c + (cb[k] - c) * f));
      }
    }
    return [...stops[stops.length - 1][1]];
  }

  const css = (value, alpha = 1) => {
    const [r, g, b] = colourAt(value);
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  return { neutral, hot, excess, colourAt, css };
}
