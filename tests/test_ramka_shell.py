"""The ramka component's shell scripts (installed as /config/shell/): photo picker and caption index."""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

SHELL = Path(__file__).resolve().parent.parent / "components" / "ramka" / "shell"


def photo(path, size=(40, 30)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, "teal").save(path, "JPEG")


def run(script, *args):
    result = subprocess.run([sys.executable, str(SHELL / script), *map(str, args)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result


def test_index_lists_photos_with_event_and_size(tmp_path):
    root = tmp_path / "www" / "ramka"
    photo(root / "2026" / "07" / "lake-trip" / "a.jpg")
    photo(root / "2026" / "07" / "lake-trip" / "@eaDir" / "thumb.jpg")
    photo(root / "garden" / "b.JPG", (30, 40))
    (root / "garden" / "notes.txt").write_text("x")
    run("ramka_index.py", root)
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    assert index["count"] == 2
    by_path = {p["path"]: p for p in index["photos"]}
    assert set(by_path) == {"2026/07/lake-trip/a.jpg", "garden/b.JPG"}
    assert by_path["2026/07/lake-trip/a.jpg"]["event"] == "lake-trip"
    assert (by_path["garden/b.JPG"]["width"], by_path["garden/b.JPG"]["height"]) == (30, 40)


def test_pick_alternates_folders_and_refreshes_a_stale_index(tmp_path):
    root = tmp_path / "www" / "ramka"
    for n in range(3):
        photo(root / "lake-trip" / f"{n}.jpg")
        photo(root / "garden" / f"{n}.jpg")
    first = json.loads(run("ramka_pick.py", root, 2).stdout)
    assert first["folder"] in {"lake-trip", "garden"} and len(first["photos"]) == 2
    assert len(set(first["photos"])) == 2 and all(p.startswith(first["folder"] + "/") for p in first["photos"])
    assert (root / "index.json").is_file()  # built because no index knew the photos
    second = json.loads(run("ramka_pick.py", root, 2).stdout)
    assert second["folder"] != first["folder"]
    assert (tmp_path / "www" / ".ramka_last_pick").read_text() == second["folder"]


def test_pick_without_photos(tmp_path):
    (tmp_path / "ramka").mkdir()
    assert json.loads(run("ramka_pick.py", tmp_path / "ramka").stdout) == {"event": "", "folder": "", "photos": []}
