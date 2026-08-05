import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeCompileError } from "./compile-latex";

describe("sanitizeCompileError", () => {
  it("surfaces FastAPI detail after the status prefix", () => {
    const msg = sanitizeCompileError(
      new Error(
        "Compile service failed (HTTP 500): Undefined control sequence \\headerblock",
      ),
    );
    assert.match(msg, /Undefined control sequence/);
    assert.doesNotMatch(msg, /Resume content was not returned/);
  });

  it("keeps short TeX diagnostics", () => {
    const msg = sanitizeCompileError(
      new Error("! LaTeX Error: Missing \\begin{document}"),
    );
    assert.match(msg, /Missing/);
  });

  it("preserves Line N diagnostics", () => {
    const msg = sanitizeCompileError(
      new Error("Line 42: Undefined control sequence. — \\boguscmd"),
    );
    assert.match(msg, /^Line 42:/);
    assert.match(msg, /Undefined control sequence/);
  });

  it("parses pdflatex log snippets into Line N", () => {
    const msg = sanitizeCompileError(
      new Error("pdflatex failed (exit 1):\n! Missing $ inserted.\nl.18 \\item 50%\n"),
    );
    assert.match(msg, /Line 18/);
    assert.match(msg, /Missing \$/);
  });
});
