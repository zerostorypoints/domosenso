"""The deploy transports against stub `docker` and `ssh` executables on PATH, and `FakeTarget`.

The stubs run the command on this machine. `docker exec` maps the container's `/config` to a local
directory (`STUB_CONFIG`) and drops the container name; `ssh <host> <string>` hands the string to
`sh -c`, as a remote login shell would. Every call is logged, so the tests can see what was run.
"""
import json
import os
import time
import shlex
import stat
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from domosenso_cli import targets
from domosenso_cli.errors import DomosensoError
from domosenso_cli.home import Target
from domosenso_cli.targets import LocalDocker, SshDocker, open_target
from fakes import FakeTarget

DOCKER_STUB = """#!{python}
import json, os, subprocess, sys, time
argv = sys.argv[1:]
with open(os.environ["STUB_LOG"], "a") as log:
    log.write(json.dumps(["docker", argv, os.environ.get("STUB_MARK", "")]) + "\\n")
time.sleep(float(os.environ.get("STUB_SLEEP", "0")))
if argv[:1] == ["exec"]:
    rest = argv[1:]
    while rest[0].startswith("-"):
        rest = rest[1:]
    cmd = [a.replace("/config", os.environ["STUB_CONFIG"]) for a in rest[1:]]  # rest[0] = container
    sys.exit(subprocess.call(cmd))
if argv[:1] == ["restart"]:
    sys.exit(int(os.environ.get("STUB_RESTART_RC", "0")))
sys.exit(2)
"""

SSH_STUB = """#!{python}
import json, os, sys, time
argv = sys.argv[1:]
with open(os.environ["STUB_LOG"], "a") as log:
    log.write(json.dumps(["ssh", argv, ""]) + "\\n")
time.sleep(float(os.environ.get("STUB_SLEEP", "0")))
if os.environ.get("STUB_SSH_FAIL"):
    sys.stderr.write(os.environ["STUB_SSH_FAIL"] + "\\n")
    sys.exit(255)
os.execvp("sh", ["sh", "-c", argv[-1]])  # the options and the host come first, the string is last
"""


@pytest.fixture
def stubs(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", DOCKER_STUB), ("ssh", SSH_STUB)):
        path = bin_dir / name
        path.write_text(body.format(python=sys.executable))
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
    config = tmp_path / "config"
    config.mkdir()
    log = tmp_path / "calls.jsonl"
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setenv("STUB_CONFIG", str(config))
    monkeypatch.setenv("STUB_LOG", str(log))

    def calls(tool=None):
        if not log.exists():
            return []
        rows = [json.loads(line) for line in log.read_text().splitlines()]
        return [(t, argv, mark) for t, argv, mark in rows if tool in (None, t)]

    return SimpleNamespace(config=config, calls=calls)


def make_target(kind, config, **over):
    fields = dict(
        name="t", kind=kind, container="hass", config=config if kind == "local-docker" else "/srv/ha/config",
        url="http://localhost:8123", token_file=Path("token"), host="nas" if kind == "ssh-docker" else None,
    )
    fields.update(over)
    return Target(**fields)


@pytest.fixture(params=["local-docker", "ssh-docker"])
def io(request, stubs):
    """The same behaviour is promised by both transports; files land in `stubs.config` either way."""
    t = make_target(request.param, stubs.config)
    return SimpleNamespace(
        kind=request.param, target=t, config=stubs.config, calls=stubs.calls,
        io=LocalDocker(t) if request.param == "local-docker" else SshDocker(t),
    )


def test_put_then_hashes(io):
    io.io.put({"packages/a.yaml": b"one: 1\n", "www/domosenso/x.js": b"\x00\xff binary"})
    import hashlib

    assert io.io.hashes(["packages/a.yaml", "www/domosenso/x.js", "packages/missing.yaml"]) == {
        "packages/a.yaml": hashlib.sha256(b"one: 1\n").hexdigest(),
        "www/domosenso/x.js": hashlib.sha256(b"\x00\xff binary").hexdigest(),
        "packages/missing.yaml": None,
    }
    assert (io.config / "packages/a.yaml").read_bytes() == b"one: 1\n"
    assert stat.S_IMODE((io.config / "packages/a.yaml").stat().st_mode) == 0o644


def test_hashes_of_nothing_is_empty(io, stubs):
    assert io.io.hashes([]) == {}
    assert stubs.calls() == []


def test_put_creates_parent_dirs(io):
    io.io.put({"a/b/c/d.yaml": b"x"})
    assert (io.config / "a/b/c/d.yaml").read_bytes() == b"x"


def test_put_overwrites(io):
    io.io.put({"a.yaml": b"old"})
    io.io.put({"a.yaml": b"new"})
    assert io.io.read("a.yaml") == b"new"


def test_read_missing_is_none(io):
    io.io.put({"a.yaml": b"\x01\x02\n"})
    assert io.io.read("a.yaml") == b"\x01\x02\n"
    assert io.io.read("nope.yaml") is None
    (io.config / "dir").mkdir()
    assert io.io.read("dir") is None


def test_glob_relative(io):
    for name in ("packages/a.yaml", "packages/b.yaml", "packages/sub/c.yaml", "packages/d.txt", "top.yaml",
                 "www/x.js", "www/domosenso/y.js", "www/domosenso/z.css"):
        io.io.put({name: b"."})
    assert io.io.glob(["packages/*.yaml"]) == ["packages/a.yaml", "packages/b.yaml"]
    assert io.io.glob(["www/**/*.js"]) == ["www/domosenso/y.js", "www/x.js"]
    assert io.io.glob(["packages/*.yaml", "top.yaml", "nothing/*"]) == ["packages/a.yaml", "packages/b.yaml", "top.yaml"]
    assert io.io.glob([]) == []


def test_glob_matches_hidden_and_spaced_names(io):
    io.io.put({".domosenso/deployed.json": b"{}", "my dir/a b.yaml": b"."})
    assert io.io.glob([".domosenso/*"]) == [".domosenso/deployed.json"]
    assert io.io.glob(["my dir/*.yaml"]) == ["my dir/a b.yaml"]


def test_delete(io):
    io.io.put({"a.yaml": b"1", "b/c.yaml": b"2", "keep.yaml": b"3"})
    io.io.delete(["a.yaml", "b/c.yaml", "never-existed.yaml"])
    assert sorted(p.relative_to(io.config).as_posix() for p in io.config.rglob("*") if p.is_file()) == ["keep.yaml"]
    io.io.delete([])


def test_paths_with_spaces_and_quotes_round_trip(io):
    names = ["my dir/a b.yaml", "it's here.yaml", "$HOME/x;y.yaml", "-dash.yaml"]
    io.io.put({n: n.encode() for n in names})
    assert all(io.io.read(n) == n.encode() for n in names)
    assert all(v is not None for v in io.io.hashes(names).values())
    io.io.delete(names)
    assert io.io.hashes(names) == dict.fromkeys(names)


def test_ssh_argv_quotes_paths_with_spaces(stubs):
    t = make_target("ssh-docker", stubs.config, docker="env HASS_DOCKER=1 docker")
    ssh = SshDocker(t)
    ssh.put({"my dir/a b.yaml": b"x"})
    ssh.hashes(["my dir/a b.yaml", "it's.yaml"])
    ssh.delete(["my dir/a b.yaml"])
    calls = stubs.calls("ssh")
    assert len(calls) == 3
    for _, argv, _ in calls:
        assert argv[:-2] == targets.SSH_OPTIONS and argv[-2] == "nas"  # options, host, then one command string
        assert "BatchMode=yes" in argv and any(a.startswith("ConnectTimeout=") for a in argv)
        assert argv[-1].startswith("env HASS_DOCKER=1 docker exec -i hass ")
    assert calls[0][1][-1] == "env HASS_DOCKER=1 docker exec -i hass tar -x -C /config"
    assert shlex.split(calls[1][1][-1])[-2:] == ["my dir/a b.yaml", "it's.yaml"]
    assert "'my dir/a b.yaml'" in calls[1][1][-1] and "'it'\"'\"'s.yaml'" in calls[1][1][-1]
    assert shlex.split(calls[2][1][-1])[-1] == "my dir/a b.yaml"


def test_ssh_file_operations_run_in_the_container(stubs):
    SshDocker(make_target("ssh-docker", stubs.config)).delete(["a.yaml"])
    (_, argv, _), = stubs.calls("ssh")
    assert shlex.split(argv[-1])[:5] == ["docker", "exec", "-i", "hass", "sh"]


def test_exec_returns_code_and_combined_output(io):
    rc, out = io.io.exec(["sh", "-c", "echo out; echo err >&2; exit 3"])
    assert (rc, out) == (3, "out\nerr\n")
    assert io.io.exec(["echo", "a b"]) == (0, "a b\n")


def test_exec_runs_inside_the_container(io):
    io.io.exec(["python3", "-m", "homeassistant", "--script", "check_config"])
    if io.kind == "local-docker":
        assert io.calls("ssh") == []
        assert io.calls("docker")[0][1] == ["exec", "hass", "python3", "-m", "homeassistant", "--script", "check_config"]
    else:
        (_, argv, _), = io.calls("ssh")
        assert shlex.split(argv[-1]) == ["docker", "exec", "hass", "python3", "-m", "homeassistant", "--script",
                                        "check_config"]


def test_restart_passes_timeout(io):
    io.io.restart()
    io.io.restart(timeout_s=30)
    if io.kind == "local-docker":
        assert [argv for _, argv, _ in io.calls("docker")] == [["restart", "-t", "120", "hass"],
                                                                 ["restart", "-t", "30", "hass"]]
    else:
        assert [shlex.split(argv[-1]) for _, argv, _ in io.calls("ssh")] == [
            ["docker", "restart", "-t", "120", "hass"], ["docker", "restart", "-t", "30", "hass"]]


def test_restart_failure_raises(io, monkeypatch):
    monkeypatch.setenv("STUB_RESTART_RC", "1")
    with pytest.raises(DomosensoError, match="restart"):
        io.io.restart()


def test_multi_word_docker_is_split_not_run_through_a_shell(stubs, monkeypatch):
    monkeypatch.setenv("STUB_MARK", "")
    t = make_target("local-docker", stubs.config, docker="env STUB_MARK=sudo-like docker")
    LocalDocker(t).exec(["true"])
    assert stubs.calls("docker")[0][2] == "sudo-like"


def test_ssh_failure_names_the_command_and_stderr_but_not_contents(stubs, monkeypatch):
    monkeypatch.setenv("STUB_SSH_FAIL", "Permission denied (publickey)")
    ssh = SshDocker(make_target("ssh-docker", stubs.config))
    with pytest.raises(DomosensoError) as err:
        ssh.put({"a.yaml": b"TOPSECRET-CONTENT"})
    message = str(err.value)
    assert "ssh" in message and "nas" in message and "tar -x -C /config" in message
    assert "Permission denied (publickey)" in message
    assert "TOPSECRET" not in message


def test_nonzero_exit_of_a_file_operation_raises(stubs):
    ssh = SshDocker(make_target("ssh-docker", stubs.config))
    locked = stubs.config / "locked"
    locked.mkdir()
    (locked / "f").write_text("x")
    locked.chmod(0o500)
    try:
        if os.access(locked, os.W_OK):  # running as root: permissions do not bite
            pytest.skip("cannot make the directory unwritable")
        with pytest.raises(DomosensoError, match=r"rm -f.*exited 1"):
            ssh.delete(["locked/f"])
    finally:
        locked.chmod(0o700)


def _hang(monkeypatch):
    monkeypatch.setenv("STUB_SLEEP", "20")
    monkeypatch.setattr(targets, "COMMAND_TIMEOUT_S", 0.5)
    monkeypatch.setattr(targets, "RESTART_SLACK_S", 0.5)
    return time.monotonic()


def test_exec_and_restart_that_hang_time_out(io, monkeypatch):
    started = _hang(monkeypatch)
    with pytest.raises(DomosensoError, match=r"exec timed out after 0\.5s"):
        io.io.exec(["true"])
    with pytest.raises(DomosensoError, match=r"restart timed out after 0\.5s"):
        io.io.restart(timeout_s=0)
    assert time.monotonic() - started < 10


@pytest.mark.parametrize("operation", ["hashes", "put", "read", "delete", "glob"])
def test_ssh_file_operation_that_hangs_times_out(stubs, monkeypatch, operation):
    ssh = SshDocker(make_target("ssh-docker", stubs.config))
    started = _hang(monkeypatch)
    call = {
        "hashes": lambda: ssh.hashes(["a.yaml"]),
        "put": lambda: ssh.put({"a.yaml": b"x"}),
        "read": lambda: ssh.read("a.yaml"),
        "delete": lambda: ssh.delete(["a.yaml"]),
        "glob": lambda: ssh.glob(["a/*.yaml"]),
    }[operation]
    with pytest.raises(DomosensoError, match=rf"{operation} timed out after 0\.5s"):
        call()
    assert time.monotonic() - started < 10


def test_restart_waits_for_docker_own_timeout_plus_slack(io, monkeypatch):
    seen = []
    real_run = targets.subprocess.run
    monkeypatch.setattr(targets.subprocess, "run", lambda *a, **kw: seen.append(kw["timeout"]) or real_run(*a, **kw))
    io.io.restart(timeout_s=30)
    io.io.exec(["true"])
    assert seen == [30 + targets.RESTART_SLACK_S, targets.COMMAND_TIMEOUT_S]


def test_ssh_glob_lists_only_under_the_literal_prefixes(stubs):
    ssh = SshDocker(make_target("ssh-docker", stubs.config))
    for name in ("packages/a.yaml", "packages/sub/b.yaml", "www/domosenso/x.js", "www/y.js", "top.yaml",
                 "backups/old.yaml", "-dash/z.yaml", "photos/p.jpg"):
        ssh.put({name: b"."})
    assert ssh.glob(["packages/*.yaml", "www/**/*.js", "top.yaml", "-dash/*"]) == [
        "-dash/z.yaml", "packages/a.yaml", "top.yaml", "www/domosenso/x.js", "www/y.js"]
    words = shlex.split(stubs.calls("ssh")[-1][1][-1])
    assert words[-4:] == ["./-dash", "./packages", "./top.yaml", "./www"]
    assert ssh.glob(["*.yaml"]) == ["top.yaml"]
    assert shlex.split(stubs.calls("ssh")[-1][1][-1])[-1] == "."


def test_ssh_glob_under_a_missing_directory_is_empty_not_an_error(stubs):
    ssh = SshDocker(make_target("ssh-docker", stubs.config))
    ssh.put({"packages/a.yaml": b"."})
    assert ssh.glob(["nowhere/*.yaml", "deeper/none/**/*.js"]) == []
    assert ssh.glob(["nowhere/*.yaml", "packages/*.yaml"]) == ["packages/a.yaml"]


def test_glob_roots():
    assert targets.glob_roots(["packages/*.yaml", "packages/local_*.yaml", "www/domosenso/**/*.js"]) == [
        "packages", "www/domosenso"]
    assert targets.glob_roots(["a/b/c.yaml", "*.yaml", "x*/y"]) == [".", "a/b/c.yaml"]


def test_put_builds_ustar_and_refuses_names_it_cannot_hold(stubs, monkeypatch):
    ssh = SshDocker(make_target("ssh-docker", stubs.config))
    long_but_splittable = "/".join(["d" * 60, "e" * 60, "f.yaml"])  # 128 bytes: ustar splits it at a slash
    ssh.put({long_but_splittable: b"ok", "zażółć/gęślą.yaml": b"utf8"})
    assert (stubs.config / long_but_splittable).read_bytes() == b"ok"
    assert (stubs.config / "zażółć/gęślą.yaml").read_bytes() == b"utf8"
    sent = []
    with monkeypatch.context() as m:
        m.setattr(targets, "_checked", lambda argv, what, timeout, stdin=None: sent.append(stdin) or b"")
        ssh.put({"a.yaml": b"x"})
    assert sent[0][:6] == b"a.yaml"
    assert sent[0][257:265] == b"ustar\x0000"  # a ustar header, not GNU ("ustar  \x00")
    before = len(stubs.calls())
    for bad in ("x" * 101, "/".join(["y" * 90] * 4) + "/f.yaml"):
        with pytest.raises(DomosensoError, match="ustar") as err:
            ssh.put({"fine.yaml": b"1", bad: b"2"})
        assert bad in str(err.value)
    assert len(stubs.calls()) == before and not (stubs.config / "fine.yaml").exists()


def test_missing_executable_is_a_domosenso_error(tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", str(tmp_path))
    with pytest.raises(DomosensoError, match="docker"):
        LocalDocker(make_target("local-docker", tmp_path)).exec(["true"])
    with pytest.raises(DomosensoError, match="ssh"):
        SshDocker(make_target("ssh-docker", tmp_path)).exec(["true"])


@pytest.mark.parametrize("bad", ["/etc/passwd", "../x.yaml", "a/../../x.yaml", "a/..", "", "/config/a.yaml", "a\0b.yaml"])
def test_paths_that_leave_config_are_rejected(io, bad):
    for call in (
        lambda: io.io.hashes([bad]),
        lambda: io.io.read(bad),
        lambda: io.io.put({bad: b"x"}),
        lambda: io.io.delete([bad]),
        lambda: io.io.glob([bad]),
    ):
        with pytest.raises(DomosensoError, match="relative"):
            call()
    assert io.calls() == []
    assert list(io.config.iterdir()) == []


def test_dotted_names_that_are_not_parent_segments_are_fine(io):
    io.io.put({"a..b.yaml": b"x", ".hidden/..cfg": b"y"})
    assert io.io.read("a..b.yaml") == b"x" and io.io.read(".hidden/..cfg") == b"y"


def test_ssh_needs_a_host(stubs):
    with pytest.raises(DomosensoError, match="host"):
        SshDocker(make_target("ssh-docker", stubs.config, host=None))


def test_open_target_picks_the_transport_by_kind(stubs):
    assert isinstance(open_target(make_target("local-docker", stubs.config)), LocalDocker)
    assert isinstance(open_target(make_target("ssh-docker", stubs.config)), SshDocker)


# FakeTarget is what deploy and rollback are tested against.


def test_fake_target_files_live_under_root(tmp_path):
    fake = FakeTarget(tmp_path)
    fake.put({"packages/a.yaml": b"1"})
    assert (tmp_path / "packages/a.yaml").read_bytes() == b"1"
    assert fake.read("packages/a.yaml") == b"1" and fake.read("x") is None
    assert fake.glob(["packages/*.yaml"]) == ["packages/a.yaml"]
    assert fake.hashes(["packages/a.yaml", "x"])["x"] is None
    fake.delete(["packages/a.yaml"])
    assert fake.glob(["packages/*"]) == []
    with pytest.raises(DomosensoError, match="relative"):
        fake.put({"../x": b"1"})


def test_fake_target_exec_and_restart_are_recorded(tmp_path):
    fake = FakeTarget(tmp_path, check_output="ERROR: boom\n")
    assert fake.exec(["python3", "-m", "homeassistant", "--script", "check_config"]) == (0, "ERROR: boom\n")
    assert fake.exec(["ls"]) == (0, "")
    fake.restart()
    fake.restart(timeout_s=5)
    assert fake.restarts == 2
    assert fake.execs == [["python3", "-m", "homeassistant", "--script", "check_config"], ["ls"]]
    assert FakeTarget(tmp_path).exec(["check_config"]) == (0, "{}")


def test_fake_target_put_can_fail_midway(tmp_path):
    fake = FakeTarget(tmp_path, fail_put_after=1)
    with pytest.raises(DomosensoError, match="interrupted"):
        fake.put({"a.yaml": b"1", "b.yaml": b"2", "c.yaml": b"3"})
    assert fake.glob(["*.yaml"]) == ["a.yaml"]
