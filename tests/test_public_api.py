"""Public API smoke tests — no server-side resume storage."""
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import SAMPLE_LATEX


@pytest.mark.asyncio
async def test_health(app_client):
    resp = await app_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["storage"] == "browser"


@pytest.mark.asyncio
async def test_templates_list(app_client):
    resp = await app_client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["templates"]
    assert any(t["name"] == "Jake's Resume" for t in data["templates"])
    tid = data["default_id"]
    one = await app_client.get(f"/api/templates/{tid}")
    assert one.status_code == 200
    assert "\\documentclass" in one.json()["latex_content"]


@pytest.mark.asyncio
async def test_dashboard_has_no_server_resumes(app_client):
    resp = await app_client.get("/")
    assert resp.status_code == 200
    assert b"resume-library-list" in resp.content
    assert b"/resume/1" not in resp.content


@pytest.mark.asyncio
async def test_editor_shell(app_client):
    resp = await app_client.get("/edit/demo-id")
    assert resp.status_code == 200
    assert b"latex-editor" in resp.content


@pytest.mark.asyncio
async def test_compile_returns_base64(app_client, monkeypatch):
    fake = {
        "success": True,
        "pdf_bytes": b"%PDF-1.4 fake",
        "synctex": {"pages": {}},
        "pages": 1,
        "errors": [],
    }
    with patch("app.routers.api.compile_latex", new=AsyncMock(return_value=fake)):
        resp = await app_client.post(
            "/api/compile",
            data={"latex_content": SAMPLE_LATEX, "job_id": "t1"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["pdf_base64"]
    assert "pdf_path" not in data


@pytest.mark.asyncio
async def test_ai_stateless(app_client, monkeypatch):
    with patch(
        "app.routers.api.ai_assist",
        new=AsyncMock(
            return_value={
                "success": True,
                "latex_content": SAMPLE_LATEX.replace("Jane Doe", "Jane D."),
                "ai_reply": "Updated.",
            }
        ),
    ):
        resp = await app_client.post(
            "/api/ai",
            data={"latex_content": SAMPLE_LATEX, "prompt": "shorten name", "history": "[]"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "Jane D." in data["latex_content"]


@pytest.mark.asyncio
async def test_ats(app_client):
    resp = await app_client.post("/api/ats", data={"latex_content": SAMPLE_LATEX})
    assert resp.status_code == 200
    assert "score" in resp.json()


@pytest.mark.asyncio
async def test_docs_disabled_in_public_mode(app_client):
    assert (await app_client.get("/docs")).status_code in (404, 405)
    assert (await app_client.get("/openapi.json")).status_code in (404, 405)
