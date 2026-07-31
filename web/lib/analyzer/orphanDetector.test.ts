import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeOrphans,
  didShortenBullet,
  extractItems,
  mockShortenBullet,
  replaceItemText,
} from "./orphanDetector";

describe("extractItems", () => {
  it("extracts bare \\item bullets and preserves sibling indentation on replace", () => {
    const latex = String.raw`\begin{itemize}
  \item Hello world
  \item Next bullet
\end{itemize}`;
    const items = extractItems(latex);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.text, "Hello world");
    assert.equal(items[0]?.kind, "item");

    const next = replaceItemText(latex, items[0]!, "Hi world");
    assert.match(next, /\\item Hi world\n {2}\\item Next bullet/);
  });

  it("extracts Jake-style \\resumeItem{...}", () => {
    const latex = String.raw`\resumeItem{Shipped a ranking model that lifted CTR 6.2\%.}
\resumeItem{Built feature pipelines in Python.}`;
    const items = extractItems(latex);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.kind, "resumeItem");
    assert.match(items[0]?.text ?? "", /ranking model/);

    const next = replaceItemText(latex, items[0]!, "Shipped a ranking model; CTR +6.2\\%.");
    assert.match(next, /\\resumeItem\{Shipped a ranking model; CTR \+6\.2\\%\.\}/);
    assert.match(next, /\\resumeItem\{Built feature pipelines/);
  });
});

describe("analyzeOrphans", () => {
  it("flags short trailing wraps only", () => {
    const orphan =
      "Shipped features used by thousands of users weekly and improved onboarding completion across projects.";
    const ok = "Cut p99 latency with targeted query and cache work.";
    const latex = String.raw`\begin{itemize}
  \item ${orphan}
  \item ${ok}
\end{itemize}`;
    const analysis = analyzeOrphans(latex);
    assert.equal(analysis.orphanCount, 1);
    assert.equal(analysis.bullets[0]?.orphanRisk, true);
    assert.ok((analysis.bullets[0]?.trailingWords ?? 99) <= 3);
    assert.equal(analysis.bullets[1]?.orphanRisk, false);
  });
});

describe("mockShortenBullet", () => {
  it("does not strip articles", () => {
    const input = "Built a payment API that serves the checkout flow for the store.";
    const out = mockShortenBullet(input);
    assert.match(out, /\ba\b/);
    assert.match(out, /\bthe\b/);
  });

  it("removes safe filler adverbs", () => {
    const input =
      "Successfully delivered various projects for numerous stakeholders effectively.";
    const out = mockShortenBullet(input);
    assert.ok(didShortenBullet(input, out));
    assert.doesNotMatch(out, /Successfully|various|numerous|effectively/i);
  });
});
