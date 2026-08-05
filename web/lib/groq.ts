import { z } from "zod";

import { parseAgentThread } from "@/lib/ai/agent-thread";
import { buildEditContextPack, buildReviewContextPack } from "@/lib/ai/context-pack";
import { indexLatex } from "@/lib/ai/resume-index";
import { applyResumeOps, ResumeOpSchema, type ResumeOp } from "@/lib/ai/resume-ops";
import { DEFAULT_GROQ_MODEL, GroqRateLimitError, throwIfGroqFailed } from "@/lib/groq-model";
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

const AgentReplySchema = z.object({
  reply: z.string().min(1),
  ops: z.array(ResumeOpSchema).max(24).optional(),
  latex: z.string().optional(),
  data_json: z.record(z.string(), z.unknown()).optional(),
});

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
    model: DEFAULT_GROQ_MODEL,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeLatex(latex: string): string | null {
  if (!latex.trim()) {
    return "latex missing or empty";
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

function parseModelJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const repaired = trimmed.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(repaired) as unknown;
  }
}

function resolveEditedLatex(
  previousLatex: string,
  index: ReturnType<typeof indexLatex>,
  parsed: z.infer<typeof AgentReplySchema>,
): { latex: string; opsApplied?: ResumeOp[] } {
  if (parsed.ops && parsed.ops.length > 0) {
    return {
      latex: applyResumeOps(previousLatex, index, parsed.ops),
      opsApplied: parsed.ops,
    };
  }

  const nestedLatex =
    parsed.data_json && typeof parsed.data_json.latex === "string"
      ? parsed.data_json.latex
      : "";
  const latex = (parsed.latex?.trim() ? parsed.latex : nestedLatex).trim();
  if (!latex) {
    throw new Error("INVALID_JSON: missing ops and latex");
  }
  return { latex };
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
  const previousLatex = getLatexFromDataJson(input.dataJson);
  const index = indexLatex(previousLatex);
  const thread = parseAgentThread(input.dataJson.agent_thread);
  const pack = buildEditContextPack({
    latex: previousLatex,
    index,
    prompt: input.prompt,
    thread,
    writingProfileNote: input.writingProfileNote,
    healHint: input.healHint,
  });

  if (pack.estimatedPromptTokens + pack.completionBudget > 7800) {
    throw new Error(
      "Resume is too long for one AI pass. Trim the source slightly, or try a smaller edit.",
    );
  }

  const requestBody: Record<string, unknown> = {
    model: input.model,
    temperature: 0.2,
    max_tokens: pack.completionBudget,
    response_format: { type: "json_object" },
    messages: pack.messages,
  };
  if (input.model.includes("gpt-oss")) {
    requestBody.reasoning_effort = "low";
  }

  const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  await throwIfGroqFailed(response);

  const raw: unknown = await response.json();
  const completion = GroqChatCompletionSchema.parse(raw);
  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("Groq returned an empty message");
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseModelJson(content);
  } catch {
    throw new Error("INVALID_JSON: Groq returned non-JSON content");
  }

  let parsed: z.infer<typeof AgentReplySchema>;
  try {
    parsed = AgentReplySchema.parse(parsedJson);
  } catch (err) {
    try {
      const legacy = VibeEditModelOutputSchema.parse(parsedJson);
      parsed = { reply: legacy.reply, latex: legacy.data_json.latex };
    } catch {
      const detail = err instanceof Error ? err.message : "schema mismatch";
      throw new Error(`INVALID_JSON: ${detail}`);
    }
  }

  let resolved: { latex: string; opsApplied?: ResumeOp[] };
  try {
    resolved = resolveEditedLatex(previousLatex, index, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "apply failed";
    if (message.startsWith("APPLY_FAILED")) {
      throw new Error(message);
    }
    throw err;
  }

  const latexError = looksLikeLatex(resolved.latex);
  if (latexError) {
    throw new Error(`LATEX_INVALID: ${latexError}`);
  }

  const wipe = detectContentWipe(previousLatex, resolved.latex);
  if (wipe) {
    throw new Error(wipe);
  }

  const output: VibeEditModelOutput = {
    reply: parsed.reply,
    data_json: {
      latex: resolved.latex,
    },
  };

  return {
    output,
    totalTokens: completion.usage.total_tokens,
    opsApplied: resolved.opsApplied,
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
          if (err instanceof GroqRateLimitError) {
            if (transportAttempt < 1) {
              await sleep(err.retryAfterMs ?? 1500);
              transportAttempt += 1;
              continue;
            }
            throw err;
          }
          const message = err instanceof Error ? err.message : String(err);
          const isTransport =
            /HTTP 5\d\d|fetch failed|network/i.test(message) &&
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
        message.startsWith("APPLY_FAILED") ||
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
  const pack = buildReviewContextPack({
    resumeBody: input.resumeBody,
    prompt: input.prompt,
    targetRole: input.targetRole,
    jobContext: input.jobContext,
    writingProfileNote: input.writingProfileNote,
    healHint: input.healHint,
  });

  const reviewBody: Record<string, unknown> = {
    model: input.model,
    temperature: 0.35,
    max_tokens: pack.completionBudget,
    response_format: { type: "json_object" },
    messages: pack.messages,
  };
  if (input.model.includes("gpt-oss")) {
    reviewBody.reasoning_effort = "low";
  }

  const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reviewBody),
  });

  await throwIfGroqFailed(response);

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
          if (err instanceof GroqRateLimitError) {
            if (transportAttempt < 1) {
              await sleep(err.retryAfterMs ?? 1500);
              transportAttempt += 1;
              continue;
            }
            throw err;
          }
          const message = err instanceof Error ? err.message : String(err);
          const isTransport =
            /HTTP 5\d\d|fetch failed|network/i.test(message) &&
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
