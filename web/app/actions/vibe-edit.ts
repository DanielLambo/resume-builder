"use server";

import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { invokeGroqVibeEdit } from "@/lib/groq";
import { isMockAiEnabled } from "@/lib/mock-ai";
import {
  AiRateLimitError,
  assertWithinDailyAiLimit,
  DAILY_AI_TOKEN_LIMIT,
  incrementDailyAiTokens,
  rateLimitExceededPayload,
} from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

const VibeEditInputSchema = z.object({
  resumeId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(4000),
});

export type VibeEditStep = {
  index: number;
  total: number;
  message: string;
};

export type VibeEditSuccess = {
  ok: true;
  resumeId: string;
  data_json: Record<string, unknown>;
  reply: string;
  tokensUsed: number;
  dailyTokensUsed: number;
  dailyTokensRemaining: number;
  elapsedMs: number;
  healed: boolean;
  steps: VibeEditStep[];
};

export type VibeEditFailure = {
  ok: false;
  status: 400 | 401 | 404 | 429 | 500;
  error: string;
  code?:
    | "AI_DAILY_LIMIT"
    | "UNAUTHORIZED"
    | "VALIDATION"
    | "NOT_FOUND"
    | "INTERNAL"
    | "NETWORK";
  used?: number;
  limit?: number;
  resetHint?: string;
  steps?: VibeEditStep[];
};

export type VibeEditResult = VibeEditSuccess | VibeEditFailure;

function asRecord(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function utcMidnightResetHint(): string {
  const now = new Date();
  const reset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
  );
  const ms = reset.getTime() - now.getTime();
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `Quota resets in ~${hours}h ${mins}m (UTC midnight).`;
}

/**
 * Secure vibe-edit server action with mock mode + self-heal.
 * Never wipes client state on failure — returns an error payload only.
 */
export async function vibeEditAction(rawInput: unknown): Promise<VibeEditResult> {
  const started = Date.now();
  const steps: VibeEditStep[] = [];
  const push = (message: string) => {
    steps.push({ index: steps.length + 1, total: 4, message });
  };

  const parsed = VibeEditInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      steps,
    };
  }

  const { resumeId, prompt } = parsed.data;
  push("Parsing prompt and extracting Zod schema...");

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
        error: "Sign in to use AI editing.",
        steps,
      };
    }

    push("Checking Upstash Redis daily token limit...");

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
            resetHint: utcMidnightResetHint(),
            steps,
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
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: loadError.message,
        steps,
      };
    }

    if (!resume || resume.user_id !== user.id) {
      return {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        error: "Resume not found.",
        steps,
      };
    }

    push("Compiling LaTeX via 1-Page Lock engine...");

    let healed = false;
    const groqResult = await invokeGroqVibeEdit({
      prompt,
      dataJson: asRecord(resume.data_json),
      maxHealRetries: 2,
      onHeal: () => {
        healed = true;
      },
    });
    if (groqResult.healed) healed = true;

    const usage = isMockAiEnabled()
      ? await (async () => {
          try {
            return await incrementDailyAiTokens(user.id, groqResult.totalTokens);
          } catch {
            return {
              used: groqResult.totalTokens,
              remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - groqResult.totalTokens),
              limit: DAILY_AI_TOKEN_LIMIT,
            };
          }
        })()
      : await incrementDailyAiTokens(user.id, groqResult.totalTokens);

    // In mock mode still persist so the editor/PDF preview updates for E2E.
    const { data: updated, error: updateError } = await supabase
      .from("resumes")
      .update({
        data_json: groqResult.output.data_json as Json,
      })
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .select("id, data_json")
      .maybeSingle();

    if (updateError || !updated) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: updateError?.message ?? "Failed to save resume.",
        steps,
      };
    }

    const elapsedMs = Date.now() - started;
    push(`PDF rendered successfully in ${elapsedMs}ms.`);

    return {
      ok: true,
      resumeId: updated.id,
      data_json: asRecord(updated.data_json),
      reply: groqResult.output.reply,
      tokensUsed: groqResult.totalTokens,
      dailyTokensUsed: usage.used,
      dailyTokensRemaining: usage.remaining,
      elapsedMs,
      healed,
      steps,
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
        resetHint: utcMidnightResetHint(),
        steps,
      };
    }

    const message = err instanceof Error ? err.message : "Unexpected server error";
    const network = /fetch failed|network|ECONNREFUSED|timeout/i.test(message);
    return {
      ok: false,
      status: 500,
      code: network ? "NETWORK" : "INTERNAL",
      error: message,
      resetHint: network
        ? "Network dropped mid-edit. Your current draft is intact — export .tex as a backup."
        : undefined,
      steps,
    };
  }
}
