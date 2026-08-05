import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeLatexDiff } from "./latex-diff";

describe("summarizeLatexDiff", () => {
  it("counts changed lines and returns hunks", () => {
    const diff = summarizeLatexDiff(
      "\\item Built dashboards.\n\\item Wrote tests.",
      "\\item Shipped dashboards used by 800 students.\n\\item Wrote tests.",
    );
    assert.ok(diff.changedLineCount >= 2);
    assert.ok(diff.hunks.length >= 1);
    assert.match(diff.hunks[0]?.after ?? "", /800 students/);
  });
});
