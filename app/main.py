"""Resumate — public, no-login resume builder.

User resumes live in the browser (IndexedDB). The server only serves the UI,
static templates, and ephemeral AI / LaTeX compile endpoints.
"""
from __future__ import annotations

import os
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .catalog import default_template_id, list_templates
from .paths import BASE_DIR, find_pdflatex
from .routers import api
from .templating import templates

PUBLIC = os.environ.get("RESUMATE_PUBLIC", "1").lower() in {"1", "true", "yes"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # No shared resume database — templates are in-memory from seed files.
    yield


_docs = None if PUBLIC else "/docs"
_redoc = None if PUBLIC else "/redoc"
_openapi = None if PUBLIC else "/openapi.json"

app = FastAPI(
    title="Resumate",
    version="3.0.0",
    lifespan=lifespan,
    docs_url=_docs,
    redoc_url=_redoc,
    openapi_url=_openapi,
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
app.include_router(api.router)


@app.get("/health")
async def health():
    pdflatex = find_pdflatex()
    return JSONResponse(
        {
            "status": "ok",
            "pdflatex": bool(pdflatex),
            "pdftotext": bool(shutil.which("pdftotext")),
            "groq_configured": bool(
                os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY")
            ),
            "storage": "browser",
        }
    )


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request, error: str | None = None):
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "templates": list_templates(),
            "default_template_id": default_template_id(),
            "error": error,
        },
    )


@app.get("/templates", response_class=HTMLResponse)
async def template_gallery(request: Request):
    return templates.TemplateResponse(
        "gallery.html",
        {
            "request": request,
            "templates": list_templates(),
            "default_template_id": default_template_id(),
        },
    )


@app.get("/edit", response_class=HTMLResponse)
@app.get("/edit/{resume_id}", response_class=HTMLResponse)
async def editor(request: Request, resume_id: str = ""):
    return templates.TemplateResponse(
        "editor.html",
        {
            "request": request,
            "resume_id": resume_id or "",
        },
    )
