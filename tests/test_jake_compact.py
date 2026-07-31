"""Jake's Resume template — list wrappers must survive compact rebuilds."""
from pathlib import Path

from app.services.latex import apply_compact_sections, latex_to_compact

JAKE = (Path(__file__).resolve().parents[1] / "app" / "seed" / "jakes_resume.tex").read_text(
    encoding="utf-8"
)


def test_jake_education_rename_keeps_list_wrappers():
    edited = (
        "SECTION Education\n"
        "@COMPANY Alabama A \\& M University\n"
        "@LOC Normal, AL\n"
        "@ROLE Bachelor of Arts in Computer Science, Minor in Business\n"
        "@DATES Aug. 2018 -- May 2021\n"
        "@COMPANY Blinn College\n"
        "@LOC Bryan, TX\n"
        "@ROLE Associate's in Liberal Arts\n"
        "@DATES Aug. 2014 -- May 2018\n"
    )
    result = apply_compact_sections(JAKE, edited)
    edu = result.split("\\section{Experience}")[0]
    assert "Alabama A \\& M University" in edu
    assert "Blinn College" in edu
    assert "Southwestern University" not in edu
    assert "\\resumeSubHeadingListStart" in edu
    assert "\\resumeSubHeadingListEnd" in edu


def test_jake_experience_rebuild_wraps_items():
    compact = latex_to_compact(JAKE)
    # Re-apply the Experience section from compact (identity-ish)
    exp_start = compact.index("SECTION Experience")
    exp_end = compact.index("SECTION Projects")
    exp_compact = compact[exp_start:exp_end]
    # Rename employer in compact
    exp_compact = exp_compact.replace("Southwestern University", "Alabama A \\& M University")
    result = apply_compact_sections(JAKE, exp_compact)
    exp = result.split("\\section{Projects}")[0].split("\\section{Experience}")[1]
    assert "\\resumeSubHeadingListStart" in exp
    assert "\\resumeSubHeadingListEnd" in exp
    assert "\\resumeItemListStart" in exp
    assert "\\resumeItemListEnd" in exp
    assert "\\resumeItem{" in exp
    assert "Alabama A \\& M University" in exp
    # Bare \\item without list start would be a lonely-item failure mode
    assert exp.count("\\resumeItemListStart") >= 1


def test_simple_rename_alabama_not_southwestern():
    from app.services.ai import _try_simple_rename

    result = _try_simple_rename(JAKE, "im in alabama a and m not southwestern")
    assert result is not None
    assert result["success"] is True
    assert "Alabama A \\& M" in result["latex_content"]
    assert "Southwestern University" not in result["latex_content"]
    # Surgical rename must not strip Jake list wrappers
    assert "\\resumeSubHeadingListStart" in result["latex_content"]
    assert "\\resumeItemListStart" in result["latex_content"]


def test_simple_rename_ignores_polish_alias_prose():
    from app.services.ai import _try_simple_rename

    # Expanded aliases contain "Do not invent…" — must not trigger rename
    assert _try_simple_rename(JAKE, "polish") is None
