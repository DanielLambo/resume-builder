from pathlib import Path
from contextlib import asynccontextmanager
from urllib.parse import quote
import tempfile
import shutil

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, Request, Form, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from .paths import BASE_DIR, COMPILED_DIR
from .database import init_db, get_db, get_default_template_id
from .seed_templates import JAKE_NAME
from .routers import resumes
from .services.extract import extract_text
from .services.ai import convert_resume

templates = Jinja2Templates(directory=BASE_DIR / "templates")


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
        cursor = await db.execute(
            "INSERT INTO resumes (title, latex_content) VALUES (?, ?)",
            (title, tpl["latex_content"]),
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
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        return error_redirect(
            f"Unsupported file type: {ext}. Use PDF, DOCX, TXT, or TEX."
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        extract_result = await extract_text(tmp_path, file.filename)
        if not extract_result["success"]:
            return error_redirect(extract_result["error"])

        if ext == ".tex" and "latex" in extract_result:
            async with get_db() as db:
                cursor = await db.execute(
                    "INSERT INTO resumes (title, latex_content) VALUES (?, ?)",
                    (title, extract_result["latex"]),
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
        template_latex = tpl["latex_content"] if tpl else ""

        convert_result = await convert_resume(extract_result["text"], template_latex)
        if not convert_result["success"]:
            return error_redirect(convert_result["error"])

        async with get_db() as db:
            cursor = await db.execute(
                "INSERT INTO resumes (title, latex_content) VALUES (?, ?)",
                (title, convert_result["latex_content"]),
            )
            await db.commit()
            new_id = cursor.lastrowid

        return RedirectResponse(f"/resume/{new_id}", status_code=303)

    finally:
        Path(tmp_path).unlink(missing_ok=True)
