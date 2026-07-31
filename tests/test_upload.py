"""Upload + routing smoke tests."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services import ai as ai_mod
from tests.conftest import SAMPLE_LATEX


@pytest.mark.asyncio
async def test_upload_tex_redirects(app_client):
    files = {"file": ("resume.tex", SAMPLE_LATEX.encode(), "application/x-tex")}
    data = {"title": "From TeX", "template_id": "1"}
    resp = await app_client.post("/upload", data=data, files=files, follow_redirects=False)
    assert resp.status_code == 303
    assert resp.headers["location"].startswith("/resume/")


@pytest.mark.asyncio
async def test_upload_unsupported_type(app_client):
    files = {"file": ("hack.exe", b"MZ", "application/octet-stream")}
    resp = await app_client.post(
        "/upload",
        data={"title": "Nope", "template_id": "1"},
        files=files,
        follow_redirects=False,
    )
    assert resp.status_code == 303
    assert "error=" in resp.headers["location"]
    assert "Unsupported" in resp.headers["location"] or "unsupported" in resp.headers["location"].lower() or "exe" in resp.headers["location"]


@pytest.mark.asyncio
async def test_upload_txt_converts_via_ai(app_client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    plain = "Jane Doe\njane@example.com\nSoftware Engineer at Acme"
    with patch.object(
        ai_mod,
        "_chat_completion",
        new=AsyncMock(
            return_value={
                "choices": [
                    {
                        "message": {"content": SAMPLE_LATEX},
                        "finish_reason": "stop",
                    }
                ]
            }
        ),
    ):
        resp = await app_client.post(
            "/upload",
            data={"title": "From TXT", "template_id": "1"},
            files={"file": ("resume.txt", plain.encode(), "text/plain")},
            follow_redirects=False,
        )
    assert resp.status_code == 303
    assert resp.headers["location"].startswith("/resume/")


@pytest.mark.asyncio
async def test_dashboard_lists_resumes(app_client):
    await app_client.post(
        "/resume/new",
        data={"template_id": "1", "title": "Listed"},
        follow_redirects=False,
    )
    resp = await app_client.get("/")
    assert resp.status_code == 200
    assert b"Listed" in resp.content


@pytest.mark.asyncio
async def test_paths_unified():
    from app.paths import COMPILED_DIR, DB_PATH, STORAGE_DIR

    assert DB_PATH.parent == STORAGE_DIR
    assert COMPILED_DIR.parent == STORAGE_DIR
    assert STORAGE_DIR.name == "storage"


@pytest.mark.asyncio
async def test_upload_rejects_oversize(app_client, monkeypatch):
    monkeypatch.setattr("app.main.MAX_UPLOAD_BYTES", 64)
    big = b"x" * 200
    resp = await app_client.post(
        "/upload",
        data={"title": "Big", "template_id": "1"},
        files={"file": ("big.txt", big, "text/plain")},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    assert "too%20large" in resp.headers["location"].lower() or "too large" in resp.headers[
        "location"
    ].lower().replace("%20", " ")


@pytest.mark.asyncio
async def test_upload_bad_template_id(app_client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    with patch.object(
        ai_mod,
        "convert_resume",
        new=AsyncMock(return_value={"success": True, "latex_content": SAMPLE_LATEX}),
    ):
        resp = await app_client.post(
            "/upload",
            data={"title": "BadTpl", "template_id": "99999"},
            files={"file": ("r.txt", b"Jane Doe", "text/plain")},
            follow_redirects=False,
        )
    assert resp.status_code == 303
    assert "error=" in resp.headers["location"]
    assert "emplate" in resp.headers["location"] or "template" in resp.headers["location"].lower()


@pytest.mark.asyncio
async def test_upload_empty_txt(app_client):
    resp = await app_client.post(
        "/upload",
        data={"title": "Empty", "template_id": "1"},
        files={"file": ("empty.txt", b"   \n", "text/plain")},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    assert "error=" in resp.headers["location"]
