import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

import { detectEditIntent } from "@/lib/ai/resume-context";
import {
  extractReviewTarget,
  isReviewPrompt,
  reviewWantsFixes,
} from "@/lib/ai/review";
import { invokeGroqVibeEdit } from "@/lib/groq";
import { DEFAULT_RESUME_LATEX } from "@/lib/resume-template";

describe("review prompt routing", () => {
  it("recognizes common review phrasings", () => {
    const samples = [
      "Review my resume for a SWE intern role",
      "review for PM internship at Stripe",
      "How does this resume look for backend engineer?",
      "Give me feedback for data science new grad",
      "Rate my resume for software engineer",
      "Critique my resume",
    ];
    for (const sample of samples) {
      assert.equal(isReviewPrompt(sample), true, sample);
      assert.equal(detectEditIntent(sample), "review", sample);
    }
  });

  it("does not steal compile repairs into review", () => {
    assert.equal(
      detectEditIntent("Please fix the latex undefined control sequence"),
      "fix_latex",
    );
  });

  it("does not treat random feedback words as review", () => {
    assert.equal(isReviewPrompt("Add AWS and Docker to my technical skills"), false);
    assert.equal(
      detectEditIntent("Add AWS and Docker to my technical skills"),
      "add_content",
    );
    assert.equal(isReviewPrompt("Add AWS based on recruiter feedback"), false);
  });

  it("does not steal surgical edit prompts into advice-only review", () => {
    assert.equal(
      isReviewPrompt("Please review the Skills section and add Docker"),
      false,
    );
    assert.equal(
      detectEditIntent("Please review the Skills section and add Docker"),
      "add_content",
    );
    assert.equal(
      isReviewPrompt("Review the experience bullets and make them stronger"),
      false,
    );
    assert.equal(
      detectEditIntent("Review the experience bullets and make them stronger"),
      "rewrite_bullets",
    );
    assert.equal(isReviewPrompt("give me feedback on this bullet"), false);
  });

  it("extracts targets and strips apply-fixes tails", () => {
    assert.equal(
      extractReviewTarget("Review my resume for a SWE intern role"),
      "SWE intern",
    );
    assert.equal(
      extractReviewTarget("Review my resume for PM at Stripe and apply the fixes"),
      "PM at Stripe",
    );
  });

  it("detects review+fix requests", () => {
    assert.equal(
      reviewWantsFixes("Review my resume for SWE and apply the fixes"),
      true,
    );
    assert.equal(reviewWantsFixes("Review my resume for SWE intern"), false);
    assert.equal(
      reviewWantsFixes("Review my resume for SWE and then fix the issues"),
      true,
    );
  });
});

describe("mock review flow (invokeGroqVibeEdit)", () => {
  const priorEnv = process.env.NEXT_PUBLIC_USE_MOCK_AI;

  before(() => {
    process.env.NEXT_PUBLIC_USE_MOCK_AI = "true";
  });

  after(() => {
    if (priorEnv === undefined) {
      delete process.env.NEXT_PUBLIC_USE_MOCK_AI;
    } else {
      process.env.NEXT_PUBLIC_USE_MOCK_AI = priorEnv;
    }
  });

  it("advice-only review preserves latex and returns a long structured reply", async () => {
    const result = await invokeGroqVibeEdit({
      prompt: "Review my resume for a SWE intern role",
      dataJson: { latex: DEFAULT_RESUME_LATEX, template: "new-grad", version: 1 },
    });

    assert.equal(result.intent, "review");
    assert.equal(result.latexChanged, false);
    assert.equal(
      typeof result.output.data_json.latex === "string"
        ? result.output.data_json.latex
        : "",
      DEFAULT_RESUME_LATEX,
    );
    assert.ok(result.output.reply.length >= 280);
    assert.match(result.output.reply, /## Fit for/i);
    assert.match(result.output.reply, /## Highest-ROI next edits/i);
  });

  it("review+fixes may mutate latex while staying a review intent", async () => {
    const result = await invokeGroqVibeEdit({
      prompt: "Review my resume for SWE and apply the fixes",
      dataJson: { latex: DEFAULT_RESUME_LATEX, template: "new-grad", version: 1 },
    });

    assert.equal(result.intent, "review");
    assert.equal(result.latexChanged, true);
    assert.notEqual(result.output.data_json.latex, DEFAULT_RESUME_LATEX);
    assert.match(result.output.reply, /## Fit for/i);
  });
});
