"""ATS heuristics + metric nudges (local, no external APIs)."""
from __future__ import annotations

import re

from app.services.latex import latex_to_compact

_ATS_RISKS = [
    (r"\\begin\{tikzpicture\}", "TikZ graphics may not parse in ATS"),
    (r"\\includegraphics", "Images are invisible to most ATS parsers"),
    (r"\\fa[A-Z]", "Font Awesome icons often become garbage characters"),
    (r"\\begin\{multicol", "Multi-column layouts confuse many ATS parsers"),
    (r"\\begin\{tabular\*?\}", "Nested tables can scramble reading order"),
    (r"fontawesome|fontspec", "Custom icon/font packages hurt ATS text extraction"),
]


def analyze_ats(latex: str) -> dict:
    """Heuristic ATS compatibility report from source LaTeX."""
    risks = []
    for pat, msg in _ATS_RISKS:
        if re.search(pat, latex, re.I):
            risks.append(msg)

    compact = latex_to_compact(latex)
    sections = re.findall(r"^SECTION\s+(.+)$", compact, re.M)
    bullets = [ln[1:].strip() for ln in compact.splitlines() if ln.startswith("- ")]
    bare = [b for b in bullets if not re.search(r"\d", b)]

    score = 100
    score -= 12 * len(risks)
    if not sections:
        score -= 20
        risks.append("No clear section headings detected")
    score -= min(20, len(bare) * 2)
    score = max(35, min(100, score))

    return {
        "score": score,
        "sections": sections,
        "bullet_count": len(bullets),
        "bullets_without_metrics": bare[:12],
        "risks": risks,
        "ok": score >= 75 and not any("Multi-column" in r or "TikZ" in r for r in risks),
    }


def metric_nudges(latex: str) -> list[dict]:
    """Bullets that lack digits — candidates for a metrics prompt."""
    compact = latex_to_compact(latex)
    section = None
    nudges = []
    for ln in compact.splitlines():
        if ln.startswith("SECTION "):
            section = ln[8:].strip()
            continue
        if ln.startswith("- "):
            text = ln[2:].strip()
            if text and not re.search(r"\d", text):
                nudges.append({"section": section or "Unknown", "bullet": text})
    return nudges[:20]
