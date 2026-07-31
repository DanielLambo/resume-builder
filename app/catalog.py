"""Static template catalog — no user data, safe to share across visitors."""
from __future__ import annotations

from .seed_templates import JAKE_NAME, build_seed_templates

# Stable list loaded once at import. IDs are indices into this list.
_TEMPLATES: list[dict] = build_seed_templates()


def list_templates() -> list[dict]:
    out = []
    for i, t in enumerate(_TEMPLATES):
        out.append(
            {
                "id": i,
                "name": t["name"],
                "description": t.get("description", ""),
                "is_default": t["name"] == JAKE_NAME,
            }
        )
    # Jake first
    out.sort(key=lambda x: (0 if x["is_default"] else 1, x["id"]))
    return out


def get_template(template_id: int) -> dict | None:
    if template_id is None or template_id < 0 or template_id >= len(_TEMPLATES):
        return None
    t = _TEMPLATES[template_id]
    return {
        "id": template_id,
        "name": t["name"],
        "description": t.get("description", ""),
        "latex_content": t["latex_content"],
        "is_default": t["name"] == JAKE_NAME,
    }


def default_template_id() -> int:
    for i, t in enumerate(_TEMPLATES):
        if t["name"] == JAKE_NAME:
            return i
    return 0
