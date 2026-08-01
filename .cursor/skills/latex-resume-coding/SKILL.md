---
name: latex-resume-coding
description: Specialist LaTeX resume coding craft for Typesetter — surgical TeX edits, escaping, macros, compile fixes, and vibe-edit quality. Use when editing resume .tex, vibe prompts, Groq AI skills, or LaTeX compile/guard logic.
paths:
  - "**/*.tex"
  - "web/lib/ai/**"
  - "web/lib/resume-template.ts"
  - "web/lib/groq.ts"
  - "web/app/actions/vibe-edit.ts"
---

# LaTeX Resume Coding

When working on Typesetter resume TeX or the AI that edits it, follow the external skill document:

`web/lib/ai/skills/latex-resume-coding.md`

That file is the source of truth injected into the Groq vibe-edit system prompt via `loadLatexResumeCodingSkill()`.

## Rules of engagement

1. Read `web/lib/ai/skills/latex-resume-coding.md` before changing prompt/skill text or LaTeX guards.
2. Prefer surgical TeX diffs; never "helpfully" rewrite the whole resume.
3. Preserve preamble, macros (`\headerblock`, `\entry`), geometry, and section titles unless asked.
4. Escape `& % $ # _` in new prose; money as `\$`, percent as `\%`.
5. Never allow `\write18`, `\input{...}`, `\openout`, or shell escapes in model output or templates.
6. Keep `validateResumeLatex` and the skill document aligned when adding new footguns.
7. Override path for experiments: `RESUMATE_LATEX_SKILL_PATH=/path/to/skill.md`.

## Editing the skill

- Update the markdown under `web/lib/ai/skills/` — do not paste a second copy into `prompts.ts`.
- Add a regression test if you change routing or load behavior.
- After skill edits, run: `npx tsx --test lib/ai/*.test.ts` and `npx tsc --noEmit`.
