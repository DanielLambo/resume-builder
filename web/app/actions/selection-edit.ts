"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import {
  DEFAULT_GROQ_MODEL,
  GROQ_BUSY_MESSAGE,
  isGroqRateLimitError,
  throwIfGroqFailed,
} from "@/lib/groq-model";
import { isMockAiEnabled } from "@/lib/mock-ai";
import {
  AiRateLimitError,
  assertWithinDailyAiLimit,
  DAILY_AI_TOKEN_LIMIT,
  incrementDailyAiTokens,
  rateLimitExceededPayload,
} from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import {
  formatWritingProfileForPrompt,
  writingProfileFromMetadata,
} from "@/lib/writing-profile";

const InputSchema = z
  .object({
    resumeId: z.string().uuid(),
    latex: z.string().min(1).max(400_000),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    selectedText: z.string().min(1).max(4_000),
    prompt: z.string().trim().min(1).max(1_000),
  })
  .refine((v) => v.end > v.start, {
    message: "end must be greater than start",
    path: ["end"],
  })
  .refine((v) => v.latex.slice(v.start, v.end) === v.selectedText, {
    message: "Selection no longer matches the source",
    path: ["selectedText"],
  });

export type SelectionEditResult =
  | {
      ok: true;
      latex: string;
      replacement: string;
      reply: string;
      tokensUsed: number;
      dailyTokensUsed: number;
      dailyTokensRemaining: number;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      code?:
        | "AI_DAILY_LIMIT"
        | "UNAUTHORIZED"
        | "VALIDATION"
        | "NOT_FOUND"
        | "INTERNAL";
      used?: number;
      limit?: number;
    };

const SelectionModelSchema = z.object({
  text: z.string().min(1).max(4_000),
  reply: z.string().min(1).max(500),
});

function asRecord(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function blockedLatex(text: string): boolean {
  return /\\write18|\\immediate\s*\\write|\\openout/.test(text);
}

function mockSelectionEdit(selectedText: string, prompt: string): {
  text: string;
  reply: string;
  tokens: number;
} {
  let text = selectedText.trim();
  if (/tighten|shorten|compress/i.test(prompt)) {
    text = text
      .replace(/\b(successfully|effectively|various|multiple)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (/humanize|de-?cringe/i.test(prompt)) {
    text = text
      .replace(/\bleveraged\b/gi, "used")
      .replace(/\butilized\b/gi, "used")
      .replace(/\bspearheaded\b/gi, "led");
  }
  if (text === selectedText.trim()) {
    text = selectedText.replace(/\.$/, "").trim() + ".";
  }
  return {
    text,
    reply: "Updated the selected span only.",
    tokens: 64,
  };
}

async function editSelectionWithGroq(input: {
  selectedText: string;
  prompt: string;
  profileNote: string;
}): Promise<{ text: string; reply: string; tokens: number }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  const baseUrl = (
    process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai"
  ).replace(/\/$/, "");
  const model = DEFAULT_GROQ_MODEL;

  const system = [
    "You edit one selected resume span only.",
    'Return JSON only: {"text":"...","reply":"..."}',
    "text replaces the selection exactly — no surrounding LaTeX unless it was selected.",
    "Keep facts honest. Do not invent employers, titles, dates, degrees, tools, or metrics.",
    input.profileNote,
  ]
    .filter(Boolean)
    .join(" ");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            prompt: input.prompt,
            selected_text: input.selectedText,
          }),
        },
      ],
    }),
  });

  throwIfGroqFailed(response);
  const raw: unknown = await response.json();
  const content = (
    raw as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }
  ).choices?.[0]?.message?.content;
  const tokens =
    (raw as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0;
  if (!content) throw new Error("Groq returned an empty message");
  const parsed = SelectionModelSchema.parse(JSON.parse(content) as unknown);
  if (blockedLatex(parsed.text)) {
    throw new Error("Blocked unsafe LaTeX in selection edit");
  }
  return { text: parsed.text, reply: parsed.reply, tokens };
}

/**
 * Scoped AI edit — only replaces the highlighted source span.
 */
export async function selectionEditAction(
  raw: unknown,
): Promise<SelectionEditResult> {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid selection",
    };
  }

  const { resumeId, latex, start, end, selectedText, prompt } = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        ok: false,
        status: 401,
        code: "UNAUTHORIZED",
        error: "Sign in to edit a selection.",
      };
    }

    if (!isMockAiEnabled()) {
      try {
        await assertWithinDailyAiLimit(user.id);
      } catch (err) {
        if (err instanceof AiRateLimitError) {
          const payload = rateLimitExceededPayload(err.used, err.limit);
          return {
            ok: false,
            status: 429,
            code: "AI_DAILY_LIMIT",
            error: payload.error,
            used: payload.used,
            limit: payload.limit,
          };
        }
        throw err;
      }
    }

    const { data: resume, error: loadError } = await supabase
      .from("resumes")
      .select("id, user_id, data_json")
      .eq("id", resumeId)
      .maybeSingle();

    if (loadError) {
      return { ok: false, status: 500, code: "INTERNAL", error: loadError.message };
    }
    if (!resume || resume.user_id !== user.id) {
      return { ok: false, status: 404, code: "NOT_FOUND", error: "Resume not found." };
    }

    const profileNote = formatWritingProfileForPrompt(
      writingProfileFromMetadata(user.user_metadata),
    );
    const edited = isMockAiEnabled()
      ? mockSelectionEdit(selectedText, prompt)
      : await editSelectionWithGroq({ selectedText, prompt, profileNote });

    const nextLatex = latex.slice(0, start) + edited.text + latex.slice(end);
    if (blockedLatex(nextLatex)) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: "Edit blocked for safety.",
      };
    }

    const prev = asRecord(resume.data_json);
    const version =
      typeof prev.version === "number" && Number.isFinite(prev.version)
        ? prev.version + 1
        : 1;
    const nextData = {
      ...prev,
      latex: nextLatex,
      version,
      template:
        (typeof prev.template === "string" && prev.template) || "new-grad",
    };

    const { error: updateError } = await supabase
      .from("resumes")
      .update({ data_json: nextData as unknown as Json })
      .eq("id", resumeId)
      .eq("user_id", user.id);

    if (updateError) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: updateError.message,
      };
    }

    const usage = isMockAiEnabled()
      ? await (async () => {
          try {
            return await incrementDailyAiTokens(user.id, edited.tokens);
          } catch {
            return {
              used: edited.tokens,
              remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - edited.tokens),
              limit: DAILY_AI_TOKEN_LIMIT,
            };
          }
        })()
      : await incrementDailyAiTokens(user.id, edited.tokens);

    revalidatePath(`/editor/${resumeId}`);
    revalidatePath("/dashboard");

    return {
      ok: true,
      latex: nextLatex,
      replacement: edited.text,
      reply: edited.reply,
      tokensUsed: edited.tokens,
      dailyTokensUsed: usage.used,
      dailyTokensRemaining: usage.remaining,
    };
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      const payload = rateLimitExceededPayload(err.used, err.limit);
      return {
        ok: false,
        status: 429,
        code: "AI_DAILY_LIMIT",
        error: payload.error,
        used: payload.used,
        limit: payload.limit,
      };
    }
    if (isGroqRateLimitError(err)) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: GROQ_BUSY_MESSAGE,
      };
    }
    return {
      ok: false,
      status: 500,
      code: "INTERNAL",
      error: err instanceof Error ? err.message : "Selection edit failed",
    };
  }
}
