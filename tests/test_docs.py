"""Guards for the people-facing documents (SPEC-013): README images carry no metadata, every relative
link in README.md, CONTRIBUTING.md and docs/*.md points at a file that exists, and the home template's
.gitignore keeps secrets out of a home repository that goes to GitHub."""
import re
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
# A photo straight from a phone carries GPS and the camera in EXIF or XMP, and an exported PNG can
# carry any text chunk (Author, Description, …). Only encoding details and a colour profile may stay.
ALLOWED_INFO = {"jfif", "jfif_version", "jfif_unit", "jfif_density", "dpi", "progressive", "progression",
                "adobe", "adobe_transform", "icc_profile", "transparency", "gamma"}
LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def readme_images() -> list[Path]:
    folder = ROOT / ".github" / "readme"
    return sorted(p for p in folder.glob("*") if p.suffix.lower() in IMAGE_SUFFIXES) if folder.is_dir() else []


def test_readme_images_exist():
    assert readme_images(), "no images in .github/readme/"


def test_readme_images_have_no_metadata():
    for path in readme_images():
        with Image.open(path) as img:
            assert not img.getexif(), f"{path.name}: EXIF present"
            leaked = set(img.info) - ALLOWED_INFO
            assert not leaked, f"{path.name}: metadata {sorted(leaked)}"


def test_journal_photos_are_exact_copies_of_approved_readme_images():
    journal = ROOT / "website" / "public" / "journal"
    approved = {
        "installation-001.jpg": "ramka-now-playing.jpg",
        "ramka-air.jpg": "ramka-air.jpg",
    }
    assert {p.name for p in journal.iterdir() if p.is_file()} == set(approved)
    for target, source in approved.items():
        assert (journal / target).read_bytes() == (ROOT / ".github" / "readme" / source).read_bytes()


def test_metadata_guard_catches_png_text(tmp_path):
    from PIL.PngImagePlugin import PngInfo
    meta = PngInfo()
    meta.add_text("Description", "taken at home")
    Image.new("RGB", (4, 4)).save(tmp_path / "x.png", pnginfo=meta)
    with Image.open(tmp_path / "x.png") as img:
        assert set(img.info) - ALLOWED_INFO == {"Description"}


def documents() -> list[Path]:
    docs = [ROOT / "README.md", ROOT / "CONTRIBUTING.md", *sorted((ROOT / "docs").glob("*.md"))]
    return [d for d in docs if d.exists()]


def broken_links(doc: Path) -> list[str]:
    text = re.sub(r"```.*?```", "", doc.read_text(encoding="utf-8"), flags=re.DOTALL)  # code blocks are not links
    broken = []
    for target in LINK.findall(text):
        if re.match(r"^(https?:|mailto:|#)", target):
            continue
        path = target.split("#", 1)[0]
        if path and not (doc.parent / path).exists():
            broken.append(f"{doc.relative_to(ROOT)}: {target}")
    return broken


def test_relative_links_resolve():
    broken = [b for doc in documents() for b in broken_links(doc)]
    assert broken == []


# SPEC-013 §5.5: the home repository may go to GitHub; these must never be tracked in it.
HOME_IGNORED = ["secrets.yaml", "home-assistant/secrets.yaml", "ha.token", "token", ".domosenso/snap/x.json",
                "staging/.data/x", "staging/.data-prod/x", ".storage/core.config_entries",
                "home-assistant/.storage/auth", "home-assistant_v2.db", "home-assistant_v2.db-wal"]


def test_home_template_gitignore(tmp_path):
    template = ROOT / "examples" / "home-template" / ".gitignore"
    assert template.is_file(), "examples/home-template/.gitignore is missing"
    (tmp_path / ".gitignore").write_text(template.read_text(encoding="utf-8"), encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    for path in HOME_IGNORED:
        ignored = subprocess.run(["git", "-C", str(tmp_path), "check-ignore", "--no-index", "-q", path])
        assert ignored.returncode == 0, f"{path} is not ignored by the home template"
    kept = subprocess.run(["git", "-C", str(tmp_path), "check-ignore", "--no-index", "-q", "domosenso.yaml"])
    assert kept.returncode == 1, "domosenso.yaml must stay tracked"


def test_no_document_points_at_a_readme_components_table():
    # The README lists components under "What's in the box"; the table lives in CONTRIBUTING.md.
    sources = [ROOT / "AGENTS.md", *(ROOT / ".ai" / "skills").glob("*/SKILL.md")]
    stale = [str(s.relative_to(ROOT)) for s in sources if "components table in `README.md`" in s.read_text(encoding="utf-8")]
    assert stale == []


def test_readme_tested_homes_line_matches_manifests():
    untested = sorted(c.parent.name for c in (ROOT / "components").glob("*/component.yaml")
                      if "homes: 0" in c.read_text(encoding="utf-8"))
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    if untested:
        assert "Every component runs in one home so far" not in readme


def test_public_release_license_covers_selected_component_snapshots():
    import json
    selection = json.loads((ROOT / 'website/content/publication.json').read_text())
    grant = (ROOT / 'docs/licensing.md').read_text()
    assert 'Apache-2.0' in grant and 'ZeroStoryPoints GmbH' in grant
    for component in selection['components']:
        assert component['commit'] in grant
        assert component['tag'] in grant


def test_onboarding_discloses_unreleased_remote_access_and_current_ramka():
    guide = (ROOT / 'docs/getting-started.md').read_text()
    skill = (ROOT / '.ai/skills/onboard-home/SKILL.md').read_text()
    assert 'Every component is tested in that one home only' not in guide
    assert 'in progress (SPEC-011)' not in guide
    assert 'no published component tag' in guide
    assert 'ramka/0.2.0' in guide
    assert 'tested-homes unknown' not in skill
    assert 'reaches `recommend` once it is tagged' not in skill
