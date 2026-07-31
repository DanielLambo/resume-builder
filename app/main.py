from pathlib import Path
from contextlib import asynccontextmanager
from urllib.parse import quote
import os
import shutil
import tempfile

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, Request, Form, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse

from .paths import BASE_DIR, COMPILED_DIR
from .database import init_db, get_db, get_default_template_id
from .seed_templates import JAKE_NAME
from .templating import templates
from .routers import resumes
from .services.extract import extract_text
from .services.ai import convert_resume

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Resumate", version="2.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
app.include_router(resumes.router)


def _resume_rows(rows):
    out = []
    for r in rows:
        d = dict(r)
        d["has_pdf"] = (COMPILED_DIR / f"{d['id']}.pdf").exists()
        out.append(d)
    return out


@app.get("/health")
async def health():
    """Readiness probe: DB reachable + optional tool presence."""
    pdflatex = shutil.which("pdflatex")
    if not pdflatex and Path("/Library/TeX/texbin/pdflatex").exists():
        pdflatex = "/Library/TeX/texbin/pdflatex"
    pdftotext = shutil.which("pdftotext")
    groq = bool(os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY"))
    db_ok = False
    try:
        async with get_db() as db:
            await db.execute("SELECT 1")
            db_ok = True
    except Exception:
        db_ok = False
    status = "ok" if db_ok else "degraded"
    return JSONResponse(
        {
            "status": status,
            "db": db_ok,
            "pdflatex": bool(pdflatex),
            "pdftotext": bool(pdftotext),
            "groq_configured": groq,
        }
    )


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request, error: str = None):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM resumes ORDER BY updated_at DESC")
        resumes_list = await cursor.fetchall()
        cursor = await db.execute(
            "SELECT id, name FROM templates ORDER BY (name = ?) DESC, id", (JAKE_NAME,)
        )
        tpl_list = await cursor.fetchall()
        default_tpl = await get_default_template_id(db)
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "resumes": _resume_rows(resumes_list),
            "templates": [dict(t) for t in tpl_list],
            "default_template_id": default_tpl,
            "error": error,
        },
    )


@app.get("/templates", response_class=HTMLResponse)
async def template_gallery(request: Request):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM templates ORDER BY (name = ?) DESC, id", (JAKE_NAME,)
        )
        tpl_list = await cursor.fetchall()
        default_tpl = await get_default_template_id(db)
    return templates.TemplateResponse(
        "gallery.html",
        {
            "request": request,
            "templates": [dict(t) for t in tpl_list],
            "default_template_id": default_tpl,
        },
    )


@app.post("/resume/new")
async def create_resume(template_id: int = Form(None), title: str = Form("Untitled Resume")):
    async with get_db() as db:
        if template_id is None:
            template_id = await get_default_template_id(db)
        cursor = await db.execute(
            "SELECT latex_content FROM templates WHERE id = ?", (template_id,)
        )
        tpl = await cursor.fetchone()
        if not tpl:
            return RedirectResponse("/templates", status_code=303)
        cleaned_title = (title or "").strip()[:120] or "Untitled Resume"
        cursor = await db.execute(
            "INSERT INTO resumes (title, latex_content) VALUES (?, ?)",
            (cleaned_title, tpl["latex_content"]),
        )
        await db.commit()
        new_id = cursor.lastrowid
    return RedirectResponse(f"/resume/{new_id}", status_code=303)


@app.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    title: str = Form("Uploaded Resume"),
    template_id: int = Form(None),
):
    def error_redirect(msg: str) -> RedirectResponse:
        return RedirectResponse(f"/?error={quote(msg)}", status_code=303)

    allowed = {".pdf", ".docx", ".txt", ".tex"}
    filename = file.filename or "upload.bin"
    ext = Path(filename).suffix.lower()
    if ext not in allowed:
        return error_redirect(
            f"Unsupported file type: {ext}. Use PDF, DOCX, TXT, or TEX."
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp_path = tmp.name
            size = 0
            while True:
                chunk = await file.read(256 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    return error_redirect("File too large (max 10 MB).")
                tmp.write(chunk)

        extract_result = await extract_text(tmp_path, filename)
        if not extract_result["success"]:
            return error_redirect(extract_result["error"])

        cleaned_title = (title or "").strip()[:120] or "Uploaded Resume"

        if ext == ".tex" and "latex" in extract_result:
            async with get_db() as db:
                cursor = await db.execute(
                    "INSERT INTO resumes (title, latex_content) VALUES (?, ?)",
                    (cleaned_title, extract_result["latex"]),
                )
                await db.commit()
                new_id = cursor.lastrowid
            return RedirectResponse(f"/resume/{new_id}", status_code=303)

        async with get_db() as db:
            if template_id is None:
                template_id = await get_default_template_id(db)
            cursor = await db.execute(
                "SELECT latex_content FROM templates WHERE id = ?", (template_id,)
            )
            tpl = await cursor.fetchone()
        if not tpl:
            return error_redirect("Template not found. Pick a template and try again.")

        convert_result = await convert_resume(extract_result["text"], tpl["latex_content"])
        if not convert_result["success"]:
            return error_redirect(convert_result["error"])

        async with get_db() as db:
            cursor = await db.execute(
                "INSERT INTO resumes (title, latex_content) VALUES (?, ?)",
                (cleaned_title, convert_result["latex_content"]),
            )
            await db.commit()
            new_id = cursor.lastrowid

        return RedirectResponse(f"/resume/{new_id}", status_code=303)

    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
