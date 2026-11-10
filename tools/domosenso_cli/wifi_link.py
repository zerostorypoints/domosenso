"""The laptop's own Wi-Fi link, for `floorplan survey` (SPEC-044 S3): band, channel, signal, noise and
the access point's BSSID where the system gives it. Reads only; a missing tool or no link is `None`.

macOS first runs a small CoreWLAN helper (`wifi_link_helper.swift`, compiled with `swiftc` on first use
and cached), else `system_profiler SPAirPortDataType`. Neither gives a BSSID: macOS redacts it without
Location permission, so the survey takes the serving access point from the router's client tracker."""
from __future__ import annotations

import hashlib
import os
import platform
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

SYS_NET = Path("/sys/class/net")
HELPER_SOURCE = Path(__file__).with_name("wifi_link_helper.swift")
DEFAULT_CACHE = Path(".domosenso") / "wifi"
HELPER_BANDS = {1: "2.4", 2: "5", 3: "6"}  # CWChannelBand raw values


@dataclass(frozen=True)
class Link:
    band: str  # "2.4", "5" or "6"
    channel: int
    dbm: float
    noise: float | None
    bssid: str | None


def band_of(channel: int, hint: str | None) -> str:
    """The band of a channel. A channel number alone is ambiguous between 5 and 6 GHz (both reach 36+),
    so 6 GHz needs the hint: "6GHz" text or a frequency in MHz."""
    if hint:
        h = hint.strip().lower().replace(" ", "")
        if h in ("2ghz", "2.4ghz", "2.4"):
            return "2.4"
        if h in ("5ghz", "5"):
            return "5"
        if h in ("6ghz", "6"):
            return "6"
        if h.isdigit():
            return _band_of_mhz(int(h))
    return "2.4" if channel <= 14 else "5"


def _band_of_mhz(mhz: int) -> str:
    return "2.4" if mhz < 3000 else "6" if mhz >= 5925 else "5"


def _channel_of_mhz(mhz: int) -> int:
    if mhz == 2484:
        return 14
    if mhz < 3000:
        return (mhz - 2407) // 5
    if mhz >= 5925:
        return (mhz - 5950) // 5
    return (mhz - 5000) // 5


def parse_macos(text: str) -> Link | None:
    """`system_profiler SPAirPortDataType`: only the Current Network Information block (the other local
    networks follow it at the same indent and are ignored)."""
    block: list[str] = []
    header_indent = None
    for line in text.splitlines():
        indent = len(line) - len(line.lstrip())
        if header_indent is None:
            if line.strip() == "Current Network Information:":
                header_indent = indent
            continue
        if line.strip() and indent <= header_indent:
            break
        block.append(line)
    body = "\n".join(block)
    ch = re.search(r"Channel:\s*(\d+)\s*\(\s*([\d.]+\s*GHz)", body)
    sig = re.search(r"Signal / Noise:\s*(-?\d+)\s*dBm\s*/\s*(-?\d+)\s*dBm", body)
    if not ch or not sig:
        return None
    channel = int(ch.group(1))
    return Link(band_of(channel, ch.group(2)), channel, float(sig.group(1)), float(sig.group(2)), None)


def parse_helper(text: str) -> Link | None:
    """The CoreWLAN helper's one line: `rssi=-40 noise=-91 channel=69 band=3`, or `off`."""
    fields = dict(re.findall(r"(\w+)=(-?\d+)", text))
    try:
        rssi, noise, channel, band = (int(fields[k]) for k in ("rssi", "noise", "channel", "band"))
    except KeyError:
        return None
    if rssi == 0 or channel == 0:
        return None
    return Link(HELPER_BANDS.get(band) or band_of(channel, None), channel, float(rssi), float(noise), None)


def parse_iw(text: str) -> Link | None:
    """Linux `iw dev <if> link`; the channel comes from the frequency."""
    bssid = re.search(r"Connected to ((?:[0-9a-f]{2}:){5}[0-9a-f]{2})", text, re.I)
    freq = re.search(r"freq:\s*(\d+)", text)
    sig = re.search(r"signal:\s*(-?\d+(?:\.\d+)?)\s*dBm", text)
    if not (bssid and freq and sig):
        return None
    mhz = int(freq.group(1))
    return Link(_band_of_mhz(mhz), _channel_of_mhz(mhz), float(sig.group(1)), None, bssid.group(1).lower())


def parse_netsh(text: str) -> Link | None:
    """Windows `netsh wlan show interfaces`; the signal is a quality percentage, dBm = percent / 2 - 100."""
    def field(name: str) -> str | None:
        m = re.search(rf"^\s*{name}\s*:\s*(.+?)\s*$", text, re.I | re.M)
        return m.group(1) if m else None

    state, bssid, channel, signal = field("State"), field("BSSID"), field("Channel"), field("Signal")
    band = field("Band")  # Windows 11 only; Windows 10 has none, then the channel number decides
    if not state or state.lower() != "connected" or not (bssid and channel and signal):
        return None
    pct = re.match(r"(\d+)\s*%", signal)
    if not pct or not channel.isdigit():
        return None
    return Link(band_of(int(channel), band), int(channel), int(pct.group(1)) / 2 - 100, None, bssid.lower())


def _run(cmd: list[str], timeout: float = 15) -> str | None:
    """stdout of a successful command; None if the tool is missing, fails or hangs."""
    try:
        done = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout if done.returncode == 0 else None


def _helper_binary(cache_dir: Path) -> Path | None:
    """The compiled CoreWLAN helper, built on first use; None without swiftc or if it does not compile.
    The name carries a hash of the source, so a changed helper is rebuilt."""
    if not HELPER_SOURCE.is_file() or not shutil.which("swiftc"):
        return None
    digest = hashlib.sha256(HELPER_SOURCE.read_bytes()).hexdigest()[:10]
    binary = cache_dir / f"wifi_link_helper-{digest}"
    if binary.is_file():
        return binary
    cache_dir.mkdir(parents=True, exist_ok=True)
    # Compile to a temporary name and rename on success: a killed or timed-out compile must not leave a
    # partial binary at the final path, where the next read would reuse it.
    tmp = binary.with_name(binary.name + ".tmp")
    try:
        if _run(["swiftc", "-O", str(HELPER_SOURCE), "-o", str(tmp)], timeout=180) is None or not tmp.is_file():
            return None
        os.replace(tmp, binary)
    except OSError:
        return None
    finally:
        tmp.unlink(missing_ok=True)
    return binary


def _read_macos(interface: str | None, cache_dir: Path) -> Link | None:
    binary = _helper_binary(cache_dir)
    if binary:
        out = _run([str(binary)] + ([interface] if interface else []))
        if out is not None:
            return parse_helper(out)
    out = _run(["system_profiler", "SPAirPortDataType"], timeout=60)
    return parse_macos(out) if out else None


def read_link(system: str | None = None, interface: str | None = None, cache_dir: Path | None = None) -> Link | None:
    system = system or platform.system()
    if system == "Darwin":
        return _read_macos(interface, Path(cache_dir) if cache_dir else DEFAULT_CACHE)
    if system == "Linux":
        out = _run(["iw", "dev", interface or "wlan0", "link"])
        return parse_iw(out) if out else None
    if system == "Windows":
        out = _run(["netsh", "wlan", "show", "interfaces"])
        return parse_netsh(out) if out else None
    return None


def mac_address(interface: str | None, system: str | None = None) -> str | None:
    """The laptop's own Wi-Fi MAC, for matching it in the router's client tracker."""
    system = system or platform.system()
    if system == "Darwin":
        out = _run(["ifconfig", interface or "en0"])
        m = re.search(r"\bether\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})", out or "", re.I)
        return m.group(1).lower() if m else None
    if system == "Linux":
        try:
            return (SYS_NET / (interface or "wlan0") / "address").read_text().strip().lower() or None
        except OSError:
            return None
    if system == "Windows":
        out = _run(["netsh", "wlan", "show", "interfaces"])
        m = re.search(r"Physical address\s*:\s*((?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2})", out or "", re.I)
        return m.group(1).replace("-", ":").lower() if m else None
    return None
