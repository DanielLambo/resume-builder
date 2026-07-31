"""AI splice + API wiring with mocked Groq responses."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services import ai as ai_mod
from app.services.latex import latex_to_compact
from tests.conftest import SAMPLE_LATEX


def _completion(content: str, finish_reason: str = "stop") -> dict:
    return {
        "choices": [
            {
                "message": {"content": content},
                "finish_reason": finish_reason,
            }
        ]
    }


@pytest.mark.asyncio
async def test_ai_fulldoc_splice(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    compact = latex_to_compact(SAMPLE_LATEX)
    assert len(compact) <= ai_mod.FULLDOC_COMPACT_THRESHOLD

    ai_tex = SAMPLE_LATEX.replace(
        "Backend engineer focused on APIs and reliability.",
        "Reliability-obsessed backend engineer.",
    )
    with patch.object(ai_mod, "_chat_completion", new=AsyncMock(return_value=_completion(ai_tex))):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "Polish my summary")

    assert result["success"] is True
    assert "Reliability-obsessed backend engineer." in result["latex_content"]
    assert "\\newcommand{\\resumesection}" in result["latex_content"]


@pytest.mark.asyncio
async def test_ai_sections_splice(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    # Force sections mode by lowering the threshold
    monkeypatch.setattr(ai_mod, "FULLDOC_COMPACT_THRESHOLD", 10)

    sections = (
        "SECTION Summary\n"
        "Compact-mode summary rewrite with impact.\n"
    )
    with patch.object(ai_mod, "_chat_completion", new=AsyncMock(return_value=_completion(sections))):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "Rewrite summary only")

    assert result["success"] is True
    assert "Compact-mode summary rewrite with impact." in result["latex_content"]
    assert "Built payment APIs serving 10K" in result["latex_content"]


@pytest.mark.asyncio
async def test_ai_truncation_error(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    with patch.object(
        ai_mod,
        "_chat_completion",
        new=AsyncMock(return_value=_completion("partial...", finish_reason="length")),
    ):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "Rewrite everything")
    assert result["success"] is False
    assert "truncated" in result["error"].lower() or "output limit" in result["error"].lower()


@pytest.mark.asyncio
async def test_ai_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = await ai_mod.ai_assist(SAMPLE_LATEX, "Polish")
    assert result["success"] is False
    assert "OPENAI_API_KEY" in result["error"]


@pytest.mark.asyncio
async def test_ai_endpoint_saves(app_client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    # Create a resume from Blank template
    resp = await app_client.post(
        "/resume/new",
        data={"template_id": "1", "title": "API Test"},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    resume_id = int(resp.headers["location"].rsplit("/", 1)[-1])

    ai_tex = SAMPLE_LATEX.replace(
        "Backend engineer focused on APIs and reliability.",
        "Endpoint-level polish applied.",
    )
    # Seed latex first
    await app_client.post(f"/resume/{resume_id}/save", data={"latex_content": SAMPLE_LATEX})

    with patch.object(ai_mod, "_chat_completion", new=AsyncMock(return_value=_completion(ai_tex))):
        resp = await app_client.post(f"/resume/{resume_id}/ai", data={"prompt": "Polish summary"})

    data = resp.json()
    assert data["success"] is True
    assert data.get("saved") is True
    assert "Endpoint-level polish applied." in data["latex_content"]
