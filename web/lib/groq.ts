import { z } from "zod";

import { isMockAiEnabled, mockResumeReview, mockVibeEdit } from "@/lib/mock-ai";
import {
  extractTargetRole,
  latexBodyForReview,
  ResumeReviewSchema,
  type GroqResumeReviewResult,
  type ResumeReview,
} from "@/lib/resume-review";
import { detectContentWipe } from "@/lib/latex-preservation";
import { getLatexFromDataJson } from "@/lib/resume-template";
import {
  VibeEditModelOutputSchema,
  type GroqVibeEditResult,
  type VibeEditModelOutput,
} from "@/lib/vibe-types";

export {
  VibeEditModelOutputSchema,
  type GroqVibeEditResult,
  type VibeEditModelOutput,
} from "@/lib/vibe-types";

export type { GroqResumeReviewResult, ResumeReview } from "@/lib/resume-review";

const GroqUsageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().int().nonnegative(),
});

const GroqChoiceSchema = z.object({
  message: z.object({
    content: z.string(),
    role: z.string().optional(),
  }),
  finish_reason: z.string().nullable().optional(),
});

const GroqChatCompletionSchema = z.object({
  choices: z.array(GroqChoiceSchema).min(1),
  usage: GroqUsageSchema,
});

function groqConfig(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  return {
    apiKey,
    baseUrl: (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai").replace(/\/$/, ""),
    model: process.env.RESUMATE_MODEL ?? "llama-3.3-70b-versatile",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeLatex(dataJson: Record<string, unknown>): string | null {
  const latex = dataJson.latex;
  if (typeof latex !== "string" || !latex.trim()) {
    return "data_json.latex missing or empty";
  }
  if (!/\\documentclass/.test(latex)) {
    return "LaTeX missing \\documentclass";
  }
  if (!/\\begin\{document\}/.test(latex) || !/\\end\{document\}/.test(latex)) {
    return "LaTeX missing document environment";
  }
  if (/\\write18|\\immediate\\s*\\write|\\openout/.test(latex)) {
    return "LaTeX contains blocked shell escapes";
  }
  return null;
}

async function callGroqOnce(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
  healHint?: string;
  writingProfileNote?: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<GroqVibeEditResult> {
  const system = [
    "You are Resumate's vibe editor.",
    "Return JSON only matching:",
    '{"data_json": object, "reply": string}',
    "data_json MUST include a full compilable LaTeX string in the `latex` field.",
    "Make the smallest possible surgical edit that satisfies the prompt.",
    "Never delete, rewrite, or omit unrelated jobs, bullets, education, skills, or sections.",
    "If the user adds one role (for example an internship at Rippling), INSERT that role and keep every other entry verbatim.",
    "Do not invent employers, dates, or metrics. If a detail is missing, use a short placeholder the user can fill.",
    "Reply in one sentence listing only what changed.",
    input.writingProfileNote?.trim() || "",
  ]
    .filter(Boolean)
    .join(" ");

  const userPayload: Record<string, unknown> = {
    prompt: input.prompt,
    data_json: input.dataJson,
  };
  if (input.healHint) {
    userPayload.compiler_error = input.healHint;
    userPayload.instruction =
      "Previous output failed validation/compile. Fix the LaTeX and return valid JSON only.";
  }

  const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error (HTTP ${response.status})`);
  }

  const raw: unknown = await response.json();
  const completion = GroqChatCompletionSchema.parse(raw);
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("Groq returned an empty message");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content) as unknown;
  } catch {
    throw new Error("INVALID_JSON: Groq returned non-JSON content");
  }

  let output: VibeEditModelOutput;
  try {
    output = VibeEditModelOutputSchema.parse(parsedJson);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "schema mismatch";
    throw new Error(`INVALID_JSON: ${detail}`);
  }
  const latexError = looksLikeLatex(output.data_json);
  if (latexError) {
    throw new Error(`LATEX_INVALID: ${latexError}`);
  }

  const previousLatex = getLatexFromDataJson(input.dataJson);
  const nextLatex = getLatexFromDataJson(output.data_json);
  const wipe = detectContentWipe(previousLatex, nextLatex);
  if (wipe) {
    throw new Error(wipe);
  }

  return {
    output,
    totalTokens: completion.usage.total_tokens,
  };
}

/**
 * Call Groq in JSON mode with exponential backoff on 429 / 5xx,
 * plus up to 2 self-heal retries when JSON/LaTeX validation fails.
 */
export async function invokeGroqVibeEdit(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
  /** Seed heal path with a known compile/validation error. */
  healHint?: string;
  writingProfileNote?: string;
  maxRetries?: number;
  maxHealRetries?: number;
  onHeal?: (attempt: number, reason: string) => void;
}): Promise<GroqVibeEditResult> {
  if (isMockAiEnabled()) {
    return mockVibeEdit(input);
  }

  const { apiKey, baseUrl, model } = groqConfig();
  const maxRetries = input.maxRetries ?? 3;
  const maxHealRetries = input.maxHealRetries ?? 2;

  let healHint: string | undefined = input.healHint?.trim() || undefined;
  let healed = Boolean(healHint);
  let transportAttempt = 0;

  for (let heal = 0; heal <= maxHealRetries; heal += 1) {
    try {
      while (true) {
        try {
          const result = await callGroqOnce({
            prompt: input.prompt,
            dataJson: input.dataJson,
            healHint,
            writingProfileNote: input.writingProfileNote,
            apiKey,
            baseUrl,
            model,
          });
          return { ...result, healed };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransport =
            /HTTP 429|HTTP 5\d\d|fetch failed|network/i.test(message) &&
            !message.startsWith("INVALID_JSON") &&
            !message.startsWith("LATEX_INVALID");

          if (isTransport && transportAttempt < maxRetries) {
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
        message.startsWith("INVALID_JSON") ||
        message.startsWith("LATEX_INVALID") ||
        message.startsWith("CONTENT_WIPED") ||
        message.includes("Zod") ||
        message.includes("non-JSON");

      if (!healable || heal >= maxHealRetries) {
        throw err;
      }

      healed = true;
      healHint = message;
      input.onHeal?.(heal + 1, message);
      await sleep(200);
    }
  }

  throw new Error("Self-heal exhausted");
}

async function callGroqReviewOnce(input: {
  prompt: string;
  resumeBody: string;
  targetRole: string | null;
  jobContext: { company: string; role: string; description: string } | null;
  healHint?: string;
  writingProfileNote?: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<GroqResumeReviewResult> {
  const system = [
    "You are Resumate's resume reviewer — a sharp hiring manager and technical recruiter.",
    "This is ANALYSIS ONLY. Do not rewrite the resume. Do not invent employers, titles, degrees, tools, or metrics.",
    "Ground every claim in the resume text. Prefer specific, prioritized advice a candidate can act on today.",
    "When a target role is given, judge fit for that role; call out keyword gaps only when the resume lacks related evidence.",
    "Score fitScore from 1–10 for the stated role (or general new-grad SWE if none).",
    "bulletAdvice must quote real phrases from the resume when possible.",
    "actionItems must be concrete next steps (not vague 'network more').",
    input.writingProfileNote?.trim() || "",
    "Return JSON only matching:",
    JSON.stringify({
      targetRole: "string|null",
      fitScore: "1-10",
      summary: "2-4 sentence verdict",
      strengths: [{ title: "string", detail: "string" }],
      gaps: [{ title: "string", detail: "string", severity: "high|medium|low" }],
      bulletAdvice: [{ quote: "string", issue: "string", suggestion: "string" }],
      keywordGaps: ["string"],
      actionItems: ["string"],
      reply: "short UI blurb",
    }),
  ]
    .filter(Boolean)
    .join(" ");

  const userPayload: Record<string, unknown> = {
    prompt: input.prompt,
    target_role: input.targetRole,
    job_context: input.jobContext,
    resume_body: input.resumeBody,
  };
  if (input.healHint) {
    userPayload.validation_error = input.healHint;
    userPayload.instruction =
      "Previous output failed schema validation. Fix and return valid JSON only.";
  }

  const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.35,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error (HTTP ${response.status})`);
  }

  const raw: unknown = await response.json();
  const completion = GroqChatCompletionSchema.parse(raw);
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("Groq returned an empty message");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content) as unknown;
  } catch {
    throw new Error("INVALID_JSON: Groq returned non-JSON content");
  }

  let review: ResumeReview;
  try {
    review = ResumeReviewSchema.parse(parsedJson);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "schema mismatch";
    throw new Error(`INVALID_JSON: ${detail}`);
  }

  // Prefer extracted role when the model omits it.
  if (!review.targetRole && input.targetRole) {
    review = { ...review, targetRole: input.targetRole };
  }

  return {
    review,
    totalTokens: completion.usage.total_tokens,
  };
}

/**
 * Non-mutating Groq review with backoff + schema self-heal.
 */
export async function invokeGroqResumeReview(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
  targetRole?: string | null;
  jobContext?: { company: string; role: string; description: string } | null;
  writingProfileNote?: string;
  maxRetries?: number;
  maxHealRetries?: number;
}): Promise<GroqResumeReviewResult> {
  if (isMockAiEnabled()) {
    return mockResumeReview(input);
  }

  const latex =
    typeof input.dataJson.latex === "string" ? input.dataJson.latex : "";
  if (!latex.trim()) {
    throw new Error("Resume LaTeX is empty — nothing to review.");
  }

  const { apiKey, baseUrl, model } = groqConfig();
  const maxRetries = input.maxRetries ?? 3;
  const maxHealRetries = input.maxHealRetries ?? 2;
  const targetRole =
    input.targetRole ?? extractTargetRole(input.prompt) ?? null;
  const resumeBody = latexBodyForReview(latex);

  let healHint: string | undefined;
  let transportAttempt = 0;

  for (let heal = 0; heal <= maxHealRetries; heal += 1) {
    try {
      while (true) {
        try {
          return await callGroqReviewOnce({
            prompt: input.prompt,
            resumeBody,
            targetRole,
            jobContext: input.jobContext ?? null,
            writingProfileNote: input.writingProfileNote,
            healHint,
            apiKey,
            baseUrl,
            model,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransport =
            /HTTP 429|HTTP 5\d\d|fetch failed|network/i.test(message) &&
            !message.startsWith("INVALID_JSON");

          if (isTransport && transportAttempt < maxRetries) {
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
        message.startsWith("INVALID_JSON") ||
        message.includes("Zod") ||
        message.includes("non-JSON");

      if (!healable || heal >= maxHealRetries) {
        throw err;
      }

      healHint = message;
      await sleep(200);
    }
  }

  throw new Error("Self-heal exhausted");
}
