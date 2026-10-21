"""Lovelace resources: the wanted set, matching by file name, and applying actions in place."""
import asyncio
from pathlib import Path

import pytest

from domosenso_cli.build import sha256
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import HomeConfig
from domosenso_cli.lock import Lock, LockEntry
from domosenso_cli.resources import Action, Resource, apply, plan, wanted
from fakes import FakeHA

CARD = "/local/domosenso/ramka/0.1.1/cards/agenda-card.js"


def make_home(tmp_path: Path, resources: list[dict] | None = None) -> HomeConfig:
    return HomeConfig(
        root=tmp_path, catalog="c", config_dir=tmp_path / "config", esphome_dir=tmp_path / "esphome",
        targets={}, components={}, resources=resources or [],
    )


def lock_with(*urls: str) -> Lock:
    return Lock({"ramka": LockEntry("0.1.1", "ramka/0.1.1", "abc", resources=list(urls))})


def put(home: HomeConfig, rel: str, content: bytes) -> None:
    path = home.config_dir / "www" / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_update_in_place_keeps_id():
    existing = [{"id": "abc", "url": "/local/agenda-card.js?v=6", "type": "module"}]
    assert plan(existing, [Resource(CARD)]) == [Action("update", CARD, "abc", "/local/agenda-card.js?v=6")]


def test_same_url_no_action():
    assert plan([{"id": "abc", "url": CARD, "type": "module"}], [Resource(CARD)]) == []


def test_type_differs_updates():
    existing = [{"id": "abc", "url": CARD, "type": "js"}]
    assert plan(existing, [Resource(CARD)]) == [Action("update", CARD, "abc", CARD, "module")]


def test_create_missing():
    assert plan([], [Resource(CARD)]) == [Action("create", CARD)]


def test_duplicate_refused():
    existing = [
        {"id": "a1", "url": "/local/agenda-card.js?v=1", "type": "module"},
        {"id": "a2", "url": "/local/old/agenda-card.js", "type": "module"},
    ]
    with pytest.raises(DomosensoError, match=r"duplicate resources for agenda-card\.js: a1, a2"):
        plan(existing, [Resource(CARD)])


def test_unwanted_listed_not_deleted():
    existing = [{"id": "z", "url": "/local/other.js", "type": "module"}]
    ha = FakeHA()
    actions = plan(existing, [])
    assert actions == [Action("unwanted", "/local/other.js", "z")]
    asyncio.run(apply(ha, actions, prune=False))
    assert ha.calls == []


def test_prune_deletes():
    ha = FakeHA({"lovelace/resources/delete": None})
    asyncio.run(apply(ha, [Action("unwanted", "/local/other.js", "z")], prune=True))
    assert ha.calls == [("lovelace/resources/delete", {"resource_id": "z"})]


def test_apply_order_updates_creates_then_deletes_with_fields():
    ha = FakeHA({
        "lovelace/resources/update": None, "lovelace/resources/create": None, "lovelace/resources/delete": None,
    })
    actions = [
        Action("unwanted", "/local/x.js", "x"),
        Action("create", "/local/new.js", type="module"),
        Action("update", "/local/new-a.js", "a", "/local/a.js?v=1", "module"),
    ]
    asyncio.run(apply(ha, actions, prune=True))
    assert ha.calls == [
        ("lovelace/resources/update", {"resource_id": "a", "url": "/local/new-a.js", "res_type": "module"}),
        ("lovelace/resources/create", {"url": "/local/new.js", "res_type": "module"}),
        ("lovelace/resources/delete", {"resource_id": "x"}),
    ]


def test_wanted_has_locked_cards_and_home_hashes(tmp_path):
    home = make_home(tmp_path, [{"url": "/local/my/own-card.js", "type": "module"}])
    put(home, "my/own-card.js", b"console.log(1)")
    got = wanted(home, lock_with(CARD))
    assert got == [Resource(CARD), Resource(f"/local/my/own-card.js?v={sha256(b'console.log(1)')[:8]}")]


def test_home_resource_gets_hash_query(tmp_path):
    home = make_home(tmp_path, [{"url": "/local/own-card.js?v=old", "type": "module"}])
    put(home, "own-card.js", b"one")
    first = wanted(home, Lock())[0].url
    put(home, "own-card.js", b"two")
    second = wanted(home, Lock())[0].url
    assert first == f"/local/own-card.js?v={sha256(b'one')[:8]}"
    assert second == f"/local/own-card.js?v={sha256(b'two')[:8]}"
    assert first != second


def test_home_resource_missing_file_named(tmp_path):
    home = make_home(tmp_path, [{"url": "/local/gone.js", "type": "module"}])
    with pytest.raises(DomosensoError, match=r"gone\.js"):
        wanted(home, Lock())


def test_third_party_resource_passes_through(tmp_path):
    home = make_home(tmp_path, [{"url": "https://cdn.example.org/lib.js?x=1", "type": "module"}])
    assert wanted(home, Lock()) == [Resource("https://cdn.example.org/lib.js?x=1")]


def test_home_resource_type_kept(tmp_path):
    home = make_home(tmp_path, [{"url": "/local/s.css", "type": "css"}])
    put(home, "s.css", b"x")
    assert wanted(home, Lock())[0].type == "css"


def test_home_resource_clashes_with_component_card(tmp_path):
    home = make_home(tmp_path, [{"url": "/local/agenda-card.js", "type": "module"}])
    put(home, "agenda-card.js", b"x")
    with pytest.raises(DomosensoError) as exc:
        wanted(home, lock_with(CARD))
    assert "agenda-card.js" in str(exc.value) and "ramka" in str(exc.value) and "/local/agenda-card.js" in str(exc.value)
