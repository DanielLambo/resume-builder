import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOUSE_LATEX_PREAMBLE } from "@/lib/resume-template";

import { ensureHousePreamble, latexValidationError } from "./validate";

describe("ensureHousePreamble", () => {
  it("injects house macros when headerblock is used without definitions", () => {
    const latex = String.raw`\documentclass{article}
\begin{document}
\headerblock{Ada}{ada@ex.com}
\end{document}`;
    const fixed = ensureHousePreamble(latex);
    assert.match(fixed, /\\newcommand\{\\headerblock\}/);
    assert.match(fixed, /\\headerblock\{Ada\}/);
    assert.equal(latexValidationError(fixed), null);
  });

  it("leaves complete house docs alone", () => {
    const latex = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{Ada}{ada@ex.com}
\\end{document}
`;
    assert.equal(ensureHousePreamble(latex), latex.trim());
  });

  it("does not strip a plain article without house commands", () => {
    const latex = String.raw`\documentclass{article}
\usepackage{geometry}
\begin{document}
Hello
\end{document}`;
    assert.equal(ensureHousePreamble(latex), latex);
  });
});

describe("latexValidationError", () => {
  it("flags badly unbalanced braces", () => {
    const latex = String.raw`\documentclass{article}
\begin{document}
{{{ oops
\end{document}`;
    assert.match(latexValidationError(latex) ?? "", /unbalanced/);
  });
});
