// A 2D-context stand-in that records what a card draws, so tests assert on geometry and colour
// rather than pixels. Unknown-but-harmless canvas calls are accepted and ignored.
// Recorded geometry methods and where each one leaves the pen (arc/ellipse: the centre).
const END_POINT = {
  moveTo: (a) => [a[0], a[1]],
  lineTo: (a) => [a[0], a[1]],
  arc: (a) => [a[0], a[1]],
  ellipse: (a) => [a[0], a[1]],
  rect: (a) => [a[0], a[1]],
  fillRect: (a) => [a[0], a[1]],
  roundRect: (a) => [a[0], a[1]],
  quadraticCurveTo: (a) => [a[2], a[3]],
  bezierCurveTo: (a) => [a[4], a[5]],
  arcTo: (a) => [a[2], a[3]],
};

function gradient(ctx, kind, args) {
  const g = { kind, args, stops: [], addColorStop(offset, colour) { g.stops.push({ offset, colour }); } };
  ctx.gradients.push(g);
  return g;
}

export function recordingContext(w, h) {
  const ctx = {
    canvas: { width: w, height: h },
    calls: [],
    gradients: [],
    strokes: [], // lineWidth at each stroke()
    strokeStyles: [],
    fillStyles: [],
    lineWidth: 1, lineCap: "butt", lineJoin: "miter", globalAlpha: 1,
    font: "10px sans-serif", textAlign: "start",
    lineDash: [],
    createLinearGradient: (...args) => gradient(ctx, "linear", args),
    createRadialGradient: (...args) => gradient(ctx, "radial", args),
    setLineDash(d) { ctx.lineDash = [...d]; },
    getLineDash: () => [...ctx.lineDash],
    createPattern: () => ({}),
    measureText: (text) => ({ width: String(text).length * 6 }),
  };
  for (const name of Object.keys(END_POINT)) {
    ctx[name] = (...args) => { ctx.calls.push({ name, args }); };
  }
  ctx.stroke = () => { ctx.strokes.push({ lineWidth: ctx.lineWidth, dash: [...ctx.lineDash] }); };
  for (const name of ["beginPath", "fill", "closePath", "setTransform", "clearRect",
    "save", "restore", "fillText", "translate", "scale", "rotate", "transform",
    "resetTransform", "clip", "strokeRect", "strokeText", "drawImage"]) {
    ctx[name] = () => {};
  }
  for (const [prop, log] of [["strokeStyle", ctx.strokeStyles], ["fillStyle", ctx.fillStyles]]) {
    let value = "#000";
    Object.defineProperty(ctx, prop, {
      get: () => value,
      set: (v) => { value = v; log.push(v); },
      enumerable: true,
    });
  }
  return ctx;
}

// Every recorded geometry call, as [name, x, y] using the point the method ends at.
export const points = (ctx) =>
  ctx.calls.map(({ name, args }) => [name, ...END_POINT[name](args)]);
