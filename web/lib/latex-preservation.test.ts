import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectContentWipe } from "./latex-preservation";

const original = `${"% keep length above wipe threshold\n".repeat(40)}
\\documentclass{article}
\\begin{document}
\\section{Experience}
\\resumeSubheading{Campus Labs}{Intern}
\\resumeSubheading{Student Government}{Treasurer}
\\section{Education}
Penn State
\\section{Skills}
Python, TypeScript
\\end{document}
`;

describe("detectContentWipe", () => {
  it("allows adding a role without dropping others", () => {
    const next = original.replace(
      "\\resumeSubheading{Campus Labs}{Intern}",
      "\\resumeSubheading{Rippling}{Intern}\n\\resumeSubheading{Campus Labs}{Intern}",
    );
    assert.equal(detectContentWipe(original, next), null);
  });

  it("flags deleting an existing employer", () => {
    const next = original.replace("\\resumeSubheading{Campus Labs}{Intern}\n", "");
    const hint = detectContentWipe(original, next);
    assert.match(hint ?? "", /Campus Labs/);
  });

  it("flags a collapsed rewrite", () => {
    const next = String.raw`
\documentclass{article}
\begin{document}
\section{Experience}
\resumeSubheading{Rippling}{Intern}
\end{document}
`;
    const hint = detectContentWipe(original, next);
    assert.match(hint ?? "", /CONTENT_WIPED/);
  });
});
