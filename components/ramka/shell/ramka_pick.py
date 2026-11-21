#!/usr/bin/env python3
"""Pick the Ramka's next photo series from the photo tree's albums, in rotation cycles, so every
album, every event and every photo comes round.

An album is a top-level folder of the photo tree; an event is a folder that actually holds JPEGs, at
any depth (2026/07/lake-trip is event lake-trip in album 2026; a top-level folder with photos is an
album of one event). Folders that only contain other folders, hidden folders and @-folders such as
a NAS's @eaDir are skipped. Each draw:

1. takes an album not yet shown in the current album cycle (random among them); when every album
   has been shown, a new cycle starts, without the album shown last when there are others;
2. inside it, an event not yet shown in that album's event cycle, the same way;
3. inside it, up to N photos not yet shown in that event's photo cycle, in random order; when fewer
   than N are left, the series is topped up from the event's next cycle (never a photo twice in
   one series), so every series has N photos when the event holds that many.

The cycles live in <root>/../.ramka_rotation.json, outside the photo tree. Folders and photos added
since join the running cycle, removed ones drop out. With albums chosen on the settings dashboard's
Photos page, only those are drawn from; an album that is gone is skipped, and with none left every
album is, each said on stderr. Prints JSON for the ambient loop's response_variable:

    {"event": "lake-trip", "folder": "2026/07/lake-trip", "photos": ["2026/07/lake-trip/a.jpg", ...]}

Called by the ramka package's shell_command.<prefix>_pick with the photo_dir input (installed as
/config/shell/ramka_pick.py):

    python3 /config/shell/ramka_pick.py [/config/www/ramka] [5] [<album> ...]

and with --albums, the albums to choose from (the index automation's shell_command.<prefix>_albums):

    python3 /config/shell/ramka_pick.py /config/www/ramka --albums  ->  {"albums": ["2025", "2026"]}
"""
import json
import os
import random
import sys

STATE_NAME = ".ramka_rotation.json"


def leaf_folders(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith("@") and not d.startswith(".")]
        photos = sorted(f for f in filenames if f.lower().endswith((".jpg", ".jpeg")) and not f.startswith("."))
        if photos and dirpath != root:
            out[os.path.relpath(dirpath, root)] = photos
    return out


def album_of(folder):
    return folder.split(os.sep)[0]


def albums(folders):
    """The top-level folders that hold photos at some depth, sorted."""
    return sorted({album_of(folder) for folder in folders})


def load_state(path):
    try:
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError):
        return {}
    return state if isinstance(state, dict) else {}


def save_state(path, state):
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
    except OSError as e:  # the series still plays; the next draw only forgets this one
        print(f"rotation not saved: {e}", file=sys.stderr)


def draw(items, cycle, last):
    """One item from `items` not yet in `cycle` (the ones shown in the running cycle, a list kept in
    place). A finished cycle starts again, leaving out `last` when there is another item."""
    shown = set(cycle)
    left = [i for i in items if i not in shown]
    if not left:
        cycle.clear()
        left = [i for i in items if i != last] or list(items)
    item = random.choice(sorted(left))
    cycle.append(item)
    return item


def series(photos, cycle, count):
    """Up to `count` different photos: first the ones not yet shown in the running cycle, then,
    when those run out, from the next cycle, which they then belong to."""
    shown = set(cycle)
    left = [p for p in photos if p not in shown]
    random.shuffle(left)
    picked = left[:count]
    if len(picked) < count:
        cycle.clear()
        rest = [p for p in photos if p not in set(picked)]
        random.shuffle(rest)
        topped = rest[:count - len(picked)]
        picked += topped
        cycle.extend(topped)
    else:
        cycle.extend(picked)
    return picked


def main(root, count, chosen=()):
    folders = leaf_folders(root)
    chosen = [a for a in chosen if a]
    known = albums(folders)
    valid = [a for a in chosen if a in known]
    for a in chosen:
        if a not in valid:
            print(f"album {a} not found" + ("" if valid else ", using all"), file=sys.stderr)
    if valid:
        folders = {f: p for f, p in folders.items() if album_of(f) in valid}
    if not folders:
        print(json.dumps({"event": "", "folder": "", "photos": []}))
        return
    parent = os.path.dirname(os.path.abspath(root))
    state_path = os.path.join(parent, STATE_NAME)
    state = load_state(state_path)
    all_folders = leaf_folders(root) if valid else folders
    state = {
        "albums": [a for a in state.get("albums", []) if a in known],
        "last_album": state.get("last_album", ""),
        "events": {a: c for a, c in state.get("events", {}).items() if a in known and isinstance(c, list)},
        "last_event": {a: e for a, e in state.get("last_event", {}).items() if a in known},
        "photos": {f: [p for p in c if p in set(all_folders[f])]
                   for f, c in state.get("photos", {}).items() if f in all_folders and isinstance(c, list)},
    }

    album = draw(albums(folders), state["albums"], state["last_album"])
    state["last_album"] = album
    events = sorted(f for f in folders if album_of(f) == album)
    folder = draw(events, state["events"].setdefault(album, []), state["last_event"].get(album, ""))
    state["last_event"][album] = folder
    names = series(folders[folder], state["photos"].setdefault(folder, []), max(count, 0))
    save_state(state_path, state)
    try:  # the picker before rotation cycles (ramka 0.21 and older) remembered only the last folder
        os.remove(os.path.join(parent, ".ramka_last_pick"))
    except OSError:
        pass

    picked = [f"{folder}/{p}" for p in names]
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
        main(root, int(sys.argv[2]) if len(sys.argv) > 2 else 5, sys.argv[3:])
