// Shared wave geometry: the three sines of Ramka's now-playing wave, their breathing, and the
// colour gradient along them.

// period px, speed px/s, amplitude (share of height), opacity
export const WAVES = [[260, 28, 0.34, 0.55], [170, -40, 0.22, 0.35], [110, 55, 0.12, 0.22]];
export const NEUTRAL_AMP = 0.55;
export const MAX_AMP = 0.44;

export const breathe = (t) => 0.75 + 0.25 * Math.sin(t / 3);
// CSS px (the canvas is DPR-scaled). The card's default line, tuned on a wall tablet: a little
// bolder than Ramka's own strip (max(1.5, h * 0.045), 2.8 at its 63 px), so colour reads at a
// distance.
// A flavour gets the configured value as options.lineWidth; tests and `still` may omit it.
export const DEFAULT_LINE_WIDTH = 4;
export const lineWidthOf = (options) => options?.lineWidth ?? DEFAULT_LINE_WIDTH;
// The gain that takes wave amplitude A to MAX_AMP of the height at full excess.
export const capGain = (A) => MAX_AMP / A - NEUTRAL_AMP;

export const at = (arr, u) => {
  const x = Math.max(0, Math.min(1, u)) * (arr.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < arr.length ? arr[i] + (arr[i + 1] - arr[i]) * f : arr[i];
};

export function wavePath(ctx, w, k, t, amp, mid) {
  const [P, V] = WAVES[k];
  const b = breathe(t);
  ctx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const u = x / w;
    const y = mid(u) + Math.sin(((x + V * t) / P) * 2 * Math.PI) * amp(u) * b;
    if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
}

export function hGradient(ctx, w, eFn, alphaFn, palette) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  for (let k = 0; k <= 32; k++) {
    const u = k / 32;
    const e = eFn(u);
    g.addColorStop(u, palette.css(palette.neutral + e * (palette.hot - palette.neutral), alphaFn(e)));
  }
  return g;
}
