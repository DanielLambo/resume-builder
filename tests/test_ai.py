"""AI splice + API wiring with mocked Groq responses."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services import ai as ai_mod
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
async def test_ai_sections_splice(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    sections = (
        "SECTION Summary\n"
        "Compact-mode summary rewrite with impact.\n"
    )
    with (
        patch.object(ai_mod, "_chat_completion", new=AsyncMock(return_value=_completion(sections))),
        patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))),
    ):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "Rewrite summary only")

    assert result["success"] is True
    assert "Compact-mode summary rewrite with impact." in result["latex_content"]
    assert "Built payment APIs serving 10K" in result["latex_content"]
    # Header/name preserved — never rebuilt from AI LaTeX
    assert "Jane Doe" in result["latex_content"]
    assert "\\newcommand{\\resumesection}" in result["latex_content"]
    assert "\\begin{resumeitemize}" in result["latex_content"]


@pytest.mark.asyncio
async def test_ai_rejects_latex_then_repairs(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    bad = r"""\documentclass{article}
\begin{document}
\resumesection{Summary}
Broken reconstruction.
\end{document}"""
    good = "SECTION Summary\nRepaired compact summary.\n"

    mock = AsyncMock(side_effect=[_completion(bad), _completion(good)])
    with (
        patch.object(ai_mod, "_chat_completion", new=mock),
        patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))),
    ):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "Rewrite summary only")

    assert result["success"] is True
    assert "Repaired compact summary." in result["latex_content"]
    assert "Jane Doe" in result["latex_content"]
    assert mock.await_count == 2


@pytest.mark.asyncio
async def test_ai_prompt_alias_polish(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    captured = {}

    async def capture(messages, temperature, max_tokens):
        captured["user"] = messages[-1]["content"]
        return _completion(
            "SECTION Summary\n"
            "Backend engineer: APIs, Postgres, and reliability for product teams.\n"
        )

    with (
        patch.object(ai_mod, "_chat_completion", new=capture),
        patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))),
    ):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "polish")

    assert result["success"] is True
    assert "elite SWE" in captured["user"] or "Rewrite Summary" in captured["user"]
    assert "Backend engineer: APIs, Postgres" in result["latex_content"]


def test_find_banned_voice_detects_slop():
    hits = ai_mod._find_banned_voice(
        "Highly motivated engineer with expertise in APIs, resulting in 31% latency reduction."
    )
    assert any("highly motivated" in h.lower() for h in hits)
    assert any("expertise" in h.lower() for h in hits)
    assert any("resulting in" in h.lower() for h in hits)


@pytest.mark.asyncio
async def test_ai_voice_gate_retries(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    sloppy = (
        "SECTION Summary\n"
        "Highly motivated backend engineer with expertise in APIs.\n"
    )
    clean = (
        "SECTION Summary\n"
        "Backend engineer: APIs, Postgres, and reliability for product teams.\n"
    )
    mock = AsyncMock(side_effect=[_completion(sloppy), _completion(clean)])
    with (
        patch.object(ai_mod, "_chat_completion", new=mock),
        patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))),
    ):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "summary")

    assert result["success"] is True
    assert "Highly motivated" not in result["latex_content"]
    assert "Backend engineer: APIs" in result["latex_content"]
    assert mock.await_count == 2


@pytest.mark.asyncio
async def test_ai_truncation_error(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
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
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = await ai_mod.ai_assist(SAMPLE_LATEX, "Polish")
    assert result["success"] is False
    assert "GROQ_API_KEY" in result["error"]


@pytest.mark.asyncio
async def test_ai_endpoint_saves(app_client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    resp = await app_client.post(
        "/resume/new",
        data={"template_id": "1", "title": "API Test"},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    resume_id = int(resp.headers["location"].rsplit("/", 1)[-1])

    await app_client.post(f"/resume/{resume_id}/save", data={"latex_content": SAMPLE_LATEX})

    sections = "SECTION Summary\nEndpoint-level polish applied.\n"
    with (
        patch.object(ai_mod, "_chat_completion", new=AsyncMock(return_value=_completion(sections))),
        patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))),
    ):
        resp = await app_client.post(f"/resume/{resume_id}/ai", data={"prompt": "Polish summary"})

    data = resp.json()
    assert data["success"] is True
    assert data.get("saved") is True
    assert "Endpoint-level polish applied." in data["latex_content"]


@pytest.mark.asyncio
async def test_ai_no_changes(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    with (
        patch.object(ai_mod, "_chat_completion", new=AsyncMock(return_value=_completion("NO_CHANGES"))),
        patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))),
    ):
        result = await ai_mod.ai_assist(SAMPLE_LATEX, "looks good?")
    assert result["success"] is True
    assert result["latex_content"] == SAMPLE_LATEX
    assert "no changes" in result["ai_reply"].lower()


@pytest.mark.asyncio
async def test_convert_resume_success(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    with patch.object(
        ai_mod,
        "_chat_completion",
        new=AsyncMock(return_value=_completion(SAMPLE_LATEX)),
    ):
        result = await ai_mod.convert_resume("Jane Doe\nEngineer", SAMPLE_LATEX)
    assert result["success"] is True
    assert "\\documentclass" in result["latex_content"]


@pytest.mark.asyncio
async def test_convert_resume_requires_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = await ai_mod.convert_resume("text", SAMPLE_LATEX)
    assert result["success"] is False


@pytest.mark.asyncio
async def test_ai_assist_simple_rename_path(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    latex = SAMPLE_LATEX.replace("State University", "Southwestern University")
    with patch.object(ai_mod, "_compiles_ok", new=AsyncMock(return_value=(True, ""))):
        result = await ai_mod.ai_assist(latex, "im at alabama a and m not southwestern")
    assert result["success"] is True
    assert "Alabama A \\& M" in result["latex_content"]
    assert "Southwestern University" not in result["latex_content"]
