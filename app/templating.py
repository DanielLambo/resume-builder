"""Shared Jinja templates + cache-busting for static assets."""
from pathlib import Path
from fastapi.templating import Jinja2Templates

from app.paths import BASE_DIR

templates = Jinja2Templates(directory=BASE_DIR / "templates")

_css = BASE_DIR / "app" / "static" / "css" / "style.css"
_js = BASE_DIR / "app" / "static" / "js" / "app.js"


class _AssetVer:
    """Stringifies to current CSS/JS mtime so cache-bust updates without restart."""

    def __str__(self) -> str:
        return str(
            max(
                int(_css.stat().st_mtime) if _css.exists() else 0,
                int(_js.stat().st_mtime) if _js.exists() else 0,
            )
        )

    def __html__(self) -> str:
        return str(self)


templates.env.globals["asset_ver"] = _AssetVer()
