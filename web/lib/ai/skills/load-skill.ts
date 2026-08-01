import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * External LaTeX coding skill — kept as markdown so it can be edited
 * without touching prompt assembly. Override at runtime with
 * RESUMATE_LATEX_SKILL_PATH=/absolute/path/to/skill.md
 */

const SKILL_BASENAME = "latex-resume-coding.md";

/** Compact emergency fallback if the .md file is missing from the deploy bundle. */
const FALLBACK_SKILL = `# LaTeX Resume Coding Skill

- Return a FULL compilable document (\\documentclass … \\begin{document} … \\end{document}).
- Prefer the smallest correct TeX diff; preserve preamble, macros, geometry, and section titles.
- Escape &, %, $, #, _, {, } in new prose. Money as \\$N; percent as N\\%.
- Never emit \\write18, \\immediate, \\openout, \\input{...}, or \\include.
- Match neighboring \\item / \\entry / Skills line patterns.
- Keep unescaped $ count even. Do not change \\documentclass unless asked.
- Self-check: full doc intact, sections preserved, specials escaped, diff matches the prompt.`;

let cached: string | null = null;

function stripFrontmatter(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) return trimmed;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return trimmed;
  return trimmed.slice(end + 4).trim();
}

function moduleDir(): string | null {
  try {
    if (typeof __dirname === "string" && __dirname.length > 0) {
      return __dirname;
    }
  } catch {
    /* ignore */
  }
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
}

function candidatePaths(): string[] {
  const override = process.env.RESUMATE_LATEX_SKILL_PATH?.trim();
  const here = moduleDir();
  return [
    override,
    join(process.cwd(), "lib/ai/skills", SKILL_BASENAME),
    join(process.cwd(), "web/lib/ai/skills", SKILL_BASENAME),
    here ? join(here, SKILL_BASENAME) : null,
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
}

/**
 * Load the external LaTeX resume coding skill markdown.
 * Prefer disk (editable skill file); fall back to a compact embedded skill.
 */
export function loadLatexResumeCodingSkill(): string {
  if (cached) return cached;

  for (const path of candidatePaths()) {
    try {
      const body = stripFrontmatter(readFileSync(path, "utf8"));
      if (body.length > 0) {
        cached = body;
        return cached;
      }
    } catch {
      /* try next candidate */
    }
  }

  cached = FALLBACK_SKILL;
  return cached;
}

/** Test helper — clear memoization between cases. */
export function clearLatexSkillCache(): void {
  cached = null;
}
