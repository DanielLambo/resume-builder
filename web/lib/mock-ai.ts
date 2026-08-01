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
