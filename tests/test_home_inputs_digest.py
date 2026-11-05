"""The home-inputs digest per consumer (decision record of #219, H1): the lock records, for each
component that uses the home inputs, the digest of the inputs it was rendered from; `status` names a
consumer rendered from older inputs and `deploy` refuses it until it is rendered again."""
from pathlib import Path

import pytest
import yaml

from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.home_inputs import digest, stale_consumers
from domosenso_cli.lock import Lock
from test_cli_home_cmds import deploy_plan, git, run, write_files

HA = "home-assistant"

ROOMS = {"rooms": [{"id": "living_room", "name": "Living room"}, {"id": "office", "name": "Office"}]}

MANIFEST = """\
id: {cid}
version: 1.0.0
{uses}
artifacts:
  templates: [templates/package.yaml.j2]
inputs:
  prefix: {{type: slug, example: demo}}
"""


def _component(repo: Path, cid: str, uses: str, template: str) -> None:
    write_files(repo / "components" / cid, {
        "component.yaml": MANIFEST.format(cid=cid, uses=uses),
        "templates/package.yaml.j2": template,
        "translations/en.json": "{}", "translations/de.json": "{}", "translations/pl.json": "{}",
    })


@pytest.fixture
def catalog(tmp_path):
    repo = tmp_path / "catalog"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    _component(repo, "rooms-panel", "uses_home: true",
               "rooms:[% for r in home.rooms %] [[ r.id ]][% endfor %]\n")
    _component(repo, "plain", "", "plain: [[ inputs.prefix ]]\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "two components")
    for cid in ("rooms-panel", "plain"):
        git(repo, "tag", "-a", f"{cid}/1.0.0", "-m", f"{cid}/1.0.0")
    return repo


@pytest.fixture
def home(tmp_path, catalog, capsys):
    root = tmp_path / "home"
    code, out = run(root, "init", "--catalog", str(catalog), capsys=capsys)
    assert code == 0, out
    write_files(root, {"domosenso/home.inputs.yaml": yaml.safe_dump(ROOMS)})
    path = root / "domosenso.yaml"
    data = yaml.safe_load(path.read_text())
    data["home_inputs"] = "domosenso/home.inputs.yaml"
    path.write_text(yaml.safe_dump(data))
    for cid in ("rooms-panel", "plain"):
        code, out = run(root, "add", f"{cid}@1.0.0", capsys=capsys)
        assert code == 0, out
        write_files(root, {f"domosenso/{cid}.inputs.yaml": "prefix: demo\n"})
    code, out = run(root, "render", capsys=capsys)
    assert code == 0, out
    return root


def _edit_rooms(home: Path, text: str) -> None:
    (home / "domosenso/home.inputs.yaml").write_text(text, encoding="utf-8")


def test_the_lock_records_the_digest_of_a_consumer_only(home):
    lock = Lock.load(home)
    assert lock.components["rooms-panel"].home_inputs == digest(HomeConfig.load(home))
    assert len(lock.components["rooms-panel"].home_inputs) == 64
    assert lock.components["plain"].home_inputs is None
    raw = yaml.safe_load((home / "domosenso.lock").read_text())
    assert "home_inputs" in raw["components"]["rooms-panel"]
    assert "home_inputs" not in raw["components"]["plain"]


def test_the_digest_is_of_the_content_not_the_bytes(home):
    before = digest(HomeConfig.load(home))
    _edit_rooms(home, "# the home's rooms\n" + yaml.safe_dump(ROOMS, default_flow_style=True))
    assert digest(HomeConfig.load(home)) == before, "a comment or a different YAML style is no change"
    _edit_rooms(home, yaml.safe_dump({"rooms": ROOMS["rooms"][:1]}))
    assert digest(HomeConfig.load(home)) != before


def test_status_names_a_stale_consumer_and_render_refreshes_it(home, capsys):
    code, out = run(home, "status", capsys=capsys)
    assert code == 0 and "stale rooms-panel" not in out, out
    _edit_rooms(home, yaml.safe_dump({"rooms": ROOMS["rooms"][:1]}))
    assert stale_consumers(HomeConfig.load(home), Lock.load(home)) == ["rooms-panel"]
    code, out = run(home, "status", capsys=capsys)
    assert "stale rooms-panel (home inputs changed)" in out
    assert "stale plain" not in out
    assert (code, out.splitlines()[-1]) == (1, "FAIL 1 stale render"), out
    code, out = run(home, "render", "rooms-panel", capsys=capsys)
    assert code == 0, out
    (package,) = [p for p in Lock.load(home).components["rooms-panel"].files if p.startswith(f"{HA}/packages/")]
    assert (home / package).read_text().endswith("rooms: living_room\n")
    code, out = run(home, "status", capsys=capsys)
    assert (code, out.splitlines()[-1]) == (0, "ok"), out


def test_deploy_refuses_a_stale_render(home, tmp_path):
    deploy_plan(home, tmp_path / "target")  # current: plans
    _edit_rooms(home, yaml.safe_dump({"rooms": ROOMS["rooms"][:1]}))
    with pytest.raises(DomosensoError, match=r"stale render: rooms-panel \(home inputs changed; render it\)"):
        deploy_plan(home, tmp_path / "target2")


def test_a_dev_render_records_the_digest_too(home, catalog, capsys):
    _component(catalog, "rooms-panel", "uses_home: true", "rooms-dev:[% for r in home.rooms %] [[ r.id ]][% endfor %]\n")
    code, out = run(home, "render", "rooms-panel", "--catalog-dev", str(catalog), capsys=capsys)
    assert code == 0, out
    import json
    entry = json.loads((home / ".domosenso/dev-render.json").read_text())["rooms-panel"]
    assert entry["home_inputs"] == digest(HomeConfig.load(home))
    assert stale_consumers(HomeConfig.load(home), Lock.load(home)) == []
    _edit_rooms(home, yaml.safe_dump({"rooms": ROOMS["rooms"][:1]}))
    assert stale_consumers(HomeConfig.load(home), Lock.load(home)) == ["rooms-panel"]


def test_a_lock_from_before_records_nothing_and_is_not_stale(home):
    path = home / "domosenso.lock"
    raw = yaml.safe_load(path.read_text())
    del raw["components"]["rooms-panel"]["home_inputs"]
    path.write_text("# Written by domosenso — do not edit\n" + yaml.safe_dump(raw))
    _edit_rooms(home, yaml.safe_dump({"rooms": ROOMS["rooms"][:1]}))
    assert stale_consumers(HomeConfig.load(home), Lock.load(home)) == []
