import { z } from "zod";

import {
  buildHealHint,
  buildVibeSystemPrompt,
  buildVibeUserPayload,
} from "@/lib/ai/prompts";
import {
  extractLatexFromDataJson,
  validateResumeLatex,
} from "@/lib/ai/latex-guard";
import {
  buildResumeEditContext,
  detectEditIntent,
} from "@/lib/ai/resume-context";
import { isMockAiEnabled, mockVibeEdit } from "@/lib/mock-ai";
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

function groqConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
} {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  return {
    apiKey,
    baseUrl: (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai").replace(
      /\/$/,
      "",
    ),
    // Override with openai/gpt-oss-120b on Groq for max quality if available.
    model: process.env.RESUMATE_MODEL ?? "llama-3.3-70b-versatile",
    maxTokens: Number(process.env.RESUMATE_MAX_TOKENS ?? 8_192),
    temperature: Number(process.env.RESUMATE_TEMPERATURE ?? 0.35),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripMarkdownFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function mergePreservingMeta(
  prior: Record<string, unknown>,
  modelData: Record<string, unknown>,
  latex: string,
): Record<string, unknown> {
  // Model may drop job/template metadata — never lose those on merge.
  return {
    ...prior,
    ...modelData,
    latex,
    template:
      (typeof prior.template === "string" && prior.template) ||
      (typeof modelData.template === "string" && modelData.template) ||
      "new-grad",
    job: prior.job ?? modelData.job,
    version:
      typeof prior.version === "number"
        ? prior.version + 1
        : typeof modelData.version === "number"
          ? modelData.version
          : 1,
  };
}

async function callGroqOnce(input: {
  prompt: string;
  dataJson: Record<string, unknown>;
  healHint?: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}): Promise<GroqVibeEditResult> {
  const context = buildResumeEditContext(input.dataJson);
  const intent = detectEditIntent(input.prompt);
  const system = buildVibeSystemPrompt(intent);
  const userPayload = buildVibeUserPayload({
    prompt: input.prompt,
    dataJson: input.dataJson,
    context,
    healHint: input.healHint,
  });

  const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.healHint ? 0.15 : input.temperature,
      max_tokens: input.maxTokens,
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
    parsedJson = JSON.parse(stripMarkdownFences(content)) as unknown;
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

  const modelLatex = extractLatexFromDataJson(output.data_json);
  const latexError = validateResumeLatex(modelLatex, context.latex);
  if (latexError) {
    throw new Error(`LATEX_INVALID: ${latexError}`);
  }

  const mergedData = mergePreservingMeta(
    input.dataJson,
    output.data_json,
    modelLatex,
  );

  return {
    output: {
      data_json: mergedData,
      reply: output.reply.trim(),
    },
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
  maxRetries?: number;
  maxHealRetries?: number;
  onHeal?: (attempt: number, reason: string) => void;
}): Promise<GroqVibeEditResult> {
  if (isMockAiEnabled()) {
    return mockVibeEdit(input);
  }

  const { apiKey, baseUrl, model, maxTokens, temperature } = groqConfig();
  const maxRetries = input.maxRetries ?? 3;
  const maxHealRetries = input.maxHealRetries ?? 2;

  let healHint: string | undefined;
  let healed = false;
  let transportAttempt = 0;

  for (let heal = 0; heal <= maxHealRetries; heal += 1) {
    try {
      while (true) {
        try {
          const result = await callGroqOnce({
            prompt: input.prompt,
            dataJson: input.dataJson,
            healHint,
            apiKey,
            baseUrl,
            model,
            maxTokens,
            temperature,
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
        message.includes("Zod") ||
        message.includes("non-JSON");

      if (!healable || heal >= maxHealRetries) {
        throw err;
      }

      healed = true;
      const priorLatex = extractLatexFromDataJson(input.dataJson);
      healHint = buildHealHint(message, priorLatex);
      input.onHeal?.(heal + 1, message);
      await sleep(200);
    }
  }

  throw new Error("Self-heal exhausted");
}
