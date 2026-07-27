import json
from fastapi import APIRouter, Request, Form, Query
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
from ..database import get_db
from ..services.latex import compile_latex, COMPILED_DIR
from ..services.ai import ai_assist

router = APIRouter(prefix="/resume", tags=["resumes"])
templates = Jinja2Templates(directory=Path(__file__).parent.parent.parent / "templates")


@router.get("/{resume_id}")
async def editor(request: Request, resume_id: int):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM resumes WHERE id = ?", (resume_id,))
        resume = await cursor.fetchone()
    if not resume:
        return RedirectResponse("/", status_code=303)
    r = dict(resume)
    r["chat_history"] = json.loads(r.get("chat_history") or "[]")
    return templates.TemplateResponse("editor.html", {"request": request, "resume": r})


@router.post("/{resume_id}/save")
async def save_resume(resume_id: int, latex_content: str = Form(...)):
    async with get_db() as db:
        await db.execute(
            "UPDATE resumes SET latex_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (latex_content, resume_id),
        )
        await db.commit()
    return JSONResponse({"ok": True})


@router.post("/{resume_id}/compile")
async def compile_resume(resume_id: int, latex_content: str = Form(None)):
    if latex_content:
        content = latex_content
    else:
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT latex_content FROM resumes WHERE id = ?", (resume_id,)
            )
            row = await cursor.fetchone()
        if not row:
            return JSONResponse({"success": False, "error": "Resume not found"}, status_code=404)
        content = row["latex_content"]

    content = content.strip()
    if content.endswith("```"):
        content = content[:-3].rstrip()

    result = await compile_latex(resume_id, content)

    if result["success"]:
        async with get_db() as db:
            await db.execute(
                "UPDATE resumes SET compiled_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (result["pdf_path"], resume_id),
            )
            await db.commit()

    response = {
        "success": result["success"],
        "pages": result.get("pages"),
        "errors": result.get("errors", []),
    }
    if not result["success"]:
        response["error"] = result.get("error", "")
        response["hint"] = result.get("hint", "")

    return JSONResponse(response)


@router.get("/{resume_id}/pdf")
async def serve_pdf(resume_id: int):
    pdf_path = COMPILED_DIR / f"{resume_id}.pdf"
    if not pdf_path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(
        pdf_path, media_type="application/pdf",
        content_disposition_type="inline",
    )


@router.post("/{resume_id}/ai")
async def assist_ai(resume_id: int, prompt: str = Form(...)):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT latex_content, chat_history FROM resumes WHERE id = ?",
            (resume_id,),
        )
        row = await cursor.fetchone()
    if not row:
        return JSONResponse({"success": False, "error": "Resume not found"}, status_code=404)

    history = json.loads(row["chat_history"] or "[]")
    result = await ai_assist(row["latex_content"], prompt, history)

    if result["success"]:
        history.append({"role": "user", "content": prompt})
        history.append({"role": "assistant", "content": result["ai_reply"]})

        if len(history) > 40:
            history = history[-40:]

        async with get_db() as db:
            await db.execute(
                "UPDATE resumes SET latex_content = ?, chat_history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (result["latex_content"], json.dumps(history), resume_id),
            )
            await db.commit()
        result["saved"] = True
        result["history"] = history

    return JSONResponse(result)


@router.post("/{resume_id}/clear-chat")
async def clear_chat(resume_id: int):
    async with get_db() as db:
        await db.execute(
            "UPDATE resumes SET chat_history = '[]' WHERE id = ?", (resume_id,)
        )
        await db.commit()
    return JSONResponse({"ok": True})


@router.get("/{resume_id}/synctex")
async def get_synctex(resume_id: int):
    synctex_path = COMPILED_DIR / f"{resume_id}.synctex.json"
    if not synctex_path.exists():
        return JSONResponse({"pages": {}, "blocks": {}})
    try:
        data = json.loads(synctex_path.read_text(encoding="utf-8"))
        return JSONResponse(data)
    except Exception:
        return JSONResponse({"pages": {}, "blocks": {}})


@router.get("/{resume_id}/delete")
async def delete_resume(resume_id: int):
    async with get_db() as db:
        await db.execute("DELETE FROM resumes WHERE id = ?", (resume_id,))
        await db.commit()
    return RedirectResponse("/", status_code=303)
