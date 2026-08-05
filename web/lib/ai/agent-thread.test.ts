import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_STORED_TURNS,
  parseAgentThread,
  pushAgentTurns,
  threadToChatMessages,
} from "./agent-thread";

describe("agent thread", () => {
  it("stores text turns and folds overflow into a summary", () => {
    let thread = parseAgentThread(undefined);
    for (let i = 0; i < 10; i += 1) {
      thread = pushAgentTurns(thread, `add fact ${i}`, `updated bullet ${i}`);
    }
    assert.equal(thread.turns.length, MAX_STORED_TURNS);
    assert.ok(thread.summary.length > 0);
    assert.doesNotMatch(thread.summary, /\\documentclass/);
    assert.ok(thread.turns.every((turn) => !turn.text.includes("\\documentclass")));
  });

  it("exposes industry-standard chat messages without latex snapshots", () => {
    const thread = pushAgentTurns(parseAgentThread(null), "tighten skills", "Added AWS.");
    const messages = threadToChatMessages(thread);
    assert.deepEqual(
      messages.map((msg) => msg.role),
      ["user", "assistant"],
    );
    assert.equal(messages[0]?.content, "tighten skills");
  });
});
