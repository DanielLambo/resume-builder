import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REVIEW_SYSTEM, VIBE_EDITOR_SYSTEM } from "./context-pack";
import {
  RECRUITER_QUALITY_RULES,
  RECRUITER_REVIEW_RULES,
} from "./recruiter-quality";

describe("recruiter quality rules", () => {
  it("encodes the three hiring-manager rules", () => {
    assert.match(RECRUITER_QUALITY_RULES, /Tailor/i);
    assert.match(RECRUITER_QUALITY_RULES, /Outcomes\s*>\s*tasks/i);
    assert.match(RECRUITER_QUALITY_RULES, /Technical depth/i);
    assert.match(RECRUITER_QUALITY_RULES, /Worked on/);
  });

  it("is injected into the vibe editor system prompt", () => {
    assert.ok(VIBE_EDITOR_SYSTEM.includes(RECRUITER_QUALITY_RULES));
    assert.match(VIBE_EDITOR_SYSTEM, /Outcomes\s*>\s*tasks/i);
    assert.match(VIBE_EDITOR_SYSTEM, /Technical depth/i);
  });

  it("is injected into the review system prompt", () => {
    assert.ok(REVIEW_SYSTEM.includes(RECRUITER_REVIEW_RULES));
    assert.match(REVIEW_SYSTEM, /tailor\|outcome\|depth/);
    assert.match(REVIEW_SYSTEM, /actionItems must address outcomes/i);
  });
});
