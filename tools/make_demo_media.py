#!/usr/bin/env python3
"""Generate the demo home's stand-in images: abstract ambient photos and album covers.

Usage: uv run tools/make_demo_media.py [--out examples/demo-home/media]

Everything is drawn from gradients and simple shapes with fixed colours, so the output is the same
on every run and belongs to nobody (examples/demo-home/media/SOURCES.md says "generated").
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

REPO = Path(__file__).resolve().parent.parent
PHOTO_SIZE = (1650, 1080)   # 1100x720, the Ramka's screen, at 1.5x
COVER_SIZE = (600, 600)


def gradient(size, top, bottom):
    w, h = size
    column = Image.new("RGB", (1, h))
    for y in range(h):
        k = y / (h - 1)
        column.putpixel((0, y), tuple(round(a + (b - a) * k) for a, b in zip(top, bottom)))
    return column.resize(size)


def glow(size, centre, radius, colour, strength=1.0):
    """A soft disc of `colour` fading out, as a mask-blended layer over black, to add on top."""
    layer = Image.new("L", size, 0)
    ImageDraw.Draw(layer).ellipse(
        [centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius], fill=round(255 * strength)
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius / 2))
    return Image.merge("RGB", [layer.point(lambda v, c=c: v * c // 255) for c in colour])


def hills(size, rows):
    """Layered smooth ridges; rows = [(baseline 0..1, amplitude 0..1, wavelength, phase, colour)]."""
    w, h = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for base, amp, wave, phase, colour in rows:
        points = [(0, h)]
        for x in range(0, w + 8, 8):
            y = h * base + h * amp * (math.sin(x / w * wave * math.tau + phase) + 0.5 * math.sin(x / w * wave * 2.3 * math.tau + phase * 1.7))
            points.append((x, y))
        points.append((w, h))
        draw.polygon(points, fill=colour + (255,))
    return image


def photo(top, bottom, sun, sun_colour, ridges):
    w, h = PHOTO_SIZE
    image = gradient(PHOTO_SIZE, top, bottom)
    image = ImageChops.add(image, glow(PHOTO_SIZE, (round(sun[0] * w), round(sun[1] * h)), round(sun[2] * h), sun_colour))
    image = image.convert("RGBA")
    image.alpha_composite(hills(PHOTO_SIZE, ridges))
    return image.convert("RGB")


PHOTOS = {
    "ambient-dawn.jpg": photo((246, 196, 160), (120, 150, 190), (0.30, 0.52, 0.22), (255, 214, 150),
                              [(0.66, 0.05, 1.2, 0.4, (88, 110, 140)), (0.78, 0.06, 0.9, 2.0, (52, 74, 104)), (0.90, 0.04, 1.6, 4.1, (28, 44, 70))]),
    "ambient-meadow.jpg": photo((150, 200, 235), (230, 240, 220), (0.72, 0.28, 0.12), (255, 250, 200),
                                [(0.62, 0.05, 1.0, 1.0, (140, 184, 120)), (0.76, 0.06, 1.4, 3.3, (96, 150, 92)), (0.90, 0.05, 0.8, 5.0, (58, 108, 70))]),
    "ambient-dusk.jpg": photo((70, 60, 120), (238, 150, 120), (0.55, 0.70, 0.20), (255, 170, 110),
                              [(0.72, 0.05, 1.3, 2.2, (60, 50, 96)), (0.84, 0.05, 1.0, 0.7, (36, 34, 70)), (0.94, 0.03, 1.8, 3.9, (20, 22, 48))]),
    "ambient-sea.jpg": photo((190, 220, 240), (60, 120, 160), (0.20, 0.22, 0.10), (255, 255, 235),
                             [(0.70, 0.02, 2.0, 0.3, (84, 142, 180)), (0.80, 0.02, 2.6, 1.9, (58, 116, 156)), (0.91, 0.03, 1.5, 4.4, (36, 88, 128))]),
    "ambient-night.jpg": photo((14, 20, 46), (46, 66, 110), (0.80, 0.30, 0.07), (210, 220, 255),
                               [(0.74, 0.05, 1.1, 1.4, (26, 38, 72)), (0.86, 0.05, 1.5, 3.1, (16, 26, 54)), (0.95, 0.03, 0.9, 5.6, (8, 14, 34))]),
}


def cover(top, bottom, centre, radius, colour, ring, radii=(0.34, 0.26, 0.18)):
    w, h = COVER_SIZE
    image = gradient(COVER_SIZE, top, bottom)
    image = ImageChops.add(image, glow(COVER_SIZE, (round(centre[0] * w), round(centre[1] * h)), round(radius * w), colour))
    draw = ImageDraw.Draw(image)
    for i, r in enumerate(radii):
        cx, cy = w // 2, h // 2
        box = [cx - r * w, cy - r * w, cx + r * w, cy + r * w]
        draw.ellipse(box, outline=tuple(min(255, c + 20 * i) for c in ring), width=4)
    return image


COVERS = {
    "cover-glass-hours.png": cover((30, 50, 90), (120, 170, 200), (0.5, 0.5), 0.22, (255, 214, 150), (230, 240, 250)),
    "cover-paper-lanterns.png": cover((90, 30, 50), (240, 160, 100), (0.5, 0.5), 0.2, (255, 230, 170), (255, 235, 210), (0.42, 0.30, 0.18, 0.08)),
    "cover-slow-tide.png": cover((20, 70, 80), (150, 210, 190), (0.5, 0.5), 0.24, (230, 255, 240), (225, 245, 240), (0.40, 0.33, 0.26, 0.19, 0.12)),
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=REPO / "examples" / "demo-home" / "media")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, image in PHOTOS.items():
        image.save(args.out / name, quality=84, optimize=True)
    for name, image in COVERS.items():
        image.save(args.out / name, optimize=True)
    print(f"wrote {len(PHOTOS) + len(COVERS)} images to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
