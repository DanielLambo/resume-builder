"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  didShortenBullet,
  mockShortenBullet,
  replaceItemText,
  type OrphanBullet,
} from "@/lib/analyzer/orphanDetector";
import type { Json } from "@/lib/database.types";
import { DEFAULT_GROQ_MODEL, throwIfGroqFailed } from "@/lib/groq-model";
import { isMockAiEnabled } from "@/lib/mock-ai";
import {
  AiRateLimitError,
  assertWithinDailyAiLimit,
  incrementDailyAiTokens,
  rateLimitExceededPayload,
} from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

const InputSchema = z
  .object({
    resumeId: z.string().uuid(),
    latex: z.string().min(1).max(400_000),
    itemStart: z.number().int().nonnegative(),
    itemEnd: z.number().int().positive(),
    itemText: z.string().min(1).max(4_000),
    kind: z.enum(["item", "resumeItem"]).default("item"),
  })
  .refine((v) => v.itemEnd > v.itemStart, {
    message: "itemEnd must be greater than itemStart",
    path: ["itemEnd"],
  });

export type ShortenBulletResult =
  | {
      ok: true;
      latex: string;
      shortenedText: string;
      tokensUsed: number;
      dailyTokensUsed: number;
      dailyTokensRemaining: number;
      unchanged?: boolean;
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

function asRecord(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function blockedLatex(text: string): boolean {
  return /\\write18|\\immediate\s*\\write|\\openout/.test(text);
}

async function shortenWithGroq(bullet: string): Promise<{
  text: string;
  tokens: number;
}> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  const baseUrl = (
    process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai"
  ).replace(/\/$/, "");
  const model = DEFAULT_GROQ_MODEL;

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 200,
      ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You tighten one resume bullet. Return JSON only: {"text":"..."}. Remove 2–4 filler words. Keep metrics, employers, articles, and LaTeX commands intact. Do not invent facts. Do not lengthen the bullet.',
        },
        {
          role: "user",
          content: JSON.stringify({ bullet }),
        },
      ],
    }),
  });

  await throwIfGroqFailed(response);

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  let text = bullet;
  try {
    const raw = JSON.parse(content) as unknown;
    const parsed = z.object({ text: z.string().min(1) }).safeParse(raw);
    if (parsed.success) {
      text = parsed.data.text.trim();
    }
  } catch {
    /* keep original */
  }
  return { text, tokens: Number(json.usage?.total_tokens ?? 80) };
}

function offsetsStillMatch(
  latex: string,
  itemStart: number,
  itemEnd: number,
  itemText: string,
  kind: OrphanBullet["kind"],
): boolean {
  if (itemEnd > latex.length || itemStart >= itemEnd) return false;
  const slice = latex.slice(itemStart, itemEnd);
  if (!slice.includes(itemText)) return false;
  if (kind === "resumeItem") {
    return /^\\resumeItem\b/.test(slice);
  }
  return /^\\item\b/.test(slice);
}

/**
 * Targeted micro-edit for a single bullet — independent of PDF compile.
 */
export async function shortenBulletAction(
  raw: unknown,
): Promise<ShortenBulletResult> {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { resumeId, latex, itemStart, itemEnd, itemText, kind } = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: "UNAUTHORIZED",
        error: "Sign in to shorten bullets.",
      };
    }

    if (!offsetsStillMatch(latex, itemStart, itemEnd, itemText, kind)) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        error: "Bullet location changed — refresh and try again.",
      };
    }

    const { data: resume, error: loadError } = await supabase
      .from("resumes")
      .select("id, user_id, data_json")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError || !resume) {
      return {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        error: "Resume not found.",
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

    let shortenedText: string;
    let tokensUsed: number;

    if (isMockAiEnabled()) {
      shortenedText = mockShortenBullet(itemText);
      tokensUsed = 24;
    } else {
      const result = await shortenWithGroq(itemText);
      shortenedText = result.text;
      tokensUsed = result.tokens;
    }

    if (blockedLatex(shortenedText)) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        error: "Shortened bullet contained blocked LaTeX.",
      };
    }

    // Reject lengthening / no-ops so we don't burn quota or dirty the doc.
    if (!didShortenBullet(itemText, shortenedText)) {
      return {
        ok: true,
        latex,
        shortenedText: itemText,
        tokensUsed: 0,
        dailyTokensUsed: 0,
        dailyTokensRemaining: 20_000,
        unchanged: true,
      };
    }

    const nextLatex = replaceItemText(
      latex,
      { start: itemStart, end: itemEnd, text: itemText, kind },
      shortenedText,
    );

    if (nextLatex === latex) {
      return {
        ok: true,
        latex,
        shortenedText: itemText,
        tokensUsed: 0,
        dailyTokensUsed: 0,
        dailyTokensRemaining: 20_000,
        unchanged: true,
      };
    }

    const usage = isMockAiEnabled()
      ? {
          used: tokensUsed,
          remaining: 20_000,
          limit: 20_000,
        }
      : await incrementDailyAiTokens(user.id, tokensUsed);

    const prev = asRecord(resume.data_json);
    const { error: updateError } = await supabase
      .from("resumes")
      .update({
        data_json: {
          ...prev,
          latex: nextLatex,
          version: typeof prev.version === "number" ? prev.version + 1 : 1,
        } as unknown as Json,
      })
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

    revalidatePath("/dashboard");
    revalidatePath(`/editor/${resumeId}`);

    return {
      ok: true,
      latex: nextLatex,
      shortenedText,
      tokensUsed,
      dailyTokensUsed: usage.used,
      dailyTokensRemaining: usage.remaining,
    };
  } catch (err) {
    return {
      ok: false,
      code: "INTERNAL",
      error: err instanceof Error ? err.message : "Shorten failed",
    };
  }
}
