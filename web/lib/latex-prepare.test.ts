import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareLatexForCompile, softenJakeSource } from "./latex-prepare";

const MINI_JAKE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[empty]{fullpage}
\input{glyphtounicode}
\newcommand{\resumeItem}[1]{\item #1}
\newcommand{\resumeSubheading}[4]{}
\newcommand{\resumeSubHeadingListStart}{}
\newcommand{\resumeSubHeadingListEnd}{}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}}
\begin{document}
\begin{center}
\textbf{\Huge Daniel Lambo} \\
\href{mailto:a@b.com}{a@b.com}
\end{center}
\section{Experience}
\resumeSubHeadingListStart
\resumeSubheading{Google}{2025}{Intern}{CA}
\resumeItemListStart
\resumeItem{Built a \textbf{real-time} system.}
\resumeItemListEnd
\resumeSubHeadingListEnd
\end{document}`;

describe("prepareLatexForCompile", () => {
  it("rewrites Jake-style source to house latex", () => {
    const { latex, convertedFromJake } = prepareLatexForCompile(MINI_JAKE);
    assert.equal(convertedFromJake, true);
    assert.match(latex, /\\headerblock\{Daniel Lambo\}/);
    assert.match(latex, /\\entry\{Google\}/);
    assert.doesNotMatch(latex, /\\resumeItem/);
    assert.doesNotMatch(latex, /glyphtounicode|fullpage/);
  });

  it("softens nested bold and stray braces", () => {
    const messy = softenJakeSource(
      String.raw`{\resumeItem{Built \textbf{Python, \textbf{PyTorch}, NumPy}}`,
    );
    assert.match(messy, /^\\resumeItem\{/);
    assert.doesNotMatch(messy, /\\textbf\{/);
    assert.match(messy, /PyTorch/);
  });

  it("rejects irreparable Jake sources with a short message", () => {
    const broken = String.raw`\documentclass{article}
\begin{document}
\resumeItem{only one brace
\end{document}`;
    assert.throws(
      () => prepareLatexForCompile(broken),
      /Jake-style resume has broken braces/,
    );
  });
});
