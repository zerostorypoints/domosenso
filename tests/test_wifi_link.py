"""Wi-Fi link readers (SPEC-044 S3): parsers on fixtures, dispatch and helper caching with
subprocess stubbed. No real system tool is called."""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from domosenso_cli import wifi_link
from domosenso_cli.wifi_link import (Link, band_of, mac_address, parse_helper, parse_iw,
                                     parse_macos, parse_netsh, read_link)

FIX = Path(__file__).parent / "fixtures" / "wifi"


def fx(name: str) -> str:
    return (FIX / name).read_text()


def test_band_of():
    assert band_of(1, None) == "2.4"
    assert band_of(36, None) == "5"
    assert band_of(69, "6GHz") == "6"
    assert band_of(69, None) == "5"  # no hint: a channel number alone is ambiguous, 5 GHz wins
    assert band_of(5, "2GHz") == "2.4"
    assert band_of(0, "5955") == "6"  # a frequency in MHz


def test_parse_macos_5ghz_current_block_only():
    assert parse_macos(fx("macos_system_profiler.txt")) == Link("5", 36, -58.0, -92.0, None)


def test_parse_macos_6ghz():
    assert parse_macos(fx("macos_system_profiler_6ghz.txt")) == Link("6", 69, -43.0, -92.0, None)


def test_parse_macos_2ghz():
    text = fx("macos_system_profiler.txt").replace("Channel: 36 (5GHz, 80MHz)", "Channel: 1 (2GHz, 20MHz)")
    assert parse_macos(text).band == "2.4"


def test_parse_macos_off():
    assert parse_macos(fx("macos_system_profiler_off.txt")) is None
    assert parse_macos("") is None


def test_parse_iw():
    assert parse_iw(fx("linux_iw_link.txt")) == Link("5", 36, -58.0, None, "02:00:00:00:00:01")


def test_parse_iw_frequencies():
    base = fx("linux_iw_link.txt")
    assert parse_iw(base.replace("5180", "2412")).band == "2.4"
    assert parse_iw(base.replace("5180", "2412")).channel == 1
    link = parse_iw(base.replace("5180", "5975"))
    assert (link.band, link.channel) == ("6", 5)
    assert parse_iw(base.replace("5180", "2484")).channel == 14


def test_parse_iw_off():
    assert parse_iw(fx("linux_iw_link_off.txt")) is None


def test_parse_netsh():
    assert parse_netsh(fx("windows_netsh.txt")) == Link("5", 36, -58.0, None, "02:00:00:00:00:01")


def test_parse_netsh_band_line():
    six = parse_netsh(fx("windows_netsh_6ghz.txt"))
    assert (six.band, six.channel) == ("6", 37)
    assert parse_netsh(fx("windows_netsh_5ghz.txt")).band == "5"


def test_parse_netsh_off():
    assert parse_netsh(fx("windows_netsh_off.txt")) is None


def test_parse_helper():
    assert parse_helper("rssi=-40 noise=-91 channel=69 band=3\n") == Link("6", 69, -40.0, -91.0, None)
    assert parse_helper("rssi=-61 noise=-90 channel=6 band=1") == Link("2.4", 6, -61.0, -90.0, None)
    assert parse_helper("rssi=-55 noise=-90 channel=44 band=2").band == "5"


def test_parse_helper_off_or_garbage():
    assert parse_helper("off\n") is None
    assert parse_helper("") is None
    assert parse_helper("rssi=0 noise=0 channel=0 band=0") is None  # no link


def completed(stdout: str, code: int = 0) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], code, stdout=stdout, stderr="")


def test_read_link_linux(monkeypatch):
    calls = []

    def run(cmd, **kw):
        calls.append(cmd)
        return completed(fx("linux_iw_link.txt"))

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    assert read_link("Linux", "wlan0").channel == 36
    assert calls == [["iw", "dev", "wlan0", "link"]]


def test_read_link_windows(monkeypatch):
    monkeypatch.setattr(wifi_link.subprocess, "run", lambda cmd, **kw: completed(fx("windows_netsh.txt")))
    assert read_link("Windows").dbm == -58.0


def test_read_link_missing_tool_is_none(monkeypatch):
    def run(cmd, **kw):
        raise FileNotFoundError(cmd[0])

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    assert read_link("Linux", "wlan0") is None
    assert read_link("Windows") is None


def test_read_link_unknown_system():
    assert read_link("Plan9") is None


def test_read_link_macos_uses_helper_and_caches(monkeypatch, tmp_path):
    calls = []

    def run(cmd, **kw):
        calls.append(cmd)
        if cmd[0] == "swiftc":
            Path(cmd[cmd.index("-o") + 1]).write_text("binary")
            return completed("")
        return completed("rssi=-40 noise=-91 channel=69 band=3\n")

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    monkeypatch.setattr(wifi_link.shutil, "which", lambda name: "/usr/bin/" + name)
    link = read_link("Darwin", cache_dir=tmp_path)
    assert link == Link("6", 69, -40.0, -91.0, None)
    assert read_link("Darwin", cache_dir=tmp_path) == link
    assert [c[0] for c in calls].count("swiftc") == 1  # compiled once, cached for the second read


def test_read_link_macos_falls_back_without_swiftc(monkeypatch, tmp_path):
    calls = []

    def run(cmd, **kw):
        calls.append(cmd)
        return completed(fx("macos_system_profiler.txt"))

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    monkeypatch.setattr(wifi_link.shutil, "which", lambda name: None)
    assert read_link("Darwin", cache_dir=tmp_path).channel == 36
    assert calls == [["system_profiler", "SPAirPortDataType"]]


def test_read_link_macos_falls_back_when_compile_fails(monkeypatch, tmp_path):
    calls = []

    def run(cmd, **kw):
        calls.append(cmd[0])
        if cmd[0] == "swiftc":
            return completed("", 1)
        return completed(fx("macos_system_profiler_6ghz.txt"))

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    monkeypatch.setattr(wifi_link.shutil, "which", lambda name: "/usr/bin/" + name)
    assert read_link("Darwin", cache_dir=tmp_path).band == "6"
    assert calls == ["swiftc", "system_profiler"]


def test_failed_compile_leaves_no_binary(monkeypatch, tmp_path):
    def run(cmd, **kw):
        Path(cmd[cmd.index("-o") + 1]).write_text("partial")
        return completed("", 1)

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    monkeypatch.setattr(wifi_link.shutil, "which", lambda name: "/usr/bin/" + name)
    assert wifi_link._helper_binary(tmp_path) is None
    assert list(tmp_path.iterdir()) == []


def test_read_link_macos_helper_off_means_none(monkeypatch, tmp_path):
    def run(cmd, **kw):
        if cmd[0] == "swiftc":
            Path(cmd[cmd.index("-o") + 1]).write_text("binary")
            return completed("")
        return completed("off\n")

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    monkeypatch.setattr(wifi_link.shutil, "which", lambda name: "/usr/bin/" + name)
    assert read_link("Darwin", cache_dir=tmp_path) is None


def test_helper_source_ships_in_the_package():
    src = Path(wifi_link.__file__).with_name("wifi_link_helper.swift")
    assert "CoreWLAN" in src.read_text()


@pytest.mark.parametrize("system,out,expected", [
    ("Darwin", "en0: flags=8863<UP>\n\tether 02:00:00:00:00:aa\n\tinet 192.0.2.5\n", "02:00:00:00:00:aa"),
    ("Windows", fx("windows_netsh.txt"), "02:00:00:00:00:bb"),
])
def test_mac_address_from_tools(monkeypatch, system, out, expected):
    monkeypatch.setattr(wifi_link.subprocess, "run", lambda cmd, **kw: completed(out))
    assert mac_address(None, system=system) == expected


def test_mac_address_linux_sysfs(monkeypatch, tmp_path):
    (tmp_path / "wlan0").mkdir()
    (tmp_path / "wlan0" / "address").write_text("02:00:00:00:00:cc\n")
    monkeypatch.setattr(wifi_link, "SYS_NET", tmp_path)
    assert mac_address("wlan0", system="Linux") == "02:00:00:00:00:cc"
    assert mac_address("wlan9", system="Linux") is None


def test_mac_address_missing_tool(monkeypatch):
    def run(cmd, **kw):
        raise FileNotFoundError(cmd[0])

    monkeypatch.setattr(wifi_link.subprocess, "run", run)
    assert mac_address("en0", system="Darwin") is None
