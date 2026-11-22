#!/usr/bin/env python3
"""Pick the Ramka's next photo series from the photo tree, taking turns level by level, so every
folder, every event and every photo comes round.

The photo tree is every folder below the root that holds JPEGs at some depth; hidden folders and
@-folders such as a NAS's @eaDir are skipped, and photos directly in the root are not shown. Each
draw walks down from the root:

1. at each folder, its turns are its child folders that hold photos, plus its own photos when it
   holds some (one turn); it takes a turn not yet shown in that folder's running cycle (random
   among those left); when every turn has been shown, a new cycle starts, without the turn shown
   last when there are others;
2. a child folder drawn is walked into the same way; the folder's own photos end the walk: that
   folder is the event;
3. up to N of the event's photos not yet shown in its photo cycle, in random order; when fewer than
   N are left, the series is topped up from the event's next cycle (never a photo twice in one
   series), so every series has N photos when the event holds that many.

So each top-level folder gets the same share of series, each folder inside it the same share of
its parent's, and so on; a flat tree (albums with photos, or albums of event folders) draws as an
album, then an event, then photos.

The cycles live in <root>/../.ramka_rotation.json, outside the photo tree. Folders and photos added
since join the running cycle, removed ones drop out. With albums chosen on the settings dashboard's
Photos page (folder paths, "2025" or "2025/Lisbon"), only folders inside them are drawn from; a
chosen path that is gone is skipped, and with none left every folder is, each said on stderr.
Prints JSON for the ambient loop's response_variable:

    {"event": "Day 1", "folder": "2025/Lisbon/Day 1", "photos": ["2025/Lisbon/Day 1/a.jpg", ...]}

Called by the ramka package's shell_command.<prefix>_pick with the photo_dir input (installed as
/config/shell/ramka_pick.py):

    python3 /config/shell/ramka_pick.py [/config/www/ramka] [5] [<album path> ...]

and with --albums, every folder that holds photos at some depth, the albums to choose from (the
index automation's shell_command.<prefix>_albums):

    python3 /config/shell/ramka_pick.py /config/www/ramka --albums  ->  {"albums": ["2025", "2025/Lisbon", ...]}
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


OWN = "."  # the turn of a folder's own photos, next to its child folders


def nodes(folders):
    """Every folder that holds photos at some depth: the folders with photos and their parents."""
    out = set()
    for folder in folders:
        parts = folder.split(os.sep)
        out.update(os.sep.join(parts[:i]) for i in range(1, len(parts) + 1))
    return out


def albums(folders):
    """The folders to choose from: every one that holds photos at some depth, as '/' paths, sorted."""
    return sorted(n.replace(os.sep, "/") for n in nodes(folders))


def in_branch(folder, chosen):
    return any(folder == c or folder.startswith(c + os.sep) for c in chosen)


def turns(node, children, folders):
    """A folder's turns: its child folders with photos, and its own photos ('.') when it has some."""
    return sorted(children.get(node, ())) + ([OWN] if node in folders else [])


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


def fresh_state(state, children, folders, all_folders):
    """The saved cycles kept for the folders and turns that still exist; a file from before the
    level-by-level draw (albums and events) keeps its top-level cycle."""
    if "cycles" not in state and "albums" in state:
        state = {"cycles": {"": state.get("albums", [])}, "last": {"": state.get("last_album", "")},
                 "photos": state.get("photos", {})}
    cycles, last = state.get("cycles", {}), state.get("last", {})
    known = {"", *children, *folders}
    return {
        "cycles": {n: [t for t in c if t in turns(n, children, folders)]
                   for n, c in cycles.items() if n in known and isinstance(c, list)},
        "last": {n: t for n, t in last.items() if n in known and isinstance(t, str)},
        "photos": {f: [p for p in c if p in set(all_folders[f])]
                   for f, c in state.get("photos", {}).items() if f in all_folders and isinstance(c, list)},
    }


def main(root, count, chosen=()):
    folders = leaf_folders(root)
    all_folders = folders
    chosen = [os.path.normpath(a.replace("/", os.sep)) for a in chosen if a]
    known = nodes(folders)
    valid = [a for a in chosen if a in known]
    for a in chosen:
        if a not in valid:
            print(f"album {a.replace(os.sep, '/')} not found" + ("" if valid else ", using all"), file=sys.stderr)
    if valid:
        folders = {f: p for f, p in folders.items() if in_branch(f, valid)}
    if not folders:
        print(json.dumps({"event": "", "folder": "", "photos": []}))
        return
    children = {}
    for n in nodes(folders):
        children.setdefault(os.path.dirname(n), set()).add(n)
    parent = os.path.dirname(os.path.abspath(root))
    state_path = os.path.join(parent, STATE_NAME)
    every = nodes(all_folders)
    every_children = {}
    for n in every:
        every_children.setdefault(os.path.dirname(n), set()).add(n)
    state = fresh_state(load_state(state_path), every_children, all_folders, all_folders)

    node = ""
    while True:
        turn = draw(turns(node, children, folders), state["cycles"].setdefault(node, []), state["last"].get(node, ""))
        state["last"][node] = turn
        if turn == OWN:
            break
        node = turn
    folder = node
    names = series(folders[folder], state["photos"].setdefault(folder, []), max(count, 0))
    save_state(state_path, state)
    try:  # the picker before rotation cycles (ramka 0.21 and older) remembered only the last folder
        os.remove(os.path.join(parent, ".ramka_last_pick"))
    except OSError:
        pass

    rel = folder.replace(os.sep, "/")
    picked = [f"{rel}/{p}" for p in names]
    refresh_index_if_stale(root, picked)
    print(json.dumps({"event": os.path.basename(folder), "folder": rel, "photos": picked}, ensure_ascii=False))


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
