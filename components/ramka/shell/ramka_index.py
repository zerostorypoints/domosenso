#!/usr/bin/env python3
"""Index the Ramka's photo folder: one JSON entry per photo with its event (the subfolder's
name), the date the picture was taken (EXIF DateTimeOriginal, else the file's mtime) and, when
the EXIF has them, the camera, lens, focal length, aperture, exposure and ISO. Written to
<folder>/index.json for cards/photo-frame-card.js, which shows them on the frame.

Runs inside the Home Assistant container (Pillow is there), called by the ramka package's
shell_command.<prefix>_index with the photo_dir input (installed as /config/shell/ramka_index.py):
    python3 /config/shell/ramka_index.py [/config/www/ramka]

Layout: folders at any depth (2026/07/lake-trip/...); the event is the name of the folder the
photo sits in. Hidden folders and @-folders (a NAS's @eaDir thumbnails) are skipped, and so is
anything that Pillow cannot open.
"""
import json
import os
import sys
from datetime import datetime

from PIL import Image

EXIF_DATE_TIME_ORIGINAL = 36867
EXIF_DATE_TIME = 306
EXIF_IFD = 0x8769
EXIF_MAKE, EXIF_MODEL = 271, 272
EXIF_LENS_MODEL, EXIF_FOCAL, EXIF_FOCAL_35 = 0xA434, 0x920A, 0xA405
EXIF_FNUMBER, EXIF_EXPOSURE, EXIF_ISO = 0x829D, 0x829A, 0x8827


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def camera_info(exif):
    """Camera, lens and exposure from the EXIF, as display strings; empty when absent."""
    ifd = exif.get_ifd(EXIF_IFD)
    make = str(exif.get(EXIF_MAKE) or "").strip()
    model = str(exif.get(EXIF_MODEL) or "").strip()
    if make and model.lower().startswith(make.lower()):
        model = model[len(make):].strip()
    camera = " ".join(x for x in (make.title() if make.isupper() else make, model) if x)
    lens = str(ifd.get(EXIF_LENS_MODEL) or "").strip()
    focal = _num(ifd.get(EXIF_FOCAL))
    focal35 = _num(ifd.get(EXIF_FOCAL_35))
    fnumber = _num(ifd.get(EXIF_FNUMBER))
    exposure = _num(ifd.get(EXIF_EXPOSURE))
    iso = ifd.get(EXIF_ISO)
    out = {}
    if camera:
        out["camera"] = camera
    if lens:
        out["lens"] = lens
    if focal:
        out["focal"] = f"{focal:g} mm" + (f" ({focal35:g} mm eq.)" if focal35 and abs(focal35 - focal) > 1 else "")
    if fnumber:
        out["aperture"] = f"f/{fnumber:g}"
    if exposure:
        out["exposure"] = f"1/{round(1 / exposure)} s" if exposure < 1 else f"{exposure:g} s"
    if iso:
        out["iso"] = f"ISO {int(iso) if not isinstance(iso, tuple) else iso[0]}"
    return out


def taken(path):
    """(date iso, (w, h), camera info) or (None, None, None) for a file Pillow cannot open."""
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            raw = exif.get(EXIF_DATE_TIME_ORIGINAL) or exif.get_ifd(EXIF_IFD).get(EXIF_DATE_TIME_ORIGINAL) or exif.get(EXIF_DATE_TIME)
            size = im.size
            info = camera_info(exif)
    except Exception:
        return None, None, None
    when = None
    if raw:
        try:
            when = datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S").isoformat()
        except ValueError:
            pass
    return when or datetime.fromtimestamp(os.path.getmtime(path)).isoformat(), size, info


def main(folder):
    photos = []
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("@") and not d.startswith("."))
        if dirpath == folder:
            continue
        rel = os.path.relpath(dirpath, folder)
        for name in sorted(filenames):
            if not name.lower().endswith((".jpg", ".jpeg")) or name.startswith("."):
                continue
            when, size, info = taken(os.path.join(dirpath, name))
            if when is None:
                continue
            photos.append({"path": f"{rel}/{name}", "event": os.path.basename(rel), "folder": rel,
                           "date": when, "width": size[0], "height": size[1], **info})
    index = {"generated": datetime.now().isoformat(timespec="seconds"), "count": len(photos), "photos": photos}
    tmp = os.path.join(folder, "index.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(folder, "index.json"))
    # stderr: ramka_pick.py calls this and its stdout must stay pure JSON for the ambient loop.
    print(f"{len(photos)} photos in {len({p['event'] for p in photos})} events", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/config/www/ramka")
