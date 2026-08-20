---
name: recruiter-quality
description: Apply hiring-manager resume quality rules (tailor to role, outcomes over tasks, technical depth) when editing AI prompts, vibe edits, or resume reviews.
paths:
  - "web/lib/ai/**"
  - "web/lib/groq.ts"
  - "web/lib/resume-review.ts"
  - "web/lib/mock-ai.ts"
---

# Recruiter quality rules

Source of truth: `web/lib/ai/recruiter-quality.ts` (injected into `VIBE_EDITOR_SYSTEM` and `REVIEW_SYSTEM`).

## The three rules

1. **Tailor to the role** — float role-relevant evidence first; mirror JD language only with existing evidence.
2. **Outcomes > tasks** — every bullet shows what changed/shipped/improved/was prevented. No fabricated metrics.
3. **Technical depth** — one concrete signal beyond a tool name (scale, constraint, architecture, testing, prod context).

## When editing AI prompts

- Keep rules compact (token budget). Do not paste long essays into system prompts.
- Edit `recruiter-quality.ts`, not a second copy inside `context-pack.ts`.
- Preserve stable system-prefix caching: rules must stay byte-identical across users.
- Run: `npx tsx --test lib/ai/recruiter-quality.test.ts lib/ai/context-pack.test.ts`
