import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectEditIntent } from "@/lib/ai/resume-context";
import {
  extractReviewTarget,
  isReviewPrompt,
  reviewWantsFixes,
} from "@/lib/ai/review";

describe("resume review intent", () => {
  it("detects review prompts", () => {
    assert.equal(isReviewPrompt("Review my resume for a SWE intern role"), true);
    assert.equal(detectEditIntent("Review my resume for PM internship"), "review");
    assert.equal(
      detectEditIntent("How does this resume look for backend engineer?"),
      "review",
    );
  });

  it("extracts the target role", () => {
    assert.equal(
      extractReviewTarget("Review my resume for a SWE intern role"),
      "SWE intern",
    );
  });

  it("detects review-and-fix requests", () => {
    assert.equal(
      reviewWantsFixes("Review my resume for SWE and apply the fixes"),
      true,
    );
    assert.equal(reviewWantsFixes("Review my resume for SWE intern"), false);
  });

  it("keeps section/bullet edit prompts out of review mode", () => {
    assert.equal(
      isReviewPrompt("Please review the Skills section and add Docker"),
      false,
    );
    assert.equal(
      detectEditIntent("Please review the Skills section and add Docker"),
      "add_content",
    );
  });
});
