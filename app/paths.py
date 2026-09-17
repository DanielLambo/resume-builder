"""On-disk paths and env bootstrap. User resumes are NOT stored here."""
import shutil
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Ephemeral compile scratch only (TemporaryDirectory is preferred; this dir is unused by default)
STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# MacTex installs pdflatex here but doesn't always put it on PATH.
MACTEX_BIN_DIR = Path("/Library/TeX/texbin")


def find_pdflatex() -> str | None:
    return shutil.which("pdflatex") or (
        str(MACTEX_BIN_DIR / "pdflatex") if (MACTEX_BIN_DIR / "pdflatex").exists() else None
    )
