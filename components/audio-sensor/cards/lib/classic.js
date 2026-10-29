// The classic wave: Ramka's now-playing wave, frame for frame (its _waveStart), so a card that falls
// back looks exactly like a strip without the sound sensor. Three sines in one colour, breathing
// slowly; the line follows the strip's height. Not a flavour: it reads no data and has no options.
// lib/classic.test.mjs holds Ramka's loop as the reference and checks Ramka still draws it.

import { WAVES, breathe } from "./geometry.js";

// `t` in seconds of real time; `colour` any CSS colour (the card passes --primary-color).
export function drawClassic(ctx, w, h, t, colour) {
  const mid = h / 2;
  for (const [period, speed, amp, alpha] of WAVES) {
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, h * 0.045);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = alpha;
    for (let x = 0; x <= w; x += 2) {
      const y = mid + Math.sin((x + speed * t) / period * 2 * Math.PI) * amp * h * breathe(t);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
