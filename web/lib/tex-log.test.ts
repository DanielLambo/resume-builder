import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCompileDiagnostic,
  formatTexLogError,
  parseTexLogErrors,
} from "./tex-log";

describe("parseTexLogErrors", () => {
  it("extracts line number from l.N", () => {
    const errors = parseTexLogErrors(
      "! Undefined control sequence.\nl.42 \\boguscmd\n",
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.line, 42);
    assert.match(errors[0]?.message ?? "", /Undefined control sequence/);
  });
});

describe("formatCompileDiagnostic", () => {
  it("prefers structured FastAPI errors with line", () => {
    const { message, line } = formatCompileDiagnostic({
      error: "something long",
      hint: "Check for typos in \\command names.",
      errors: [
        {
          message: "Undefined control sequence.",
          line: 42,
          context: "l.42 \\headerblock",
        },
      ],
    });
    assert.equal(line, 42);
    assert.match(message, /^Line 42:/);
    assert.match(message, /Undefined control sequence/);
    assert.match(message, /headerblock|typos/i);
  });

  it("parses freeform pdflatex snippets", () => {
    const { message, line } = formatCompileDiagnostic({
      error:
        "pdflatex failed (exit 1):\n! Missing $ inserted.\nl.18 \\item cost was 50%\n",
    });
    assert.equal(line, 18);
    assert.match(message, /Line 18/);
    assert.match(message, /Missing \$/);
  });
});

describe("formatTexLogError", () => {
  it("formats without line when unknown", () => {
    assert.equal(
      formatTexLogError({ message: "Emergency stop.", line: null, context: "" }),
      "Emergency stop.",
    );
  });
});
