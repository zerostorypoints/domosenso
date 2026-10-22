"""Guards for the people-facing documents (SPEC-013): README images carry no metadata, every relative
link in README.md, CONTRIBUTING.md and docs/*.md points at a file that exists, and the home template's
.gitignore keeps secrets out of a home repository that goes to GitHub."""
import re
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
# A photo straight from a phone carries GPS and the camera in EXIF or XMP; an ICC colour profile is
# harmless and allowed.
METADATA_KEYS = {"exif", "xmp", "XML:com.adobe.xmp", "comment", "photoshop", "iptc"}
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
            leaked = METADATA_KEYS & set(img.info)
            assert not leaked, f"{path.name}: metadata {sorted(leaked)}"


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
