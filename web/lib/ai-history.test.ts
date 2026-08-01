import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendLocalSnapshot,
  pushAiHistory,
  type AiHistoryEntry,
} from "./ai-history";

describe("pushAiHistory", () => {
  it("caps length and keeps newest", () => {
    let hist: AiHistoryEntry[] = [];
    for (let i = 0; i < 12; i += 1) {
      hist = pushAiHistory(hist, {
        latex: `doc-${i}`,
        reply: "",
        prompt: `p-${i}`,
        at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      });
    }
    assert.equal(hist.length, 10);
    assert.equal(hist[0]?.latex, "doc-2");
    assert.equal(hist[9]?.latex, "doc-11");
  });
});

describe("appendLocalSnapshot", () => {
  it("truncates redo branch when appending from middle", () => {
    const base = {
      stack: [
        { latex: "a", reply: null, prompt: "", at: 1 },
        { latex: "b", reply: "r", prompt: "p", at: 2 },
        { latex: "c", reply: "r2", prompt: "p2", at: 3 },
      ],
      index: 1,
    };
    const next = appendLocalSnapshot(base.stack, base.index, {
      latex: "d",
      reply: "r3",
      prompt: "p3",
      at: 4,
    });
    assert.deepEqual(
      next.stack.map((s) => s.latex),
      ["a", "b", "d"],
    );
    assert.equal(next.index, 2);
  });
});
