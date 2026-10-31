"""The Ramka's catalog index (SPEC-023) follows the catalog: components, the site's pages, device match rules."""
import catalog_index


def test_index_is_current():
    assert catalog_index.OUT.read_text(encoding="utf-8") == catalog_index.render(), \
        "components/ramka/shell/domosenso_catalog.json is stale: run uv run tools/catalog_index.py"


def test_index_has_every_device_and_component():
    data = catalog_index.build()
    assert {d["id"] for d in data["devices"]} == {p.stem for p in (catalog_index.ROOT / "devices").glob("*.yaml")}
    assert set(data["components"]) == {p.parent.name for p in (catalog_index.ROOT / "components").glob("*/component.yaml")}
    assert all(d["match"] for d in data["devices"] if d["page"]), "a device with a page needs a match rule to be linked"
