import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findIntroducedAiSlop } from "@/lib/ai/anti-slop";

const CLEAN = String.raw`\documentclass{article}
\begin{document}
\section*{Experience}
\begin{itemize}
  \item Shipped React dashboard filters used daily by 12 ops teammates.
  \item Cut API p99 ~31\% after adding cache headers.
\end{itemize}
\end{document}`;

describe("findIntroducedAiSlop", () => {
  it("allows clean human bullets", () => {
    assert.equal(findIntroducedAiSlop(CLEAN, CLEAN).length, 0);
  });

  it("flags newly introduced buzzwords", () => {
    const sloppy = CLEAN.replace(
      "Shipped React dashboard filters used daily by 12 ops teammates.",
      "Leveraged cutting-edge React to deliver robust scalable solutions.",
    );
    const hits = findIntroducedAiSlop(sloppy, CLEAN);
    assert.ok(hits.some((h) => /leverage|cutting-edge|robust/i.test(h.match)));
  });

  it("does not punish slop that was already in the source", () => {
    const prior = CLEAN.replace(
      "Shipped React dashboard filters used daily by 12 ops teammates.",
      "Leveraged React for dashboard filters.",
    );
    const next = prior;
    assert.equal(findIntroducedAiSlop(next, prior).length, 0);
  });

  it("flags resulting-in percentage cadence", () => {
    const sloppy = CLEAN.replace(
      "Cut API p99 ~31\\% after adding cache headers.",
      "Optimized APIs, resulting in a 31\\% latency reduction.",
    );
    const hits = findIntroducedAiSlop(sloppy, CLEAN);
    assert.ok(hits.some((h) => /resulting in/i.test(h.match)));
  });
});
