"""`domosenso.yaml`: the home's declaration of its catalog, targets and components."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from domosenso_cli.schema import load_validated

HOME_FILE = "domosenso.yaml"
DEFAULT_LANGS = ["en", "de", "pl"]


@dataclass
class Target:
    name: str
    kind: Literal["local-docker", "ssh-docker"]
    container: str
    config: str  # a path on the target (on the host for ssh-docker), as the target sees it
    url: str
    token_file: Path
    host: str | None = None
    docker: str = "docker"


@dataclass
class ComponentEntry:
    id: str
    inputs: Path
    langs: list[str] = field(default_factory=lambda: list(DEFAULT_LANGS))
    outputs: dict[str, str] = field(default_factory=dict)


@dataclass
class HomeConfig:
    root: Path
    catalog: str
    config_dir: Path
    esphome_dir: Path
    targets: dict[str, Target]
    components: dict[str, ComponentEntry]
    local: list[str] = field(default_factory=list)
    resources: list[dict] = field(default_factory=list)
    unmanaged_on_target: list[str] = field(default_factory=list)
    kiosk_users: list[str] = field(default_factory=list)
    custom_integrations: dict[str, str] = field(default_factory=dict)

    @classmethod
    def load(cls, root: Path) -> HomeConfig:
        data = load_validated(root / HOME_FILE, "home")
        targets = {
            name: Target(
                name=name,
                kind=raw["kind"],
                container=raw["container"],
                config=raw["config"],
                url=raw["url"],
                token_file=Path(raw["token_file"]).expanduser(),
                host=raw.get("host"),
                docker=raw.get("docker", "docker"),
            )
            for name, raw in data["targets"].items()
        }
        components = {
            cid: ComponentEntry(
                id=cid,
                inputs=root / raw["inputs"],
                langs=list(raw.get("langs", DEFAULT_LANGS)),
                outputs=dict(raw.get("outputs", {})),
            )
            for cid, raw in data["components"].items()
        }
        return cls(
            root=root,
            catalog=data["catalog"],
            config_dir=root / data["config_dir"],
            esphome_dir=root / data["esphome_dir"],
            targets=targets,
            components=components,
            local=list(data.get("local", [])),
            resources=[dict(r) for r in data.get("resources", [])],
            unmanaged_on_target=list(data.get("unmanaged_on_target", [])),
            kiosk_users=list(data.get("kiosk_users", [])),
            custom_integrations=dict(data.get("custom_integrations", {})),
        )
