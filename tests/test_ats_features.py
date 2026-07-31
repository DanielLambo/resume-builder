"""ATS heuristics, page-fit, sanitize, section mapping."""
from app.services.ats import analyze_ats, metric_nudges
from app.services.latex import auto_page_fit, sanitize_latex, section_at_line
from tests.conftest import SAMPLE_LATEX


def test_sanitize_blocks_write18():
    bad = SAMPLE_LATEX.replace(
        "\\begin{document}",
        "\\begin{document}\n\\write18{rm -rf /}",
    )
    result = sanitize_latex(bad)
    assert result["ok"] is False
    assert "write18" in result["error"].lower()


def test_sanitize_allows_normal():
    assert sanitize_latex(SAMPLE_LATEX)["ok"] is True


def test_auto_page_fit_tightens_geometry():
    out = auto_page_fit(SAMPLE_LATEX, aggressiveness=2)
    assert "margin=0.45in" in out or "10pt" in out


def test_section_at_line():
    lines = SAMPLE_LATEX.splitlines()
    # Find Experience section line
    exp_line = next(i for i, ln in enumerate(lines, 1) if "Experience" in ln and "section" in ln.lower())
    assert section_at_line(SAMPLE_LATEX, exp_line + 2) == "Experience"


def test_ats_score_sample():
    report = analyze_ats(SAMPLE_LATEX)
    assert 35 <= report["score"] <= 100
    assert "Experience" in report["sections"] or report["bullet_count"] > 0


def test_metric_nudges_finds_bare_bullets():
    latex = SAMPLE_LATEX.replace(
        "Shipped internal tooling used by 12 engineers.",
        "Shipped internal tooling for the team.",
    )
    nudges = metric_nudges(latex)
    assert any("internal tooling" in n["bullet"] for n in nudges)
