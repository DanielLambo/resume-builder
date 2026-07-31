import uvicorn

# Load .env once via paths bootstrap
import app.paths  # noqa: F401

if __name__ == "__main__":
    import os

    host = os.environ.get("RESUMATE_HOST", "127.0.0.1")
    port = int(os.environ.get("RESUMATE_PORT", "8000"))
    reload = os.environ.get("RESUMATE_RELOAD", "1").lower() in {"1", "true", "yes"}
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
