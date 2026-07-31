"""LaTeX compact format invariants — the heart of AI editing."""
from app.services.latex import (
    apply_ai_body,
    apply_compact_sections,
    latex_to_compact,
    parse_log_errors,
)
from tests.conftest import SAMPLE_LATEX


def test_identity_round_trip():
    compact = latex_to_compact(SAMPLE_LATEX)
    restored = apply_compact_sections(SAMPLE_LATEX, compact)
    assert restored == SAMPLE_LATEX


def test_compact_contains_sections():
    compact = latex_to_compact(SAMPLE_LATEX)
    assert "SECTION Summary" in compact
    assert "SECTION Experience" in compact
    assert "SECTION Education" in compact
    assert "SECTION Skills" in compact
    assert "@TITLE" in compact or "@COMPANY" in compact
    assert "- Built payment APIs" in compact


def test_apply_compact_sections_updates_one_section():
    edited = (
        "SECTION Summary\n"
        "Senior backend engineer — APIs, data stores, reliability.\n"
    )
    result = apply_compact_sections(SAMPLE_LATEX, edited)
    assert "Senior backend engineer" in result
    assert "Built payment APIs serving 10K" in result  # Experience untouched
    assert "\\newcommand{\\resumesection}" in result  # preamble preserved


def test_apply_compact_sections_noop_on_unknown_section():
    result = apply_compact_sections(SAMPLE_LATEX, "SECTION DoesNotExist\nfoo\n")
    assert result == SAMPLE_LATEX


def test_apply_ai_body_preserves_preamble():
    ai_doc = SAMPLE_LATEX.replace(
        "Backend engineer focused on APIs and reliability.",
        "Platform engineer who ships reliable services.",
    )
    # Pretend AI also mangled the preamble color
    ai_mangled = ai_doc.replace("{1a365d}", "{ff0000}")
    result = apply_ai_body(SAMPLE_LATEX, ai_mangled)
    assert "{1a365d}" in result  # original preamble kept
    assert "Platform engineer who ships reliable services." in result
    assert "{ff0000}" not in result


def test_parse_log_errors_extracts_line():
    log = "! Undefined control sequence.\nl.42 \\boguscmd\n"
    errors = parse_log_errors(log)
    assert len(errors) == 1
    assert errors[0]["line"] == 42
    assert "Undefined control sequence" in errors[0]["message"]


def test_parse_synctex_top_origin_and_string_keys():
    from app.services.latex import parse_synctex_text

    sample = "\n".join([
        "SyncTeX Version:1",
        "Input:1:/tmp/resumate/resume_1.tex",
        "Input:2:/usr/local/texlive/texmf-dist/tex/latex/base/article.cls",
        "Output:1",
        "Page:1",
        "x1,42:3276800,3604480",  # 50pt, 55pt
        "g1,50:6553600,13107200",  # 100pt, 200pt
        "x2,999:100,100",  # class file — should be skipped
        "",
    ])
    data = parse_synctex_text(sample)
    assert "1" in data["pages"]
    hits = data["pages"]["1"]
    assert len(hits) == 2
    assert hits[0]["line"] == 42
    assert abs(hits[0]["x"] - 50.0) < 0.01
    assert abs(hits[0]["y"] - 55.0) < 0.01
    assert hits[1]["line"] == 50
    assert all(h["line"] != 999 for h in hits)
