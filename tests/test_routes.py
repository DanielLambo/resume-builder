"""HTTP route coverage for save / compile / pdf / delete / synctex / title / health."""
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import SAMPLE_LATEX


async def _create_resume(client, title="Route Resume"):
    resp = await client.post(
        "/resume/new",
        data={"template_id": "1", "title": title},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    return int(resp.headers["location"].rstrip("/").split("/")[-1])


@pytest.mark.asyncio
async def test_health(app_client):
    resp = await app_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["db"] is True
    assert "pdflatex" in data
    assert "groq_configured" in data


@pytest.mark.asyncio
async def test_save_and_reload(app_client):
    rid = await _create_resume(app_client)
    resp = await app_client.post(
        f"/resume/{rid}/save",
        data={"latex_content": SAMPLE_LATEX},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    page = await app_client.get(f"/resume/{rid}")
    assert page.status_code == 200
    assert b"Jane Doe" in page.content


@pytest.mark.asyncio
async def test_save_missing_resume_404(app_client):
    resp = await app_client.post(
        "/resume/999999/save",
        data={"latex_content": SAMPLE_LATEX},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rename_title(app_client):
    rid = await _create_resume(app_client, title="Old")
    resp = await app_client.post(f"/resume/{rid}/title", data={"title": "  New Name  "})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New Name"
    page = await app_client.get(f"/resume/{rid}")
    assert b"New Name" in page.content


@pytest.mark.asyncio
async def test_delete_post_removes_resume(app_client):
    rid = await _create_resume(app_client, title="Doomed")
    resp = await app_client.post(f"/resume/{rid}/delete", follow_redirects=False)
    assert resp.status_code == 303
    page = await app_client.get(f"/resume/{rid}", follow_redirects=False)
    assert page.status_code == 303
    assert page.headers["location"] == "/"


@pytest.mark.asyncio
async def test_delete_get_blocked(app_client):
    rid = await _create_resume(app_client)
    resp = await app_client.get(f"/resume/{rid}/delete")
    assert resp.status_code == 405
    # Resume still exists
    page = await app_client.get(f"/resume/{rid}")
    assert page.status_code == 200


@pytest.mark.asyncio
async def test_delete_hx_returns_200(app_client):
    rid = await _create_resume(app_client)
    resp = await app_client.post(
        f"/resume/{rid}/delete",
        headers={"HX-Request": "true"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_clear_chat(app_client):
    rid = await _create_resume(app_client)
    from app.database import get_db
    import json

    async with get_db() as db:
        await db.execute(
            "UPDATE resumes SET chat_history = ? WHERE id = ?",
            (json.dumps([{"role": "user", "content": "hi"}]), rid),
        )
        await db.commit()

    resp = await app_client.post(f"/resume/{rid}/clear-chat")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    async with get_db() as db:
        cur = await db.execute("SELECT chat_history FROM resumes WHERE id = ?", (rid,))
        row = await cur.fetchone()
    assert row["chat_history"] == "[]"


@pytest.mark.asyncio
async def test_corrupt_chat_history_does_not_crash_editor(app_client):
    rid = await _create_resume(app_client)
    from app.database import get_db

    async with get_db() as db:
        await db.execute(
            "UPDATE resumes SET chat_history = ? WHERE id = ?",
            ("{not-json", rid),
        )
        await db.commit()

    page = await app_client.get(f"/resume/{rid}")
    assert page.status_code == 200


@pytest.mark.asyncio
async def test_synctex_empty(app_client):
    rid = await _create_resume(app_client)
    resp = await app_client.get(f"/resume/{rid}/synctex")
    assert resp.status_code == 200
    assert resp.json() == {"pages": {}}


@pytest.mark.asyncio
async def test_pdf_missing_404(app_client):
    rid = await _create_resume(app_client)
    resp = await app_client.get(f"/resume/{rid}/pdf")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_compile_endpoint_mocked(app_client):
    rid = await _create_resume(app_client)
    mock_result = {
        "success": True,
        "pdf_path": f"/tmp/{rid}.pdf",
        "pages": 1,
        "errors": [],
    }
    with patch(
        "app.routers.resumes.compile_latex",
        new=AsyncMock(return_value=mock_result),
    ):
        resp = await app_client.post(
            f"/resume/{rid}/compile",
            data={"latex_content": SAMPLE_LATEX},
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["pages"] == 1


@pytest.mark.asyncio
async def test_compile_strips_markdown_fence(app_client):
    rid = await _create_resume(app_client)
    fenced = "```latex\n" + SAMPLE_LATEX + "\n```"
    captured = {}

    async def fake_compile(resume_id, content):
        captured["content"] = content
        return {"success": True, "pdf_path": "x", "pages": 1, "errors": []}

    with patch("app.routers.resumes.compile_latex", new=fake_compile):
        resp = await app_client.post(
            f"/resume/{rid}/compile",
            data={"latex_content": fenced},
        )
    assert resp.status_code == 200
    assert captured["content"].startswith("\\documentclass")
    assert not captured["content"].startswith("```")
    assert not captured["content"].endswith("```")


@pytest.mark.asyncio
async def test_gallery(app_client):
    resp = await app_client.get("/templates")
    assert resp.status_code == 200
    assert b"Jake" in resp.content or b"template" in resp.content.lower()
