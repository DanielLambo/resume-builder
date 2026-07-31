"""Single source of truth for on-disk paths."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
COMPILED_DIR = STORAGE_DIR / "compiled"
DB_PATH = STORAGE_DIR / "resume_builder.db"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
COMPILED_DIR.mkdir(parents=True, exist_ok=True)
