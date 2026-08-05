import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatResumeLatex, normalizeDateRanges } from "./format-resume";

describe("normalizeDateRanges", () => {
  it("unifies month names and dashes", () => {
    assert.equal(
      normalizeDateRanges("May 2025 - August 2025"),
      "May 2025--Aug 2025",
    );
    assert.equal(
      normalizeDateRanges("Jan 2024 to Present"),
      "Jan 2024--Present",
    );
  });
});

describe("formatResumeLatex", () => {
  it("normalizes sections, bullets, and spacing", () => {
    const messy = String.raw`\documentclass{article}
\begin{document}
\section{experience}
\begin{itemize}
\item Shipped the dashboard
- Built APIs
\end{itemize}
\section*{skills}
Python, TypeScript
\end{document}`;

    const next = formatResumeLatex(messy);
    assert.match(next, /\\section\*\{Experience\}/);
    assert.match(next, /\\section\*\{Skills\}/);
    assert.match(next, /\\item Shipped the dashboard\./);
    assert.match(next, /\\item Built APIs\./);
    assert.doesNotMatch(next, /^- /m);
  });
});
