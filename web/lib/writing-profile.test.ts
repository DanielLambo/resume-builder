import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatWritingProfileForPrompt,
  writingProfileFromMetadata,
  writingProfileHasSignal,
} from "./writing-profile";

describe("writingProfileFromMetadata", () => {
  it("maps onboarding metadata", () => {
    const profile = writingProfileFromMetadata({
      full_name: "Alex Rivera",
      job_types: ["internship"],
      target_fields: ["software_engineering"],
      writing_instructions: "Ban leveraged",
    });
    assert.equal(profile.fullName, "Alex Rivera");
    assert.deepEqual(profile.jobTypes, ["internship"]);
    assert.equal(profile.instructions, "Ban leveraged");
    assert.equal(writingProfileHasSignal(profile), true);
  });

  it("handles empty metadata", () => {
    const profile = writingProfileFromMetadata(null);
    assert.equal(writingProfileHasSignal(profile), false);
  });

  it("truncates oversized fields instead of throwing", () => {
    const profile = writingProfileFromMetadata({
      full_name: "A".repeat(200),
      writing_instructions: "x".repeat(2_000),
      job_types: ["internship"],
    });
    assert.equal(profile.fullName?.length, 80);
    assert.equal(profile.instructions?.length, 500);
    assert.equal(writingProfileHasSignal(profile), true);
  });
});

describe("formatWritingProfileForPrompt", () => {
  it("returns empty when no signal", () => {
    assert.equal(
      formatWritingProfileForPrompt({
        fullName: "",
        jobTypes: [],
        targetFields: [],
        instructions: "",
      }),
      "",
    );
  });

  it("includes voice preferences", () => {
    const note = formatWritingProfileForPrompt({
      fullName: "Alex",
      jobTypes: ["internship"],
      targetFields: ["software_engineering"],
      instructions: "Short bullets",
    });
    assert.match(note, /Alex/);
    assert.match(note, /Internships/);
    assert.match(note, /Software Engineering/);
    assert.match(note, /Short bullets/);
  });
});
