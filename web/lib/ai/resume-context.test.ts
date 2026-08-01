import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateResumeLatex } from "@/lib/ai/latex-guard";
import {
  buildResumeEditContext,
  detectEditIntent,
} from "@/lib/ai/resume-context";

const SAMPLE = String.raw`\documentclass[11pt,letterpaper]{article}
\begin{document}
\section*{Experience}
\textbf{Acme}
\begin{itemize}
  \item Shipped APIs.
\end{itemize}
\section*{Skills}
Python, TypeScript
\end{document}`;

describe("detectEditIntent", () => {
  it("detects tailor prompts", () => {
    assert.equal(
      detectEditIntent("Tailor this resume for the following job application."),
      "tailor",
    );
  });

  it("detects rename prompts", () => {
    assert.equal(detectEditIntent("Rename my school to MIT"), "rename");
  });

  it("detects tighten prompts", () => {
    assert.equal(detectEditIntent("Tighten bullets to fit one page"), "tighten");
  });
});

describe("buildResumeEditContext", () => {
  it("extracts section outline", () => {
    const ctx = buildResumeEditContext({ latex: SAMPLE, template: "new-grad" });
    assert.ok(ctx.hasExperience);
    assert.ok(ctx.hasSkills);
    assert.deepEqual(ctx.sectionTitles, ["Experience", "Skills"]);
  });
});

describe("validateResumeLatex", () => {
  it("accepts a sane document", () => {
    assert.equal(validateResumeLatex(SAMPLE, SAMPLE), null);
  });

  it("rejects lost sections", () => {
    const noSections = String.raw`\documentclass[11pt,letterpaper]{article}
\begin{document}
Just text
\end{document}`;
    assert.match(validateResumeLatex(noSections, SAMPLE) ?? "", /section/i);
  });

  it("rejects catastrophic shrink on long resumes", () => {
    const longPrior = SAMPLE + "\n% pad\n".repeat(200);
    const tiny = String.raw`\documentclass[11pt,letterpaper]{article}
\begin{document}
\section*{Experience}
Hi
\end{document}`;
    assert.match(validateResumeLatex(tiny, longPrior) ?? "", /shrank/i);
  });
});
