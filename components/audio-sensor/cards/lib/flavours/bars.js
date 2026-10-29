// Bars (the input monitor): a rounded bar per value, coloured by the palette.
//   spectrum  one bar per band from frame.showFrom to frame.showTo, at the values as received
//             (`raw`; off: the smoothed ones), the smoothed values as a line over them (`line`),
//             the afterglow peaks as ticks (`peaks`)
//   scalar    recent readings (the engine's history, source units), newest at the right; the line
//             joins the bar tops. `raw` and `peaks` mean nothing for one value and are ignored.

const PAD = 6;

function layout(ctx, h, palette) {
  // For neutral 60 / hot 100 a 20..110 dB window: one hot-to-neutral span
  // below neutral and a quarter above hot.
  const span = palette.hot - palette.neutral;
  const lo = palette.neutral - span;
  const hi = palette.hot + span / 4;
  const y = (v) => h - PAD - Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (h - 2 * PAD);
  return { y, base: h - PAD };
}

function grid(ctx, w, palette, y) {
  const span = palette.hot - palette.neutral;
  ctx.strokeStyle = "rgba(128, 128, 128, 0.18)";
  ctx.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const gy = y(palette.neutral + f * span);
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  }
}

function bar(ctx, x, y, bw, base, fill) {
  const bh = base - y;
  if (!(bh > 0)) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, Math.min(3, bw / 2, bh));
  else ctx.rect(x, y, bw, bh);
  ctx.fill();
}

function line(ctx, pts, colour) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function spectrumBars(ctx, w, h, frame, o) {
  const { palette, raw, smooth, peak } = frame;
  const from = frame.showFrom ?? 0;
  const to = frame.showTo ?? raw.length - 1;
  const n = to - from + 1;
  const bw = w / n;
  const { y, base } = layout(ctx, h, palette);
  grid(ctx, w, palette, y);
  const src = o.raw ? raw : smooth;
  const tops = [];
  for (let i = from; i <= to; i++) {
    const v = src[i];
    const x = (i - from) * bw;
    if (Number.isFinite(v)) bar(ctx, x + 1.5, y(v), Math.max(1, bw - 3), base, palette.css(v, 0.55));
    tops.push([x + bw / 2, y(smooth[i])]);
  }
  if (o.peaks) {
    ctx.lineWidth = 2;
    for (let i = from; i <= to; i++) {
      const py = y(peak[i]);
      ctx.strokeStyle = palette.css(peak[i], 0.8);
      ctx.beginPath(); ctx.moveTo((i - from) * bw + 1.5, py); ctx.lineTo((i - from + 1) * bw - 1.5, py); ctx.stroke();
    }
  }
  if (o.line) line(ctx, tops, "rgba(120, 120, 125, 0.85)");
}

function scalarBars(ctx, w, h, frame, o) {
  const { palette, historyValues: hv } = frame;
  const len = hv.length;
  // About 8 px per bar, however many samples the history holds; the newest is always the last bar.
  const n = Math.max(2, Math.min(len, Math.floor(w / 8)));
  const bw = w / n;
  const { y, base } = layout(ctx, h, palette);
  grid(ctx, w, palette, y);
  const tops = [];
  for (let j = 0; j < n; j++) {
    const v = hv[len - 1 - Math.round(((n - 1 - j) * (len - 1)) / (n - 1))];
    const x = j * bw;
    if (Number.isFinite(v)) {
      bar(ctx, x + 1, y(v), Math.max(1, bw - 2), base, palette.css(v, 0.55));
      tops.push([x + bw / 2, y(v)]);
    }
  }
  if (o.line && tops.length > 1) line(ctx, tops, "rgba(120, 120, 125, 0.85)");
}

export default {
  id: "bars",
  kinds: ["spectrum", "scalar"],
  defaults: { raw: true, line: true, peaks: false },
  draw(ctx, w, h, t, frame, options) {
    const o = { ...this.defaults, ...options };
    ctx.lineCap = "round";
    if (frame.kind === "spectrum") spectrumBars(ctx, w, h, frame, o);
    else scalarBars(ctx, w, h, frame, o);
  },
};
