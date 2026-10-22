"""`domosenso http`: Home Assistant's HTTP settings for a reverse proxy (SPEC-012 section 3)."""
import copy
import json

import pytest
import yaml

from domosenso_cli import http_config
from domosenso_cli import main as cli

STABLE = {"server_port": 8123, "cors_allowed_origins": ["https://cast.home-assistant.io"],
          "login_attempts_threshold": -1, "ip_ban_enabled": False, "ssl_profile": "modern",
          "use_x_frame_options": True, "created_at": "2026-09-12T00:00:00+00:00", "error": None, "error_message": None}


class Store:
    """Home Assistant's .storage/http as http/config shows it, with configure (pending + restart) and promote."""

    def __init__(self, stable=STABLE):
        self.stable, self.pending, self.active = copy.deepcopy(stable), None, "stable"
        self.restarts = 0

    def config(self, fields=None):
        return {"stable": copy.deepcopy(self.stable), "pending": copy.deepcopy(self.pending),
                "revert_at": "2026-10-22T12:05:00+00:00" if self.pending else None,
                "active_config_type": self.active, "default": {"server_port": 8123}}

    def configure(self, fields):
        config = fields["config"]
        assert not set(config) - set(http_config.CONFIG_KEYS), "configure refuses the stored-only keys"
        assert not (config.get("use_x_forwarded_for") and not config.get("trusted_proxies"))
        changed = config != (self.pending and {k: v for k, v in self.pending.items() if k in http_config.CONFIG_KEYS})
        self.pending = {**config, "created_at": "now", "error": None, "error_message": None}
        if changed:
            self.restarts += 1
            self.active = "pending"
        return {"restart": changed}

    def promote(self, fields):
        self.stable, self.pending, self.active = self.pending, None, "stable"

    def responses(self):
        return {"http/config": self.config, "http/config/configure": self.configure, "http/config/promote": self.promote}


@pytest.fixture
def ha(monkeypatch, tmp_path):
    from domosenso_cli import recommend
    from fakes import FakeHA

    store = Store()
    fake = FakeHA(store.responses())
    fake.store = store

    class StubHA:
        def __new__(cls, url, token, token_source=None):
            return fake

        @classmethod
        def for_target(cls, target):
            return fake

    monkeypatch.setattr(recommend, "HA", StubHA)
    monkeypatch.setattr(http_config, "POLL_S", 0)
    return fake


@pytest.fixture
def token(tmp_path):
    path = tmp_path / "token"
    path.write_text("t")
    return path


def run(capsys, *argv):
    code = cli.main(list(argv))
    return code, capsys.readouterr().out.splitlines()


def url_args(tmp_path, token, *rest):
    return ("--home", str(tmp_path), "http", "http://ha.local:8123", "--token-file", str(token), *rest)


def test_plan_lists_the_changes_and_writes_nothing(tmp_path, capsys, ha, token):
    code, lines = run(capsys, *url_args(tmp_path, token, "--plan"))
    assert code == 0, lines
    _, _, digest = http_config.plan(ha.store.config(), http_config.HOST_NETWORK_PROXIES)
    assert lines == [
        "http ip_ban_enabled false -> true",
        "http login_attempts_threshold -1 -> 5",
        'http trusted_proxies null -> ["127.0.0.1/32","::1/128"]',
        "http use_x_forwarded_for null -> true",
        "restart: yes",
        f"hash {digest}",
        "ok",
    ]
    assert [k for k, _ in ha.calls] == ["http/config"]


def test_apply_needs_the_plans_hash_then_restarts_into_pending_and_promote_makes_it_stable(tmp_path, capsys, ha, token):
    code, lines = run(capsys, *url_args(tmp_path, token, "--apply"))
    assert code == 1 and lines[-1].startswith("FAIL --apply needs --confirm ")
    code, lines = run(capsys, *url_args(tmp_path, token, "--apply", "--confirm", "000000000000"))
    assert code == 1 and lines[-1].startswith("FAIL the plan changed: its hash is now ")
    assert ha.store.restarts == 0

    _, _, digest = http_config.plan(ha.store.config(), http_config.HOST_NETWORK_PROXIES)
    code, lines = run(capsys, *url_args(tmp_path, token, "--apply", "--confirm", digest))
    assert code == 0, lines
    assert lines == ["configured restart: yes", "active pending", "revert-at 2026-10-22T12:05:00+00:00", "ok"]
    pending = ha.store.pending
    assert pending["use_x_forwarded_for"] is True and pending["trusted_proxies"] == ["127.0.0.1/32", "::1/128"]
    assert pending["cors_allowed_origins"] == ["https://cast.home-assistant.io"]  # the home's own keys stay
    assert pending["ssl_profile"] == "modern" and pending["login_attempts_threshold"] == 5

    code, lines = run(capsys, *url_args(tmp_path, token, "--plan"))
    assert lines == ["pending waiting revert-at 2026-10-22T12:05:00+00:00", "nothing to change", "ok"]
    code, lines = run(capsys, *url_args(tmp_path, token, "--promote"))
    assert lines == ["stable", "ok"]
    assert ha.store.pending is None and ha.store.stable["use_x_forwarded_for"] is True
    code, lines = run(capsys, *url_args(tmp_path, token, "--promote"))
    assert lines == ["nothing to promote", "ok"]


def test_a_threshold_the_home_chose_stays(tmp_path, capsys, ha, token):
    ha.store.stable["login_attempts_threshold"] = 10
    code, lines = run(capsys, *url_args(tmp_path, token, "--plan"))
    assert not [line for line in lines if "login_attempts_threshold" in line]


def test_trusted_proxies_from_the_inputs_or_the_command_line(tmp_path, capsys, ha, token):
    home = tmp_path / "home"
    (home / "domosenso").mkdir(parents=True)
    (home / "domosenso.yaml").write_text(yaml.safe_dump({
        "catalog": str(tmp_path / "catalog"), "config_dir": "home-assistant", "esphome_dir": "esphome",
        "targets": {"production": {"kind": "ssh-docker", "host": "u@h", "container": "ha", "config": "/c",
                                   "url": "http://ha.local:8123", "token_file": str(token)}},
        "components": {}}))
    (home / "domosenso" / "remote-access.inputs.yaml").write_text(yaml.safe_dump({"trusted_proxies": ["172.18.0.0/16"]}))
    code, lines = run(capsys, "--home", str(home), "http", "production", "--plan")
    assert 'http trusted_proxies null -> ["172.18.0.0/16"]' in lines
    code, lines = run(capsys, "--home", str(home), "http", "production", "--plan", "--trusted-proxy", "10.0.0.5/32")
    assert 'http trusted_proxies null -> ["10.0.0.5/32"]' in lines


def test_already_set_up(tmp_path, capsys, ha, token):
    ha.store.stable.update(use_x_forwarded_for=True, trusted_proxies=["127.0.0.1/32", "::1/128"],
                           ip_ban_enabled=True, login_attempts_threshold=5)
    for action in ("--plan", "--apply"):
        code, lines = run(capsys, *url_args(tmp_path, token, action))
        assert lines == ["nothing to change", "ok"], action
    assert ha.store.restarts == 0


def test_a_pending_config_that_failed_is_reported(tmp_path, capsys, ha, token):
    ha.store.pending = {**STABLE, "error": "bind_failed", "error_message": "address in use"}
    code, lines = run(capsys, *url_args(tmp_path, token, "--promote"))
    assert code == 1 and lines[-1] == "FAIL the pending config failed its trial: address in use"


def test_promote_refuses_a_pending_config_that_is_not_running(tmp_path, capsys, ha, token):
    ha.store.pending = {**STABLE, "use_x_forwarded_for": True, "trusted_proxies": ["::1/128"]}
    code, lines = run(capsys, *url_args(tmp_path, token, "--promote"))
    assert code == 1 and lines[-1] == "FAIL the pending config is not the one running; restart before promoting"


def test_confirm_only_with_apply(tmp_path, capsys, ha, token):
    code, lines = run(capsys, *url_args(tmp_path, token, "--plan", "--confirm", "x"))
    assert code == 1 and lines[-1] == "FAIL --confirm goes with --apply"
