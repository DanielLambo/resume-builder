import { detectEditIntent } from "@/lib/ai/resume-context";
import { extractReviewTarget, reviewWantsFixes } from "@/lib/ai/review";
import type { GroqVibeEditResult, VibeEditModelOutput } from "@/lib/vibe-types";
import { getLatexFromDataJson } from "@/lib/resume-template";

export function isMockAiEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCK_AI === "true" ||
    process.env.USE_MOCK_AI === "true"
  );
}

function ensureSkillsWithAwsDocker(latex: string): string {
  let next = latex;

  if (/\\section\*\{Skills\}|\\section\{Skills\}/i.test(next)) {
    next = next.replace(
      /(\\(?:section\*|section)\{Skills\}[\s\S]*?)(\\section|\\section\*|\\end\{document\})/i,
      (block, skillsBlock: string, tail: string) => {
        let body = skillsBlock;
        if (!/Docker/i.test(body)) {
          body = body.trimEnd() + (body.trimEnd().endsWith("\n") ? "" : "\n") + "Docker\n";
        }
        if (!/AWS/i.test(body)) {
          body = body.replace(/(Docker)/i, "$1, AWS");
          if (!/AWS/i.test(body)) {
            body = body.trimEnd() + ", AWS\n";
          }
        }
        // Prefer a single skills line for the default template
        if (/Python,\s*TypeScript,\s*SQL/i.test(body)) {
          body = body.replace(
            /Python,\s*TypeScript,\s*SQL(?:,\s*Docker)?(?:,\s*AWS)?/i,
            "Python, TypeScript, SQL, Docker, AWS",
          );
        }
        return `${body}${tail}`;
      },
    );
    return next;
  }

  return next.replace(
    /\\end\{document\}/i,
    "\\section*{Skills}\nPython, TypeScript, SQL, Docker, AWS\n\\end{document}",
  );
}

function extractJobLabel(prompt: string): string | null {
  const company = prompt.match(/company:\s*(.+)/i)?.[1]?.trim();
  const role = prompt.match(/role:\s*(.+)/i)?.[1]?.trim();
  if (company && role) return `${role} @ ${company}`;
  return null;
}

function mockReviewReply(prompt: string, latex: string): string {
  const target = extractReviewTarget(prompt) ?? "general competitive screen";
  const hasProjects = /\\section\*?\{Projects\}/i.test(latex);
  const hasSkills = /\\section\*?\{Skills\}/i.test(latex);
  return [
    `## Fit for ${target}`,
    "Verdict: solid early-career sheet with honest project signal — about 7/10 for a competitive intern loop if bullets get sharper.",
    "",
    "## What works",
    "- Concrete project/experience structure is scannable in under 6 seconds.",
    hasProjects
      ? "- Projects section gives you room to prove ownership beyond coursework."
      : "- Education grounding is present; add a Projects section if you have shipped work.",
    hasSkills
      ? "- Skills section exists — keep it short labels, not corporate taxonomy."
      : "- Consider a tight Skills line so ATS/recruiters can match tools fast.",
    "",
    "## Gaps vs the role",
    `- For ${target}, lead with the 2 bullets that best prove the stack/impact they want.`,
    "- Weak bullets still read task-shaped; convert to verb + object + honest outcome.",
    "- If a required tool isn't evidenced in bullets, don't fake it in Skills — add a real project line or leave it out.",
    "",
    "## Bullet-level notes",
    '- Prefer "Shipped X used by N…" over "Worked on X resulting in improvement".',
    "- Cut filler adverbs before cutting metrics.",
    "",
    "## Highest-ROI next edits",
    "1. Reorder Experience/Projects so the strongest role-relevant bullet is first under each entry.",
    "2. Rewrite the weakest bullet into one printed line with a concrete noun.",
    "3. Align Skills with tools already proven in bullets (no keyword theater).",
    "4. Ask Typesetter to tailor against the full JD once the base sheet is tight.",
    "5. Compile and confirm 1-page lock before applying.",
    "",
    "## ATS / clarity watchouts",
    "- Keep section titles stable; avoid AI sludge (leveraged, spearheaded, robust).",
    "- Don't invent percentages — recruiters catch fake precision.",
  ].join("\n");
}

/**
 * Offline / CI synthetic vibe-edit — never calls Groq or Upstash.
 */
export function mockVibeEdit(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
}): GroqVibeEditResult {
  const latex = getLatexFromDataJson(input.dataJson);
  const prompt = input.prompt.toLowerCase();
  const intent = detectEditIntent(input.prompt);

  let nextLatex = latex;
  let reply = "Mock AI: no structural changes required.";

  if (intent === "review") {
    reply = mockReviewReply(input.prompt, latex);
    if (reviewWantsFixes(input.prompt)) {
      nextLatex = ensureSkillsWithAwsDocker(latex);
      reply +=
        "\n\n(Applied a small honest skills tightening because you asked to fix.)";
    }
  } else if (
    prompt.includes("aws") ||
    prompt.includes("docker") ||
    prompt.includes("skills") ||
    prompt.includes("technical")
  ) {
    nextLatex = ensureSkillsWithAwsDocker(latex);
    reply = "Mock AI: added AWS and Docker to technical skills.";
  }

  if (
    intent !== "review" &&
    (prompt.includes("tailor this resume") || prompt.includes("job description:"))
  ) {
    nextLatex = ensureSkillsWithAwsDocker(nextLatex);
    const label = extractJobLabel(input.prompt);
    // Soft marker in the document comment region — keeps compile stable.
    if (!/% tailored-for:/i.test(nextLatex)) {
      nextLatex = nextLatex.replace(
        /\\begin\{document\}/i,
        `\\begin{document}\n% tailored-for: ${label ?? "job application"}`,
      );
    }
    reply = label
      ? `Mock AI: tailored bullets and skills for ${label}.`
      : "Mock AI: tailored resume toward the pasted job description.";
  }

  const output: VibeEditModelOutput = {
    data_json: {
      ...input.dataJson,
      latex: nextLatex,
      version:
        typeof input.dataJson.version === "number" ? input.dataJson.version + 1 : 1,
    },
    reply,
  };

  return {
    output,
    totalTokens: intent === "review" ? 256 : 128,
    intent,
    latexChanged: nextLatex !== latex,
  };
}
