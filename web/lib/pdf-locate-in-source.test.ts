import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPdfSearchPhrase,
  findLatexLineForPdfText,
  nearestPdfTextItem,
  normalizeLatexHaystack,
  normalizePdfNeedle,
} from "./pdf-locate-in-source";

describe("pdf-locate-in-source", () => {
  it("normalizes PDF + LaTeX for matching", () => {
    assert.equal(normalizePdfNeedle("  Foo   Bar "), "foo bar");
    assert.equal(
      normalizeLatexHaystack("\\textbf{Foo} \\hfill Bar % note"),
      "foo bar",
    );
  });

  it("finds the source line for PDF-visible text", () => {
    const latex = [
      "\\begin{document}",
      "\\section*{Experience}",
      "\\entry{Acme Corp}{Software Engineer}{2020--2024}{SF}",
      "\\item Built the payments API",
      "\\end{document}",
    ].join("\n");

    assert.equal(findLatexLineForPdfText(latex, "Acme Corp"), 3);
    assert.equal(findLatexLineForPdfText(latex, "Built the payments API"), 4);
    assert.equal(findLatexLineForPdfText(latex, "zzz"), null);
  });

  it("picks nearest PDF text item and expands a phrase", () => {
    const items = [
      { str: "Built ", x: 10, y: 100 },
      { str: "the ", x: 40, y: 100 },
      { str: "API", x: 70, y: 100 },
      { str: "Other", x: 10, y: 200 },
    ];
    const phrase = buildPdfSearchPhrase(items, 1);
    assert.match(phrase, /Built/);
    assert.match(phrase, /API/);

    const located = [
      { str: "Built", x: 10, yFromTop: 100 },
      { str: "Other", x: 10, yFromTop: 200 },
    ];
    assert.equal(nearestPdfTextItem(located, 12, 102), 0);
    assert.equal(nearestPdfTextItem(located, 12, 400, 20), null);
  });
});
