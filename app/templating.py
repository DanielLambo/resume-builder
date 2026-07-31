"""Shared Jinja templates + cache-busting for static assets."""
from fastapi.templating import Jinja2Templates

from app.paths import BASE_DIR

templates = Jinja2Templates(directory=BASE_DIR / "templates")

_ASSET_PATHS = [
    BASE_DIR / "app" / "static" / "css" / "style.css",
    BASE_DIR / "app" / "static" / "js" / "app.js",
    BASE_DIR / "app" / "static" / "js" / "store.js",
    BASE_DIR / "app" / "static" / "js" / "library.js",
    BASE_DIR / "app" / "static" / "js" / "upload.js",
]


class _AssetVer:
    """Stringifies to current CSS/JS mtime so cache-bust updates without restart."""

    def __str__(self) -> str:
        return str(
            max(
                (int(p.stat().st_mtime) if p.exists() else 0 for p in _ASSET_PATHS),
                default=0,
            )
        )

    def __html__(self) -> str:
        return str(self)


templates.env.globals["asset_ver"] = _AssetVer()
