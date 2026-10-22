from domosenso_cli.stamps import Stamp, body, parse, stamp


def test_stamp_exact():
    assert stamp("ramka", "0.1.1", "a535d00") == "# Rendered by Domosenso from ramka/0.1.1 (a535d00) — do not edit\n"
    assert stamp("ramka", "0.1.1", "a535d00", dirty=True) == (
        "# Rendered by Domosenso from ramka/0.1.1 (a535d00-dirty) — do not edit\n")


def test_parse_new():
    assert parse(stamp("ramka", "0.1.1", "a535d00")) == Stamp("ramka", "0.1.1", "a535d00", False)
    assert parse(stamp("ramka", "0.1.1", "a535d00", dirty=True)) == Stamp("ramka", "0.1.1", "a535d00", True)
    long = "a" * 40
    assert parse(stamp("home-sensors", "1.20.3", long)) == Stamp("home-sensors", "1.20.3", long, False)


def test_parse_old():
    line = "# Rendered by Domosenso from ramka@a535d00 — do not edit"
    assert parse(line) == Stamp("ramka", None, "a535d00", False)
    assert parse(line + "\n") == Stamp("ramka", None, "a535d00", False)


def test_parse_old_dirty():
    line = "# Rendered by Domosenso from ramka@a535d00-dirty — do not edit"
    assert parse(line) == Stamp("ramka", None, "a535d00", True)


def test_parse_other_line_is_none():
    for line in [
        "",
        "homeassistant:",
        "# Rendered by hand from ramka/0.1.1 (a535d00) — do not edit",
        "# Rendered by Domosenso from ramka/0.1.1 (xyz) — do not edit",
        "# Rendered by Domosenso from ramka/0.1.1 (a535d) — do not edit",  # fewer than 7 hex
        "# Rendered by Domosenso from ramka@a535d00 — edit freely",
        f"# Rendered by Domosenso from ramka/0.1.1 ({'a' * 41}) — do not edit",  # more than 40 hex
        "# Rendered by Domosenso from ramka/0.1.1 (A535D00) — do not edit",  # upper case hex
        "# Rendered by Domosenso from ramka@A535D00 — do not edit",
    ]:
        assert parse(line) is None, line


def test_body_strips_only_stamp():
    rest = "homeassistant:\n  name: x\n"
    assert body(stamp("ramka", "0.1.1", "a535d00") + rest) == rest
    assert body("# Rendered by Domosenso from ramka@a535d00-dirty — do not edit\n" + rest) == rest
    assert body(rest) == rest
    # a comment that is not a stamp stays
    assert body("# a comment\n" + rest) == "# a comment\n" + rest
    # a stamp-like line that is not first stays
    later = rest + stamp("ramka", "0.1.1", "a535d00")
    assert body(later) == later
    assert body("") == ""
    assert body(stamp("ramka", "0.1.1", "a535d00")) == ""
