import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { indexLatex } from "./resume-index";
import { applyResumeOps } from "./resume-ops";
import { getTemplate } from "../resume-template";

describe("applyResumeOps", () => {
  const latex = getTemplate("new-grad").latex;

  it("inserts a role after an experience entry without touching other jobs", () => {
    const index = indexLatex(latex);
    const next = applyResumeOps(latex, index, [
      {
        op: "insert_after",
        id: "sec.experience.e0",
        text: "\\entry{Software Engineering Intern, Rippling}{May--Aug 2026}{SF}\n\\begin{itemize}\n  \\item Built internal tooling.\n\\end{itemize}",
      },
    ]);
    assert.match(next, /Rippling/);
    assert.match(next, /Northstar Labs/);
    assert.match(next, /Orientation Leader/);
    assert.match(next, /Campus Connect/);
  });

  it("replaces a single bullet span", () => {
    const index = indexLatex(latex);
    const bullet = index.spans.find((span) => span.id === "sec.experience.e0.b0");
    assert.ok(bullet);
    const next = applyResumeOps(latex, index, [
      {
        op: "replace_span",
        id: bullet.id,
        text: "\\item Shipped dashboard work that cut onboarding tickets 18\\%.",
      },
    ]);
    assert.match(next, /cut onboarding tickets 18/);
    assert.doesNotMatch(next.slice(0, bullet.start), /cut onboarding tickets 18/);
  });

  it("rejects unknown span ids", () => {
    const index = indexLatex(latex);
    assert.throws(
      () =>
        applyResumeOps(latex, index, [{ op: "delete_span", id: "sec.missing.e0" }]),
      /APPLY_FAILED/,
    );
  });
});
