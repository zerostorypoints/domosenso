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
    rotation = json.loads((tmp_path / "www" / ".ramka_rotation.json").read_text(encoding="utf-8"))
    assert rotation["last"][""] == second["folder"]


def test_pick_shows_every_album_once_per_cycle(tmp_path):
    root = tmp_path / "www" / "ramka"
    names = [f"album {n}" for n in range(7)]
    for name in names:
        photo(root / name / "a.jpg")
    (tmp_path / "www" / ".ramka_last_pick").write_text("album 0")
    picks = [json.loads(run("ramka_pick.py", root, 1).stdout)["folder"] for _ in range(21)]
    for cycle in range(3):
        assert sorted(picks[cycle * 7:cycle * 7 + 7]) == names
    assert all(a != b for a, b in zip(picks, picks[1:]))  # no album twice in a row, across cycles too
    assert not (tmp_path / "www" / ".ramka_last_pick").exists()


def test_pick_weighs_albums_not_events(tmp_path):
    root = tmp_path / "www" / "ramka"
    for n in range(6):
        photo(root / "2026" / f"0{n}" / "a.jpg")
    photo(root / "garden" / "a.jpg")
    picks = [json.loads(run("ramka_pick.py", root, 1).stdout)["folder"] for _ in range(12)]
    assert picks.count("garden") == 6  # every other series, though 2026 holds six events
    assert sorted(p for p in picks if p != "garden") == [f"2026/0{n}" for n in range(6)]


def test_pick_shows_every_photo_of_an_album_with_the_count_kept(tmp_path):
    root = tmp_path / "www" / "ramka"
    for n in range(7):
        photo(root / "fale" / f"{n}.jpg")
    series = [json.loads(run("ramka_pick.py", root, 3).stdout)["photos"] for _ in range(4)]
    assert all(len(s) == len(set(s)) == 3 for s in series)
    first_cycle = series[0] + series[1] + series[2][:1]  # 7 photos: 3 + 3 + 1, then the next cycle
    assert sorted(first_cycle) == [f"fale/{n}.jpg" for n in range(7)]
    second_cycle = series[2][1:] + series[3]
    assert len(set(second_cycle)) == 5
    photo(root / "fale" / "new.jpg")  # a photo added mid-cycle comes in that cycle
    rest = [p for _ in range(2) for p in json.loads(run("ramka_pick.py", root, 3).stdout)["photos"]]
    assert "fale/new.jpg" in rest[:3]


def test_pick_without_photos(tmp_path):
    (tmp_path / "ramka").mkdir()
    assert json.loads(run("ramka_pick.py", tmp_path / "ramka").stdout) == {"event": "", "folder": "", "photos": []}


def test_pick_from_an_album(tmp_path):
    """With an album (a top-level folder), every photo comes from under it, at any depth."""
    root = tmp_path / "www" / "ramka"
    for n in range(3):
        photo(root / "2026" / "07" / "lake-trip" / f"{n}.jpg")
        photo(root / "2026" / "08" / "garden" / f"{n}.jpg")
        photo(root / "2025" / "beach" / f"{n}.jpg")
    for _ in range(4):
        picked = json.loads(run("ramka_pick.py", root, 3, "2026").stdout)
        assert picked["folder"].startswith("2026/") and len(picked["photos"]) == 3
        assert all(p.startswith("2026/") for p in picked["photos"])
    # An empty album argument is every folder, as without one.
    assert json.loads(run("ramka_pick.py", root, 1, "").stdout)["photos"]


def test_pick_from_several_albums(tmp_path):
    """Several albums: a folder is drawn from any of them, never from one not chosen."""
    root = tmp_path / "www" / "ramka"
    for name in ("2024 Kreta", "2025 Tallin", "2026 Bern"):
        photo(root / name / "a.jpg")
    seen = {json.loads(run("ramka_pick.py", root, 1, "2024 Kreta", "2026 Bern").stdout)["folder"] for _ in range(8)}
    assert seen == {"2024 Kreta", "2026 Bern"}
    # One of them gone: the rest; all of them gone: every folder.
    result = run("ramka_pick.py", root, 1, "2024 Kreta", "1999")
    assert json.loads(result.stdout)["folder"] == "2024 Kreta" and "album 1999 not found" in result.stderr
    result = run("ramka_pick.py", root, 1, "1999", "1998")
    assert json.loads(result.stdout)["photos"] and "using all" in result.stderr


def test_pick_from_a_missing_album_uses_all(tmp_path):
    root = tmp_path / "www" / "ramka"
    photo(root / "garden" / "a.jpg")
    result = run("ramka_pick.py", root, 5, "2026")
    assert json.loads(result.stdout)["photos"] == ["garden/a.jpg"]
    assert "album 2026 not found, using all" in result.stderr
    # A path out of the photo tree is not an album either.
    result = run("ramka_pick.py", root, 5, "../ramka")
    assert json.loads(result.stdout)["photos"] == ["garden/a.jpg"]
    assert "album ../ramka not found, using all" in result.stderr


def test_albums_lists_every_folder_with_photos_at_some_depth(tmp_path):
    root = tmp_path / "www" / "ramka"
    photo(root / "2026" / "07" / "lake-trip" / "a.jpg")
    photo(root / "Wakacje nad morzem" / "b.jpg")
    photo(root / "@eaDir" / "c.jpg")
    photo(root / ".hidden" / "d.jpg")
    (root / "empty" / "sub").mkdir(parents=True)
    photo(root / "loose.jpg")
    assert json.loads(run("ramka_pick.py", root, "--albums").stdout) == {
        "albums": ["2026", "2026/07", "2026/07/lake-trip", "Wakacje nad morzem"]}
    (tmp_path / "none").mkdir()
    assert json.loads(run("ramka_pick.py", tmp_path / "none", "--albums").stdout) == {"albums": []}


def _tree(root):
    for day in ("Day 1", "Day 2"):
        photo(root / "2025" / "Lisbon" / day / "a.jpg")
    photo(root / "2025" / "Porto" / "a.jpg")
    photo(root / "2026" / "Bern" / "a.jpg")


def test_pick_takes_turns_level_by_level(tmp_path):
    root = tmp_path / "www" / "ramka"
    _tree(root)
    picks = [json.loads(run("ramka_pick.py", root, 1).stdout)["folder"] for _ in range(12)]
    assert picks.count("2026/Bern") == 6  # the two years share the series
    assert picks.count("2025/Porto") == 3  # the two trips share 2025's
    lisbon = [p for p in picks if "Lisbon" in p]
    assert len(lisbon) == 3 and set(lisbon) == {"2025/Lisbon/Day 1", "2025/Lisbon/Day 2"}
    assert all(a != b for a, b in zip(lisbon, lisbon[1:]))  # the days take turns within the trip


def test_own_photos_are_one_more_turn(tmp_path):
    root = tmp_path / "www" / "ramka"
    photo(root / "A" / "a.jpg")
    photo(root / "A" / "B" / "b.jpg")
    picks = [json.loads(run("ramka_pick.py", root, 1).stdout)["folder"] for _ in range(4)]
    assert sorted(picks) == ["A", "A", "A/B", "A/B"] and all(a != b for a, b in zip(picks, picks[1:]))


def test_pick_from_a_branch_at_depth_two(tmp_path):
    root = tmp_path / "www" / "ramka"
    _tree(root)
    picks = {json.loads(run("ramka_pick.py", root, 1, "2025/Lisbon").stdout)["folder"] for _ in range(6)}
    assert picks == {"2025/Lisbon/Day 1", "2025/Lisbon/Day 2"}
    picks = {json.loads(run("ramka_pick.py", root, 1, "2025/Lisbon/Day 2", "2026").stdout)["folder"] for _ in range(6)}
    assert picks == {"2025/Lisbon/Day 2", "2026/Bern"}


def test_an_old_rotation_file_is_read(tmp_path):
    root = tmp_path / "www" / "ramka"
    _tree(root)
    (tmp_path / "www" / ".ramka_rotation.json").write_text(json.dumps({
        "albums": ["2025"], "last_album": "2025", "events": {"2025": ["2025/Porto"]},
        "last_event": {"2025": "2025/Porto"}, "photos": {"2025/Porto": ["a.jpg"]}}))
    assert json.loads(run("ramka_pick.py", root, 1).stdout)["folder"] == "2026/Bern"  # 2025 had its turn
    rotation = json.loads((tmp_path / "www" / ".ramka_rotation.json").read_text(encoding="utf-8"))
    assert set(rotation) == {"cycles", "last", "photos"} and rotation["photos"]["2025/Porto"] == ["a.jpg"]
