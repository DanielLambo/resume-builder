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
});
