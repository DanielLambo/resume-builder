import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { indexLatex, spanById } from "./resume-index";
import { getTemplate } from "../resume-template";

describe("indexLatex", () => {
  const latex = getTemplate("new-grad").latex;
  const index = indexLatex(latex);

  it("maps preamble, header, sections, entries, and bullets", () => {
    const kinds = new Set(index.spans.map((span) => span.kind));
    assert.ok(kinds.has("preamble"));
    assert.ok(kinds.has("header"));
    assert.ok(kinds.has("section"));
    assert.ok(kinds.has("entry"));
    assert.ok(kinds.has("bullet"));
    assert.ok(index.spans.some((span) => span.id === "sec.experience.e0"));
    assert.ok(index.spans.some((span) => span.id.startsWith("sec.experience.e0.b")));
  });

  it("keeps span slices aligned with source offsets", () => {
    const entry = spanById(index, "sec.experience.e0");
    assert.ok(entry);
    assert.match(latex.slice(entry.start, entry.end), /Northstar Labs/);
  });
});
