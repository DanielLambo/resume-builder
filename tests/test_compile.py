"""Compile pipeline tests (requires pdflatex on PATH / MacTeX)."""
import shutil

import pytest

from app.services.latex import compile_latex
from tests.conftest import SAMPLE_LATEX

has_pdflatex = shutil.which("pdflatex") is not None or False


@pytest.mark.skipif(not has_pdflatex, reason="pdflatex not found on system")
@pytest.mark.asyncio
async def test_compile_success(_isolate_storage):
    result = await compile_latex("job99", SAMPLE_LATEX)
    assert result["success"] is True, result.get("error")
    assert result["pages"] and result["pages"] >= 1
    assert result.get("pdf_bytes") and len(result["pdf_bytes"]) > 0
    # Ephemeral — nothing durable under app storage
    leftover = list(_isolate_storage["storage"].rglob("*.pdf"))
    assert leftover == []


@pytest.mark.skipif(not has_pdflatex, reason="pdflatex not found on system")
@pytest.mark.asyncio
async def test_compile_failure_reports_errors(_isolate_storage):
    bad = SAMPLE_LATEX.replace("\\end{document}", "\\boguscmd\n\\end{document}")
    result = await compile_latex("job98", bad)
    assert result["success"] is False
    assert result.get("error")
    assert any(e.get("line") for e in result.get("errors", [])) or "Undefined" in result["error"]
