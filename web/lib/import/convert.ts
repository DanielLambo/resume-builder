import { z } from "zod";

import { DEFAULT_GROQ_MODEL, throwIfGroqFailed } from "@/lib/groq-model";
import { IMPORT_SOURCE_TEXT_MAX } from "@/lib/import/constants";
import { ensureHousePreamble, latexValidationError } from "@/lib/import/validate";
import { isMockAiEnabled } from "@/lib/mock-ai";
import {
  HOUSE_LATEX_PREAMBLE,
  getTemplate,
} from "@/lib/resume-template";

const ConvertOutputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  latex: z.string().min(40).max(400_000),
  notes: z.string().max(500).optional().default(""),
});

export type ConvertOutput = z.infer<typeof ConvertOutputSchema>;

export type ConvertResult = {
  output: ConvertOutput;
  totalTokens: number;
};

const GroqUsageSchema = z.object({
  total_tokens: z.number().int().nonnegative(),
});

const GroqChatSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
  usage: GroqUsageSchema,
});

function escapeLatexText(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([%#$&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

export function mockConvertResume(sourceText: string, fallbackTitle: string): ConvertResult {
  const lines = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);

  const name = lines[0]?.slice(0, 80) || "Imported candidate";
  const contactParts = lines
    .slice(1, 4)
    .filter((line) => /@|linkedin|github|\d{3}/i.test(line))
    .slice(0, 3)
    .map((line) => escapeLatexText(line));

  const bullets = lines
    .slice(1)
    .filter((line) => line.length > 24 && !/@/.test(line))
    .slice(0, 12)
    .map((line) => `  \\item ${escapeLatexText(line.replace(/^[-•*]\s*/, ""))}`)
    .join("\n");

  const latex = `${HOUSE_LATEX_PREAMBLE}
\\begin{document}
\\headerblock{${escapeLatexText(name)}}{${contactParts.join(" $\\cdot$ ") || "email@example.com"}}

\\section*{Imported}
\\begin{itemize}
${bullets || "  \\item Review and replace these imported lines in the studio."}
\\end{itemize}
\\end{document}
`;

  return {
    totalTokens: 64,
    output: {
      title: fallbackTitle.slice(0, 120) || "Imported resume",
      latex,
      notes: "Mock import — review every line before applying.",
    },
  };
}

function houseTemplateLatex(): string {
  return getTemplate("blank").latex;
}

async function callConvertOnce(input: {
  sourceText: string;
  fallbackTitle: string;
  healHint?: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<ConvertResult> {
  const system = [
    "You convert an imported resume into Resumate house-style LaTeX.",
    "Return JSON only: {\"title\": string, \"latex\": string, \"notes\": string}",
    "Copy this preamble exactly, then \\begin{document} ... \\end{document}.",
    "Commands: \\headerblock{Name}{contact · contact}, \\section*{Title}, \\entry{left}{dates}{subtitle}, itemize bullets.",
    "Escape LaTeX specials in user text (%, &, $, #, _, {, }).",
    "Do not invent employers, titles, dates, schools, tools, or metrics.",
    "If a line is garbled, omit it rather than guess.",
    "Keep every clear fact. One page, letter, 11pt.",
    "Tighten weak wording without inflating claims.",
    "Ban: passionate, results-driven, leveraged, spearheaded, cutting-edge, robust, seamless.",
  ].join(" ");

  const userPayload: Record<string, unknown> = {
    fallback_title: input.fallbackTitle,
    source_text: input.sourceText.slice(0, IMPORT_SOURCE_TEXT_MAX),
    template_latex: houseTemplateLatex().slice(0, 4000),
  };
  if (input.healHint) {
    userPayload.validation_error = input.healHint;
    userPayload.instruction =
      "Previous output failed validation. Fix and return valid JSON only.";
  }

  const body: Record<string, unknown> = {
    model: input.model,
    temperature: 0.15,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };
  if (input.model.includes("gpt-oss")) {
    body.reasoning_effort = "low";
  }

  const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await throwIfGroqFailed(response);

  const raw: unknown = await response.json();
  const completion = GroqChatSchema.parse(raw);
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("Groq returned an empty message");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content) as unknown;
  } catch {
    throw new Error("INVALID_JSON: Groq returned non-JSON content");
  }

  let output: ConvertOutput;
  try {
    output = ConvertOutputSchema.parse(parsedJson);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "schema mismatch";
    throw new Error(`INVALID_JSON: ${detail}`);
  }

  output = {
    ...output,
    latex: ensureHousePreamble(output.latex),
  };

  const latexError = latexValidationError(output.latex);
  if (latexError) {
    throw new Error(`LATEX_INVALID: ${latexError}`);
  }

  return {
    output,
    totalTokens: completion.usage.total_tokens,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function convertImportedText(input: {
  sourceText: string;
  fallbackTitle: string;
}): Promise<ConvertResult> {
  if (isMockAiEnabled()) {
    return mockConvertResume(input.sourceText, input.fallbackTitle);
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  const baseUrl = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai").replace(
    /\/$/,
    "",
  );
  const model = DEFAULT_GROQ_MODEL;

  let healHint: string | undefined;
  let transportAttempt = 0;

  for (let heal = 0; heal <= 2; heal += 1) {
    try {
      while (true) {
        try {
          return await callConvertOnce({
            sourceText: input.sourceText,
            fallbackTitle: input.fallbackTitle,
            healHint,
            apiKey,
            baseUrl,
            model,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransport =
            /HTTP 429|HTTP 5\d\d|fetch failed|network/i.test(message) &&
            !message.startsWith("INVALID_JSON") &&
            !message.startsWith("LATEX_INVALID");
          if (isTransport && transportAttempt < 3) {
            await sleep(Math.min(4000, 300 * 2 ** transportAttempt));
            transportAttempt += 1;
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const healable =
        message.startsWith("INVALID_JSON") || message.startsWith("LATEX_INVALID");
      if (!healable || heal >= 2) throw err;
      healHint = message;
      await sleep(200);
    }
  }

  throw new Error("Self-heal exhausted");
}
