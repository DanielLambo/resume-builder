"""Seed resume templates. Jake's Resume is the default for new users."""
from pathlib import Path

_SEED_DIR = Path(__file__).parent / "seed"

JAKE_NAME = "Jake's Resume"

# Personal / legacy template names purged if found in old DBs
REMOVED_TEMPLATE_NAMES = (
    "Legacy Backend",
    "Legacy AI/ML",
    "Legacy Fullstack",
)


def _load_tex(name: str) -> str:
    return (_SEED_DIR / name).read_text(encoding="utf-8")


def build_seed_templates() -> list[dict]:
    """Canonical catalog: researched, ATS-friendly layouts (no personal info)."""
    return [
        {
            "name": JAKE_NAME,
            "description": "Industry-standard ATS SWE template (r/EngineeringResumes default)",
            "latex_content": _load_tex("jakes_resume.tex"),
        },
        {
            "name": "Harvard Classic",
            "description": "Career-services style for consulting, finance, and general roles",
            "latex_content": _load_tex("harvard_classic.tex"),
        },
        {
            "name": "Modern SWE",
            "description": "Mid-level software engineer: summary, impact bullets, projects",
            "latex_content": _load_tex("modern_swe.tex"),
        },
        {
            "name": "New Grad",
            "description": "Education + projects first — internships and campus experience",
            "latex_content": _load_tex("new_grad.tex"),
        },
        {
            "name": "Data & ML",
            "description": "ML / data engineer layout with metrics and skills taxonomy",
            "latex_content": _load_tex("data_ml.tex"),
        },
        {
            "name": "Blank",
            "description": "Minimal scaffold — start from scratch",
            "latex_content": _load_tex("blank.tex"),
        },
    ]
