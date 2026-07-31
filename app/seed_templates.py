"""Seed resume templates. Jake's Resume is the default for new users."""
from pathlib import Path

_SEED_DIR = Path(__file__).parent / "seed"

JAKE_NAME = "Jake's Resume"


def _load_tex(name: str) -> str:
    return (_SEED_DIR / name).read_text(encoding="utf-8")


def build_seed_templates(existing: list[dict] | None = None) -> list[dict]:
    """Return seed list with Jake's Resume first, then any other built-ins."""
    jake = {
        "name": JAKE_NAME,
        "description": "The classic ATS-friendly SWE template (default)",
        "latex_content": _load_tex("jakes_resume.tex"),
    }
    others = existing or []
    # Drop any prior Jake entry so we don't duplicate when re-seeding
    others = [t for t in others if t.get("name") != JAKE_NAME]
    return [jake, *others]
