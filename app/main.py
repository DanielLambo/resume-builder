from fastapi import FastAPI, Request, Form, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
from contextlib import asynccontextmanager
import tempfile
import shutil

from .database import init_db, get_db
from .routers import resumes
from .services.extract import extract_text
from .services.ai import convert_resume

BASE_DIR = Path(__file__).parent.parent
templates = Jinja2Templates(directory=BASE_DIR / "templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Resumate", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
app.include_router(resumes.router)


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request, error: str = None):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM resumes ORDER BY updated_at DESC")
        resumes_list = await cursor.fetchall()
        cursor = await db.execute("SELECT id, name FROM templates ORDER BY id")
        tpl_list = await cursor.fetchall()
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "resumes": [dict(r) for r in resumes_list],
         "templates": [dict(t) for t in tpl_list], "error": error},
    )


@app.get("/templates", response_class=HTMLResponse)
async def template_gallery(request: Request):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM templates ORDER BY id")
        tpl_list = await cursor.fetchall()
    return templates.TemplateResponse(
        "gallery.html",
        {"request": request, "templates": [dict(t) for t in tpl_list]},
    )


@app.post("/resume/new")
async def create_resume(template_id: int = Form(...), title: str = Form("Untitled Resume")):
    async with get_db() as db:
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


@app.post("/upload", response_class=HTMLResponse)
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form("Uploaded Resume"),
    template_id: int = Form(1),
):
    allowed = {".pdf", ".docx", ".txt", ".tex"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        return templates.TemplateResponse("dashboard.html", {
            "request": request,
            "resumes": [],
            "error": f"Unsupported file type: {ext}. Use PDF, DOCX, TXT, or TEX.",
        })

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        extract_result = await extract_text(tmp_path, file.filename)
        if not extract_result["success"]:
            return templates.TemplateResponse("dashboard.html", {
                "request": request,
                "resumes": [],
                "error": extract_result["error"],
            })

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
            cursor = await db.execute(
                "SELECT latex_content FROM templates WHERE id = ?", (template_id,)
            )
            tpl = await cursor.fetchone()
        template_latex = tpl["latex_content"] if tpl else ""

        convert_result = await convert_resume(extract_result["text"], template_latex)
        if not convert_result["success"]:
            return templates.TemplateResponse("dashboard.html", {
                "request": request,
                "resumes": [],
                "error": convert_result["error"],
            })

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
