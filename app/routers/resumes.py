import json
import re

from fastapi import APIRouter, Request, Form
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse, Response
from ..database import get_db
from ..services.latex import compile_latex, COMPILED_DIR
from ..services.ai import ai_assist
from ..templating import templates

router = APIRouter(prefix="/resume", tags=["resumes"])


def _parse_chat_history(raw) -> list:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _strip_accidental_fences(content: str) -> str:
    """Remove whole-document markdown fences without touching real LaTeX."""
    s = content.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:latex|tex)?\s*\n?", "", s, count=1, flags=re.I)
        if s.endswith("```"):
            s = s[:-3].rstrip()
    return s


@router.get("/{resume_id}")
async def editor(request: Request, resume_id: int):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM resumes WHERE id = ?", (resume_id,))
        resume = await cursor.fetchone()
    if not resume:
        return RedirectResponse("/", status_code=303)
    r = dict(resume)
    r["chat_history"] = _parse_chat_history(r.get("chat_history"))
    r["has_pdf"] = (COMPILED_DIR / f"{resume_id}.pdf").exists()
    return templates.TemplateResponse("editor.html", {"request": request, "resume": r})


@router.post("/{resume_id}/save")
async def save_resume(resume_id: int, latex_content: str = Form(...)):
    async with get_db() as db:
        cursor = await db.execute(
            "UPDATE resumes SET latex_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (latex_content, resume_id),
        )
        await db.commit()
        if cursor.rowcount == 0:
            return JSONResponse({"ok": False, "error": "Resume not found"}, status_code=404)
    return JSONResponse({"ok": True})


@router.post("/{resume_id}/title")
async def rename_resume(resume_id: int, title: str = Form(...)):
    cleaned = (title or "").strip()[:120] or "Untitled Resume"
    async with get_db() as db:
        cursor = await db.execute(
            "UPDATE resumes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (cleaned, resume_id),
        )
        await db.commit()
        if cursor.rowcount == 0:
            return JSONResponse({"ok": False, "error": "Resume not found"}, status_code=404)
    return JSONResponse({"ok": True, "title": cleaned})


@router.post("/{resume_id}/compile")
async def compile_resume(resume_id: int, latex_content: str = Form(None)):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT latex_content FROM resumes WHERE id = ?", (resume_id,)
        )
        row = await cursor.fetchone()
    if not row:
        return JSONResponse({"success": False, "error": "Resume not found"}, status_code=404)

    content = latex_content if latex_content else row["latex_content"]
    content = _strip_accidental_fences(content)

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
async def serve_pdf(resume_id: int, download: int = 0):
    pdf_path = COMPILED_DIR / f"{resume_id}.pdf"
    if not pdf_path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"resume-{resume_id}.pdf" if download else None,
        content_disposition_type="attachment" if download else "inline",
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

    history = _parse_chat_history(row["chat_history"])
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
        cursor = await db.execute(
            "UPDATE resumes SET chat_history = '[]' WHERE id = ?", (resume_id,)
        )
        await db.commit()
        if cursor.rowcount == 0:
            return JSONResponse({"ok": False, "error": "Resume not found"}, status_code=404)
    return JSONResponse({"ok": True})


@router.get("/{resume_id}/synctex")
async def get_synctex(resume_id: int):
    synctex_path = COMPILED_DIR / f"{resume_id}.synctex.json"
    if not synctex_path.exists():
        return JSONResponse({"pages": {}})
    try:
        data = json.loads(synctex_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return JSONResponse({"pages": {}})
        pages = data.get("pages") or {}
        return JSONResponse({"pages": {str(k): v for k, v in pages.items()}})
    except Exception:
        return JSONResponse({"pages": {}})


@router.post("/{resume_id}/delete")
async def delete_resume(request: Request, resume_id: int):
    async with get_db() as db:
        await db.execute("DELETE FROM resumes WHERE id = ?", (resume_id,))
        await db.commit()
    for suffix in (".pdf", ".synctex.json"):
        path = COMPILED_DIR / f"{resume_id}{suffix}"
        path.unlink(missing_ok=True)
    if request.headers.get("hx-request", "").lower() == "true":
        return Response(status_code=200)
    return RedirectResponse("/", status_code=303)


@router.get("/{resume_id}/delete")
async def delete_resume_get_blocked(resume_id: int):
    """GET delete is blocked (CSRF). Use POST."""
    return JSONResponse(
        {"ok": False, "error": "Use POST /resume/{id}/delete to delete."},
        status_code=405,
    )
