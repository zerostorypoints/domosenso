#!/usr/bin/env python3
"""Pick the Ramka's next photo series: one folder that actually holds JPEGs, drawn at random
with equal chances (folders at any depth, e.g. 2026/07/lake-trip; folders that only contain
other folders, hidden folders and @-folders such as a NAS's @eaDir are skipped), then up to N
different photos from it in random order. The folder shown last time (remembered in
<root>/../.ramka_last_pick, outside the photo tree) is left out when there is more than one, so
events alternate instead of streaking. With an album (a top-level folder of the photo tree, the
settings dashboard's input_select.<prefix>_photo_album), only the folders under it are drawn from;
an album that is gone falls back to every folder and says so on stderr. Prints JSON for the ambient
loop's response_variable:

    {"event": "lake-trip", "folder": "2026/07/lake-trip", "photos": ["2026/07/lake-trip/a.jpg", ...]}

Called by the ramka package's shell_command.<prefix>_pick with the photo_dir input (installed as
/config/shell/ramka_pick.py):

    python3 /config/shell/ramka_pick.py [/config/www/ramka] [5] [<album>]

and with --albums, the albums for the select (the index automation's shell_command.<prefix>_albums):

    python3 /config/shell/ramka_pick.py /config/www/ramka --albums  ->  {"albums": ["2025", "2026"]}
"""
import json
import os
import random
import sys


def leaf_folders(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith("@") and not d.startswith(".")]
        photos = sorted(f for f in filenames if f.lower().endswith((".jpg", ".jpeg")) and not f.startswith("."))
        if photos and dirpath != root:
            out[os.path.relpath(dirpath, root)] = photos
    return out


def albums(folders):
    """The top-level folders that hold photos at some depth, sorted."""
    return sorted({folder.split(os.sep)[0] for folder in folders})


def main(root, count, album=""):
    folders = leaf_folders(root)
    if album:
        if album in albums(folders):
            folders = {f: p for f, p in folders.items() if f.split(os.sep)[0] == album}
        else:
            print(f"album {album} not found, using all", file=sys.stderr)
    if not folders:
        print(json.dumps({"event": "", "folder": "", "photos": []}))
        return
    last_file = os.path.join(os.path.dirname(os.path.abspath(root)), ".ramka_last_pick")
    try:
        with open(last_file, encoding="utf-8") as f:
            last = f.read().strip()
    except OSError:
        last = ""
    candidates = sorted(f for f in folders if f != last) or sorted(folders)
    folder = random.choice(candidates)
    try:
        with open(last_file, "w", encoding="utf-8") as f:
            f.write(folder)
    except OSError:
        pass
    photos = folders[folder][:]
    random.shuffle(photos)
    picked = [f"{folder}/{p}" for p in photos[:count]]
    refresh_index_if_stale(root, picked)
    print(json.dumps({"event": os.path.basename(folder), "folder": folder, "photos": picked}, ensure_ascii=False))


def refresh_index_if_stale(root, picked):
    """A photo that index.json does not know (a folder added since the last rebuild) would show
    without its caption; rebuild the index right away in that case."""
    index_path = os.path.join(root, "index.json")
    try:
        with open(index_path, encoding="utf-8") as f:
            known = {p["path"] for p in json.load(f).get("photos", [])}
    except (OSError, ValueError):
        known = set()
    if all(p in known for p in picked):
        return
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import ramka_index
        ramka_index.main(root)
    except Exception as e:  # the series still plays, only the caption may be missing
        print(f"index refresh failed: {e}", file=sys.stderr)


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "/config/www/ramka"
    if sys.argv[2:3] == ["--albums"]:
        print(json.dumps({"albums": albums(leaf_folders(root))}, ensure_ascii=False))
    else:
        main(root, int(sys.argv[2]) if len(sys.argv) > 2 else 5, sys.argv[3] if len(sys.argv) > 3 else "")
