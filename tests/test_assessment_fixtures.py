"""The shared assessment contract (docs/2026-11-05-shared-home-decisions.md, D1): a Python reference of
level() run over tests/fixtures/assessment.json, the same cases Pocket's cards/lib/level.js runs. The
Bridge and the Ramka's templates match this shape when they move onto the shared policy."""
import json
import math
from pathlib import Path

import pytest

FIXTURES = json.loads((Path(__file__).parent / "fixtures/assessment.json").read_text(encoding="utf-8"))
KINDS = {"range", "rising", "falling"}


def _number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def level(value, kind, limits):
    """good / fair / poor, with side low / high outside a comfort range; None when it cannot say."""
    if not _number(value) or not isinstance(limits, dict):
        return None
    if kind == "range":
        low, high = limits.get("low"), limits.get("high")
        if not (_number(low) and _number(high)):
            return None
        if value < low:
            return {"level": "poor", "side": "low"}
        if value > high:
            return {"level": "poor", "side": "high"}
        return {"level": "good"}
    if kind in ("rising", "falling"):
        fair, poor = limits.get("fair"), limits.get("poor")
        if not (_number(fair) and _number(poor)):
            return None
        worse = (lambda limit: value >= limit) if kind == "rising" else (lambda limit: value < limit)
        if worse(poor):
            return {"level": "poor"}
        if worse(fair):
            return {"level": "fair"}
        return {"level": "good"}
    return None


def test_fixture_file_shape():
    assert FIXTURES["version"] == 1
    names = [c["name"] for c in FIXTURES["cases"]]
    assert len(names) == len(set(names)), "case names are unique"
    for case in FIXTURES["cases"]:
        assert set(case) == {"name", "value", "kind", "limits", "expected"}, case["name"]
        expected = case["expected"]
        assert expected is None or (expected["level"] in {"good", "fair", "poor"}
                                    and set(expected) <= {"level", "side"}
                                    and expected.get("side", "low") in {"low", "high"}), case["name"]
    covered = {c["kind"] for c in FIXTURES["cases"] if c["expected"]}
    assert covered == KINDS, "every kind has a case with a level"


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=lambda c: c["name"])
def test_reference_level(case):
    value = math.nan if case["value"] == "NaN" else case["value"]
    assert level(value, case["kind"], case["limits"]) == case["expected"]


OPERABILITY = json.loads((Path(__file__).parent / "fixtures/operability.json").read_text(encoding="utf-8"))


def operable(state):
    """Decision D5: only a missing or unavailable entity blocks a control; unknown still acts."""
    return state is not None and state != "unavailable"


def shown(state):
    return "none" if state in (None, "unknown", "unavailable") else "value"


@pytest.mark.parametrize("case", OPERABILITY["cases"], ids=lambda c: c["name"])
def test_reference_operability(case):
    assert operable(case["state"]) == case["expected"]["operable"]
    assert shown(case["state"]) == case["expected"]["shown"]
