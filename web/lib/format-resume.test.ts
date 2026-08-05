import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatResumeLatex,
  normalizeDateRanges,
  polishResumeLatex,
} from "./format-resume";

describe("normalizeDateRanges", () => {
  it("unifies month names, numeric dates, and dashes", () => {
    assert.equal(
      normalizeDateRanges("May 2025 - August 2025"),
      "May 2025--Aug 2025",
    );
    assert.equal(
      normalizeDateRanges("Jan 2024 to Present"),
      "Jan 2024--Present",
    );
    assert.equal(
      normalizeDateRanges("01/2023 - 08/2024"),
      "Jan 2023--Aug 2024",
    );
    assert.equal(
      normalizeDateRanges("June 2022 until Current"),
      "Jun 2022--Present",
    );
    assert.equal(normalizeDateRanges("2021-2023"), "2021--2023");
  });
});

describe("polishResumeLatex", () => {
  it("normalizes sections, bullets, contact, and spacing", () => {
    const messy = String.raw`\documentclass{article}
\begin{document}
\section{work experience}
\begin{itemize}
\item shipped the dashboard
- Built APIs
\end{itemize}
\section*{technical skills}
Python | TypeScript
https://www.linkedin.com/in/alexrivera 555-010-2211
\end{document}`;

    const { latex, changes } = polishResumeLatex(messy);
    assert.match(latex, /\\section\*\{Experience\}/);
    assert.match(latex, /\\section\*\{Skills\}/);
    assert.match(latex, /\\item Shipped the dashboard\./);
    assert.match(latex, /\\item Built APIs\./);
    assert.match(latex, /linkedin\.com\/in\/alexrivera/);
    assert.match(latex, /\(555\) 010-2211/);
    assert.match(latex, /\$\\cdot\$/);
    assert.doesNotMatch(latex, /^- /m);
    assert.ok(changes.some((change) => change.kind === "headers"));
    assert.ok(changes.some((change) => change.kind === "bullets"));
    assert.equal(formatResumeLatex(messy), latex);
  });
});
