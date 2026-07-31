"""Compile pipeline tests (requires pdflatex on PATH / MacTeX)."""
import pytest

from app.services.latex import compile_latex
from tests.conftest import SAMPLE_LATEX


@pytest.mark.asyncio
async def test_compile_success(_isolate_storage):
    result = await compile_latex(99, SAMPLE_LATEX)
    assert result["success"] is True, result.get("error")
    assert result["pages"] and result["pages"] >= 1
    pdf = _isolate_storage["compiled"] / "99.pdf"
    assert pdf.exists() and pdf.stat().st_size > 0
    synctex = _isolate_storage["compiled"] / "99.synctex.json"
    assert synctex.exists()


@pytest.mark.asyncio
async def test_compile_failure_reports_errors(_isolate_storage):
    bad = SAMPLE_LATEX.replace("\\end{document}", "\\boguscmd\n\\end{document}")
    result = await compile_latex(98, bad)
    assert result["success"] is False
    assert result.get("error")
    assert any(e.get("line") for e in result.get("errors", [])) or "Undefined" in result["error"]
