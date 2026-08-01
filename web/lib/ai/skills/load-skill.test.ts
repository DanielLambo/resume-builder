import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, it, after } from "node:test";

import { buildVibeSystemPrompt } from "@/lib/ai/prompts";
import {
  clearLatexSkillCache,
  loadLatexResumeCodingSkill,
} from "@/lib/ai/skills/load-skill";

describe("external latex resume coding skill", () => {
  after(() => {
    clearLatexSkillCache();
    delete process.env.RESUMATE_LATEX_SKILL_PATH;
  });

  it("loads the markdown skill from disk", () => {
    clearLatexSkillCache();
    delete process.env.RESUMATE_LATEX_SKILL_PATH;
    const skill = loadLatexResumeCodingSkill();
    assert.match(skill, /LaTeX Resume Coding Skill/i);
    assert.match(skill, /\\documentclass|documentclass/i);
    assert.match(skill, /Escape|specials/i);
    assert.match(skill, /write18/i);
  });

  it("injects the skill into the vibe system prompt", () => {
    clearLatexSkillCache();
    const system = buildVibeSystemPrompt("add_content", "Add Docker to skills");
    assert.match(system, /External skill: LaTeX resume coding/);
    assert.match(system, /Surgical edit patterns|smallest correct/i);
    assert.match(system, /\\headerblock|headerblock|\\entry|Skills lines/i);
  });

  it("honors RESUMATE_LATEX_SKILL_PATH overrides", () => {
    const overridePath = join(
      process.cwd(),
      "lib/ai/skills/.test-override-skill.md",
    );
    writeFileSync(
      overridePath,
      "# Override Skill\n\nAlways escape ampersands as \\\\&.\n",
      "utf8",
    );
    try {
      clearLatexSkillCache();
      process.env.RESUMATE_LATEX_SKILL_PATH = overridePath;
      const skill = loadLatexResumeCodingSkill();
      assert.match(skill, /Override Skill/);
      assert.match(skill, /ampersands/);
    } finally {
      clearLatexSkillCache();
      delete process.env.RESUMATE_LATEX_SKILL_PATH;
      unlinkSync(overridePath);
    }
  });
});
