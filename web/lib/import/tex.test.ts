import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectImportKind, titleFromFilename } from "./detect";
import { planTexImport } from "./tex";
import { mockConvertResume } from "./convert";
import { latexValidationError } from "./validate";

describe("detectImportKind", () => {
  it("accepts tex and pdf names", () => {
    assert.equal(detectImportKind("resume.tex"), "tex");
    assert.equal(detectImportKind("Old_Resume.PDF"), "pdf");
    assert.equal(detectImportKind("notes.docx"), null);
  });

  it("titles from filenames", () => {
    assert.equal(titleFromFilename("Jordan_Lee_SWE.pdf"), "Jordan Lee SWE");
    assert.equal(titleFromFilename("resume.tex"), "Imported resume");
  });
});

describe("planTexImport", () => {
  it("passes through a house article", () => {
    const src = String.raw`\documentclass{article}
\begin{document}
Hello
\end{document}`;
    const plan = planTexImport(src);
    assert.equal(plan.mode, "passthrough");
    if (plan.mode === "passthrough") {
      assert.equal(latexValidationError(plan.latex), null);
    }
  });

  it("rewrites Jake-style macros into house commands", () => {
    const src = String.raw`\documentclass{article}
\begin{document}
\begin{center}
\textbf{\Huge Jake Ryan} \\
jake@su.edu $|$ linkedin.com/in/jake
\end{center}
\section{Experience}
\resumeSubHeadingListStart
\resumeSubheading{ stech }{May 2025 -- Aug 2025}{Intern}{Remote}
\resumeItemListStart
\resumeItem{Built a Go service serving 2M events/day.}
\resumeItemListEnd
\resumeSubHeadingListEnd
\end{document}`;
    const plan = planTexImport(src);
    assert.equal(plan.mode, "jake");
    if (plan.mode === "jake") {
      assert.match(plan.latex, /\\headerblock\{Jake Ryan\}/);
      assert.match(plan.latex, /jake@su\.edu/);
      assert.match(plan.latex, /\\entry\{stech\}/);
      assert.match(plan.latex, /\\item Built a Go service/);
      assert.doesNotMatch(plan.latex, /\\resumeItem/);
      assert.equal(latexValidationError(plan.latex), null);
    }
  });

  it("flags custom classes for AI rewrite", () => {
    const src = String.raw`\documentclass{awesome-cv}
\begin{document}
Hi
\end{document}`;
    const plan = planTexImport(src);
    assert.equal(plan.mode, "rewrite");
  });
});

describe("mockConvertResume", () => {
  it("emits valid house latex", () => {
    const result = mockConvertResume(
      "Alex Rivera\nalex@email.com\nBuilt campus app used by 800 students\nB.S. Computer Science, State University",
      "Alex Rivera",
    );
    assert.equal(latexValidationError(result.output.latex), null);
    assert.match(result.output.latex, /\\headerblock/);
  });
});
