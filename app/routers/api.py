"""Stateless public API — no user resumes stored on the server."""
from __future__ import annotations

import base64
import re
import secrets
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from ..catalog import default_template_id, get_template, list_templates
from ..rate_limit import AI_LIMIT, COMPILE_LIMIT, UPLOAD_LIMIT, client_ip
from ..services.ai import ai_assist, convert_resume
from ..services.ats import analyze_ats, metric_nudges
from ..services.extract import extract_text
from ..services.latex import compile_latex, section_at_line

router = APIRouter(prefix="/api", tags=["api"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_LATEX_CHARS = 400_000


def _strip_fences(content: str) -> str:
    s = (content or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:latex|tex)?\s*\n?", "", s, count=1, flags=re.I)
        if s.endswith("```"):
            s = s[:-3].rstrip()
    return s


def _too_large(latex: str) -> bool:
    return len(latex or "") > MAX_LATEX_CHARS


@router.get("/templates")
async def api_templates():
    return JSONResponse({"templates": list_templates(), "default_id": default_template_id()})


@router.get("/templates/{template_id}")
async def api_template(template_id: int):
    tpl = get_template(template_id)
    if not tpl:
        return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse(tpl)


@router.post("/compile")
async def api_compile(
    request: Request,
    latex_content: str = Form(...),
    job_id: str = Form(""),
    auto_fit: int = Form(0),
):
    if not COMPILE_LIMIT.allow(client_ip(request)):
        return JSONResponse({"success": False, "error": "Too many compiles — wait a minute."}, status_code=429)

    content = _strip_fences(latex_content)
    if _too_large(content):
        return JSONResponse({"success": False, "error": "Resume source is too large."}, status_code=413)

    jid = (job_id or "").strip() or secrets.token_hex(6)
    result = await compile_latex(jid, content, auto_fit=bool(auto_fit), max_pages=1)

    response = {
        "success": result.get("success", False),
        "pages": result.get("pages"),
        "errors": result.get("errors", []),
        "auto_fit_level": result.get("auto_fit_level"),
        "synctex": result.get("synctex") or {"pages": {}},
    }
    if result.get("latex_content") and result.get("auto_fit_level"):
        response["latex_content"] = result["latex_content"]
    if result.get("success") and result.get("pdf_bytes"):
        response["pdf_base64"] = base64.b64encode(result["pdf_bytes"]).decode("ascii")
    if not result.get("success"):
        response["error"] = result.get("error", "")
        response["hint"] = result.get("hint", "")
    return JSONResponse(response)


@router.post("/ai")
async def api_ai(
    request: Request,
    latex_content: str = Form(...),
    prompt: str = Form(...),
    history: str = Form("[]"),
):
    if not AI_LIMIT.allow(client_ip(request)):
        return JSONResponse(
            {"success": False, "error": "Too many AI requests — wait a minute."},
            status_code=429,
        )

    content = _strip_fences(latex_content)
    if _too_large(content):
        return JSONResponse({"success": False, "error": "Resume source is too large."}, status_code=413)

    try:
        hist = __import__("json").loads(history or "[]")
        if not isinstance(hist, list):
            hist = []
    except Exception:
        hist = []
    # Cap history size sent to the model
    hist = hist[-8:]

    result = await ai_assist(content, prompt, hist)
    # Never echo full history from server storage — client owns it
    out = {
        "success": result.get("success", False),
        "ai_reply": result.get("ai_reply", ""),
        "user_message": result.get("user_message", prompt),
    }
    if result.get("success"):
        out["latex_content"] = result.get("latex_content", content)
    else:
        out["error"] = result.get("error", "AI request failed")
    return JSONResponse(out)


@router.post("/ats")
async def api_ats(latex_content: str = Form(...)):
    content = _strip_fences(latex_content)
    if _too_large(content):
        return JSONResponse({"error": "Resume source is too large."}, status_code=413)
    report = analyze_ats(content)
    report["metric_nudges"] = metric_nudges(content)
    return JSONResponse(report)


@router.post("/section-at")
async def api_section_at(latex_content: str = Form(...), line: int = Form(1)):
    content = _strip_fences(latex_content)
    name = section_at_line(content, line)
    return JSONResponse({"line": line, "section": name})


@router.post("/convert")
async def api_convert(
    request: Request,
    file: UploadFile = File(...),
    template_id: int = Form(None),
    title: str = Form(""),
):
    if not UPLOAD_LIMIT.allow(client_ip(request)):
        return JSONResponse({"success": False, "error": "Too many uploads — wait a minute."}, status_code=429)

    allowed = {".pdf", ".docx", ".txt", ".tex"}
    filename = file.filename or "upload.bin"
    ext = Path(filename).suffix.lower()
    if ext not in allowed:
        return JSONResponse(
            {"success": False, "error": f"Unsupported type {ext}. Use PDF, DOCX, TXT, or TEX."},
            status_code=400,
        )

    cleaned_title = (title or "").strip()[:120] or Path(filename).stem[:120] or "Uploaded Resume"
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
                    return JSONResponse({"success": False, "error": "File too large (max 10 MB)."}, status_code=413)
                tmp.write(chunk)

        extract_result = await extract_text(tmp_path, filename)
        if not extract_result["success"]:
            return JSONResponse({"success": False, "error": extract_result["error"]}, status_code=400)

        if ext == ".tex" and "latex" in extract_result:
            return JSONResponse(
                {
                    "success": True,
                    "title": cleaned_title,
                    "latex_content": extract_result["latex"],
                }
            )

        tid = template_id if template_id is not None else default_template_id()
        tpl = get_template(tid)
        if not tpl:
            return JSONResponse({"success": False, "error": "Template not found."}, status_code=404)

        convert_result = await convert_resume(extract_result["text"], tpl["latex_content"])
        if not convert_result["success"]:
            return JSONResponse({"success": False, "error": convert_result["error"]}, status_code=400)

        return JSONResponse(
            {
                "success": True,
                "title": cleaned_title,
                "latex_content": convert_result["latex_content"],
            }
        )
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
