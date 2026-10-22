import json
import types

import pytest

from domosenso_cli import main as cli
from domosenso_cli.errors import DomosensoError
from domosenso_cli.report import Reporter

COMMANDS = "init add adopt render update status deploy rollback snapshot compare verify".split()


def test_help_lists_commands(capsys):
    with pytest.raises(SystemExit) as exit_info:
        cli.main(["--help"])
    assert exit_info.value.code == 0
    out = capsys.readouterr().out
    for name in COMMANDS:
        assert name in out
    assert "--home" in out


def test_registry_names_every_command():
    assert sorted(cli.COMMANDS) == sorted(COMMANDS)


def test_reporter_text(capsys):
    rep = Reporter(json_mode=False)
    rep.line("add", "a.yaml")
    assert rep.ok() == 0
    assert capsys.readouterr().out == "add a.yaml\nok\n"


def test_reporter_json(capsys):
    rep = Reporter(json_mode=True)
    rep.line("add", "a.yaml")
    assert rep.ok() == 0
    out = capsys.readouterr().out
    assert json.loads(out) == {"lines": [["add", "a.yaml"]], "result": "ok"}
    assert out.count("\n") == 1  # one document


def test_reporter_json_fail_and_data(capsys):
    rep = Reporter(json_mode=True)
    rep.line("note", "x")
    rep.data.append({"id": "ramka"})
    assert rep.fail("boom") == 1
    assert json.loads(capsys.readouterr().out) == {
        "lines": [["note", "x"]],
        "data": [{"id": "ramka"}],
        "result": "FAIL",
        "reason": "boom",
    }


def test_reporter_text_fail(capsys):
    rep = Reporter(json_mode=False)
    assert rep.fail("x") == 1
    assert capsys.readouterr().out == "FAIL x\n"


def fake_command(monkeypatch, run, add_arguments=None):
    module = types.SimpleNamespace(run=run)
    if add_arguments:
        module.add_arguments = add_arguments
    real = cli.load_command_module
    monkeypatch.setitem(cli.COMMANDS, "status", "fake.status")
    monkeypatch.setattr(cli, "load_command_module", lambda path: module if path == "fake.status" else real(path))


def test_error_becomes_fail(monkeypatch, capsys):
    def run(args, rep):
        rep.line("start")
        raise DomosensoError("x")

    fake_command(monkeypatch, run)
    assert cli.main(["status"]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "FAIL x"


def test_error_becomes_fail_json(monkeypatch, capsys):
    def run(args, rep):
        raise DomosensoError("x")

    fake_command(monkeypatch, run)
    assert cli.main(["status", "--json"]) == 1
    doc = json.loads(capsys.readouterr().out)
    assert doc["result"] == "FAIL" and doc["reason"] == "x"


def test_not_implemented_stub_fails(monkeypatch, capsys):
    # Every command is implemented now; a stub is still how a new command lands first.
    monkeypatch.setitem(cli.COMMANDS, "snapshot", None)
    assert cli.main(["snapshot"]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "FAIL not implemented"


def test_every_stub_accepts_json(capsys):
    for name in COMMANDS:
        if cli.COMMANDS[name] is None:
            assert cli.main([name, "--json"]) == 1
            assert json.loads(capsys.readouterr().out)["reason"] == "not implemented"


def test_home_option_defaults_to_cwd(monkeypatch, tmp_path):
    seen = {}

    def run(args, rep):
        seen["home"] = args.home
        return rep.ok()

    fake_command(monkeypatch, run)
    monkeypatch.chdir(tmp_path)
    assert cli.main(["status"]) == 0
    assert seen["home"] == tmp_path.resolve()
    assert cli.main(["--home", str(tmp_path / "h"), "status"]) == 0
    assert seen["home"] == (tmp_path / "h").resolve()


def test_home_option_is_made_absolute(monkeypatch, tmp_path):
    seen = {}

    def run(args, rep):
        seen["home"] = args.home
        return rep.ok()

    fake_command(monkeypatch, run)
    (tmp_path / "h").mkdir()
    monkeypatch.chdir(tmp_path)
    assert cli.main(["--home", "h", "status"]) == 0
    assert seen["home"] == (tmp_path / "h").resolve() and seen["home"].is_absolute()


def test_unexpected_exception_becomes_fail(monkeypatch, capsys):
    def run(args, rep):
        raise KeyError("x")

    fake_command(monkeypatch, run)
    assert cli.main(["status"]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "FAIL unexpected: KeyError('x')"


def test_unexpected_exception_prints_one_json_document(monkeypatch, capsys):
    def run(args, rep):
        rep.line("start")
        raise ValueError("bad")

    fake_command(monkeypatch, run)
    assert cli.main(["status", "--json"]) == 1
    out = capsys.readouterr().out
    assert out.count("\n") == 1
    doc = json.loads(out)
    assert doc["result"] == "FAIL" and doc["reason"] == "unexpected: ValueError('bad')"


@pytest.mark.parametrize("value", [None, "ok", True])
def test_run_without_exit_code_is_a_failure(monkeypatch, capsys, value):
    fake_command(monkeypatch, lambda args, rep: value)
    assert cli.main(["status"]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "FAIL command returned no exit code"


def test_module_adds_its_own_arguments(monkeypatch):
    seen = {}

    def add_arguments(parser):
        parser.add_argument("ids", nargs="*")
        parser.add_argument("--force", action="store_true")

    def run(args, rep):
        seen.update(ids=args.ids, force=args.force)
        return rep.ok()

    fake_command(monkeypatch, run, add_arguments)
    assert cli.main(["status", "a", "b", "--force"]) == 0
    assert seen == {"ids": ["a", "b"], "force": True}


def test_no_command_is_a_usage_error(capsys):
    with pytest.raises(SystemExit) as exit_info:
        cli.main([])
    assert exit_info.value.code == 2
