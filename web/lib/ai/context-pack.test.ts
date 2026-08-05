import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPTY_AGENT_THREAD, pushAgentTurns } from "./agent-thread";
import { buildEditContextPack, VIBE_EDITOR_SYSTEM } from "./context-pack";
import { indexLatex } from "./resume-index";
import { getTemplate } from "../resume-template";

describe("buildEditContextPack", () => {
  const latex = getTemplate("new-grad").latex;

  it("sends a stable system prefix, outline, and focused spans — not full history latex", () => {
    const index = indexLatex(latex);
    const thread = pushAgentTurns(
      EMPTY_AGENT_THREAD,
      "old request with huge snapshot",
      "old reply",
    );
    const pack = buildEditContextPack({
      latex,
      index,
      prompt: "Add an internship at Rippling under experience",
      thread,
    });

    assert.equal(pack.messages[0]?.role, "system");
    assert.equal(pack.messages[0]?.content, VIBE_EDITOR_SYSTEM);
    const user = pack.messages.at(-1);
    assert.equal(user?.role, "user");
    assert.ok(user);
    const payload = JSON.parse(user.content) as {
      outline: unknown[];
      spans: Array<{ id: string; text: string }>;
      full_latex?: string;
    };
    assert.ok(payload.outline.length > 3);
    assert.ok(payload.spans.some((span) => span.id.startsWith("sec.experience")));
    assert.equal(payload.full_latex, undefined);
    assert.ok(!pack.messages.some((msg) => msg.content.includes(latex.slice(0, 80))));
    assert.ok(pack.estimatedPromptTokens < 2800);
    assert.ok(pack.completionBudget <= 1400);
  });
});
