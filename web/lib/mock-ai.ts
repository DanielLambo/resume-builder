import { formatResumeLatex } from "@/lib/format-resume";
import { extractTargetRole, type GroqResumeReviewResult } from "@/lib/resume-review";
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

/**
 * Offline / CI synthetic vibe-edit — never calls Groq or Upstash.
 */
export function mockVibeEdit(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
}): GroqVibeEditResult {
  const latex = getLatexFromDataJson(input.dataJson);
  const prompt = input.prompt.toLowerCase();

  let nextLatex = latex;
  let reply = "Mock AI: no structural changes required.";

  if (
    input.prompt.toLowerCase().includes("compile error") ||
    input.prompt.toLowerCase().includes("fix this latex")
  ) {
    // Soft heal: ensure document env exists for broken drafts.
    if (!/\\begin\{document\}/i.test(nextLatex)) {
      nextLatex = `${nextLatex}\n\\begin{document}\n\\end{document}\n`;
    }
    if (!/\\documentclass/i.test(nextLatex)) {
      nextLatex = `\\documentclass{article}\n${nextLatex}`;
    }
    reply = "Mock AI: patched LaTeX so it can compile again.";
  }

  if (
    prompt.includes("recruiter house style") ||
    prompt.includes("format this entire resume") ||
    prompt.includes("recruiter-grade consistency") ||
    prompt.includes("format consistently") ||
    prompt.includes("house style")
  ) {
    nextLatex = formatResumeLatex(nextLatex);
    reply = "Unified dates, bullets, headers, and separators.";
  }

  if (
    prompt.includes("aws") ||
    prompt.includes("docker") ||
    prompt.includes("skills") ||
    prompt.includes("technical")
  ) {
    nextLatex = ensureSkillsWithAwsDocker(latex);
    reply = "Mock AI: added AWS and Docker to technical skills.";
  }

  if (prompt.includes("tailor this resume") || prompt.includes("job description:")) {
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
    totalTokens: 128,
  };
}

/**
 * Offline / CI synthetic resume review — never calls Groq.
 */
export function mockResumeReview(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
  targetRole?: string | null;
}): GroqResumeReviewResult {
  const latex = getLatexFromDataJson(input.dataJson);
  const role =
    input.targetRole?.trim() ||
    extractTargetRole(input.prompt) ||
    "general software role";
  const hasAws = /AWS/i.test(latex);
  const hasDocker = /Docker/i.test(latex);
  const hasMetrics = /\d+%|\d+\+|\$\d+/.test(latex);

  const keywordGaps: string[] = [];
  if (!hasAws) keywordGaps.push("AWS");
  if (!hasDocker) keywordGaps.push("Docker");
  if (!/test|pytest|jest|ci\b/i.test(latex)) keywordGaps.push("testing / CI");

  const fitScore = Math.min(
    9,
    5 + (hasMetrics ? 2 : 0) + (hasAws || hasDocker ? 1 : 0) + (keywordGaps.length === 0 ? 1 : 0),
  );

  return {
    totalTokens: 96,
    review: {
      targetRole: role,
      fitScore,
      summary: `For ${role}, this resume shows credible project and coursework signal, but several bullets stay task-shaped instead of outcome-shaped. Prioritize sharper impact wording and close the biggest keyword gaps that you can honestly support.`,
      strengths: [
        {
          title: "Concrete stack",
          detail:
            "Tools and languages are easy to scan, which helps a recruiter map you to the role quickly.",
        },
        {
          title: hasMetrics ? "Some quantified impact" : "Clear project ownership",
          detail: hasMetrics
            ? "Numeric outcomes already present — keep that style across weaker bullets."
            : "Projects read like work you owned, not class list items.",
        },
      ],
      gaps: [
        {
          title: keywordGaps.length
            ? "Role keyword coverage"
            : "Impact density",
          detail: keywordGaps.length
            ? `Missing or weak signals for: ${keywordGaps.join(", ")}. Only add these if evidenced by real work.`
            : "A few bullets still describe duties without a measurable result.",
          severity: keywordGaps.length >= 2 ? "high" : "medium",
        },
      ],
      bulletAdvice: [
        {
          quote: "Worked on",
          issue:
            "outcome — task-only opener; recruiters cannot tell what changed or shipped.",
          suggestion:
            "Lead with verb + object + outcome (e.g. 'Shipped X endpoint; cut p95 latency from A to B'). Add one technical signal (scale, constraint, or tool-in-use).",
        },
      ],
      keywordGaps,
      actionItems: [
        `Rewrite your weakest Experience/Projects bullet for ${role} with one honest outcome (recruiter rule: outcomes > tasks).`,
        keywordGaps[0]
          ? `If true, surface ${keywordGaps[0]} with real-world context — not just the tool name (recruiter rule: technical depth).`
          : "Move your strongest role-relevant project above weaker coursework (recruiter rule: tailor).",
        "Trim filler adjectives so each bullet is one crisp claim.",
      ],
      reply: `Mock review for ${role}: fit ${fitScore}/10 — tighten impact and close honest keyword gaps.`,
    },
  };
}
