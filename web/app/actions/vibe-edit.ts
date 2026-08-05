"use server";

import { injectLaTeXConfig } from "@resumate/one-page-lock";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { sanitizeCompileError } from "@/lib/compile-latex";
import { fitResumeToSinglePage } from "@/lib/fit-resume";
import { invokeGroqResumeReview, invokeGroqVibeEdit } from "@/lib/groq";
import { isGroqRateLimitError, messageForGroqLimit } from "@/lib/groq-model";
import { latexFromVibeOutput } from "@/lib/vibe-types";
import { getJobTargetFromDataJson } from "@/lib/job-target";
import { isMockAiEnabled } from "@/lib/mock-ai";
import { persistResumePdf } from "@/lib/persist-resume-pdf";
import {
  AiRateLimitError,
  assertWithinDailyAiLimit,
  DAILY_AI_TOKEN_LIMIT,
  incrementDailyAiTokens,
  rateLimitExceededPayload,
} from "@/lib/ratelimit";
import { parseAgentThread, pushAgentTurns } from "@/lib/ai/agent-thread";
import { pushAiHistory } from "@/lib/ai-history";
import {
  extractTargetRole,
  isResumeReviewPrompt,
  type ResumeReview,
} from "@/lib/resume-review";
import { isResumeTemplateId } from "@/lib/resume-template";
import { createClient } from "@/lib/supabase/server";
import {
  formatWritingProfileForPrompt,
  writingProfileFromMetadata,
} from "@/lib/writing-profile";

const VibeEditInputSchema = z.object({
  resumeId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(4000),
  /** Live editor buffer — prefer this over possibly stale DB latex. */
  latex: z.string().min(1).max(400_000).optional(),
  templateId: z.string().trim().max(40).optional(),
  /** When set, force the heal path with this compile/validation error. */
  compilerError: z.string().trim().min(1).max(2000).optional(),
  /** When false, return a preview without writing latex/history. */
  commit: z.boolean().optional().default(true),
});

export type VibeEditStep = {
  index: number;
  total: number;
  message: string;
};

export type VibeEditSuccess = {
  ok: true;
  /** `review` returns advice without mutating LaTeX. */
  mode: "edit" | "review";
  resumeId: string;
  data_json: Record<string, unknown>;
  reply: string;
  review?: ResumeReview;
  tokensUsed: number;
  dailyTokensUsed: number;
  dailyTokensRemaining: number;
  elapsedMs: number;
  healed: boolean;
  steps: VibeEditStep[];
  /** Null when compile failed after a successful AI edit (latex still saved). */
  pdfBase64: string | null;
  pageCount: number | null;
  lockedToOnePage: boolean;
  compileWarning?: string;
};

export type VibeEditFailure = {
  ok: false;
  status: 400 | 401 | 404 | 429 | 500;
  error: string;
  code?:
    | "AI_DAILY_LIMIT"
    | "GROQ_BUSY"
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
 * AI latex is persisted even when PDF compile is unavailable.
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

  const {
    resumeId,
    prompt,
    compilerError,
    latex: clientLatex,
    templateId,
    commit,
  } = parsed.data;
  push("Reading your request…");

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

    push("Checking today’s AI quota…");

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

    const dataJson = asRecord(resume.data_json);
    if (clientLatex?.trim()) {
      dataJson.latex = clientLatex;
    }
    if (templateId && isResumeTemplateId(templateId)) {
      dataJson.template = templateId;
    }
    const job = getJobTargetFromDataJson(dataJson);
    const writingProfileNote = formatWritingProfileForPrompt(
      writingProfileFromMetadata(user.user_metadata),
    );

    // Review path: structured advice only — never mutates or recompiles.
    if (isResumeReviewPrompt(prompt)) {
      push("Reviewing resume against target role...");
      const targetRole =
        extractTargetRole(prompt) ?? (job ? `${job.role} @ ${job.company}` : null);
      const reviewResult = await invokeGroqResumeReview({
        prompt,
        dataJson,
        targetRole,
        writingProfileNote,
        jobContext: job
          ? {
              company: job.company,
              role: job.role,
              description: job.description,
            }
          : null,
      });

      const usage = isMockAiEnabled()
        ? await (async () => {
            try {
              return await incrementDailyAiTokens(user.id, reviewResult.totalTokens);
            } catch {
              return {
                used: reviewResult.totalTokens,
                remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - reviewResult.totalTokens),
                limit: DAILY_AI_TOKEN_LIMIT,
              };
            }
          })()
        : await incrementDailyAiTokens(user.id, reviewResult.totalTokens);

      push("Structured feedback ready — resume unchanged.");
      const pageCount =
        typeof dataJson.pageCount === "number" ? dataJson.pageCount : null;
      const reviewedDataJson: Record<string, unknown> = {
        ...dataJson,
        agent_thread: pushAgentTurns(
          parseAgentThread(dataJson.agent_thread),
          prompt,
          reviewResult.review.reply,
        ),
        last_ai_reply: reviewResult.review.reply,
        last_ai_prompt: prompt,
      };
      await supabase
        .from("resumes")
        .update({ data_json: reviewedDataJson as unknown as Json })
        .eq("id", resumeId)
        .eq("user_id", user.id);

      return {
        ok: true,
        mode: "review",
        resumeId: resume.id,
        data_json: reviewedDataJson,
        reply: reviewResult.review.reply,
        review: reviewResult.review,
        tokensUsed: reviewResult.totalTokens,
        dailyTokensUsed: usage.used,
        dailyTokensRemaining: usage.remaining,
        elapsedMs: Date.now() - started,
        healed: false,
        steps,
        pdfBase64: null,
        pageCount,
        lockedToOnePage: pageCount === 1,
      };
    }

    let healed = false;
    const groqResult = await invokeGroqVibeEdit({
      prompt,
      dataJson,
      healHint: compilerError,
      writingProfileNote,
      maxHealRetries: 2,
      onHeal: () => {
        healed = true;
      },
    });
    if (groqResult.healed) healed = true;

    const editedLatex = latexFromVibeOutput(groqResult.output);

    if (!editedLatex.trim()) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: "AI returned empty LaTeX.",
        steps,
      };
    }

    push("Updating the one-page preview…");

    let fittedLatex = editedLatex;
    let pdfBase64: string | null = null;
    let pageCount: number | null = null;
    let lockedToOnePage = false;
    let compileWarning: string | undefined;
    let layout: unknown = undefined;
    let fitElapsedMs = 0;

    try {
      const fit = await fitResumeToSinglePage(editedLatex, {
        allowGroqCondense: false,
      });
      fittedLatex = injectLaTeXConfig(editedLatex, fit.finalConfig);
      pdfBase64 = fit.compiledPdf.toString("base64");
      pageCount = fit.pageCount;
      lockedToOnePage = fit.lockedToOnePage;
      layout = fit.finalConfig;
      fitElapsedMs = fit.elapsedMs;
      if (commit) {
        await persistResumePdf(supabase, user.id, resumeId, fit.compiledPdf);
      }
    } catch (compileErr) {
      // Persist the AI edit even when TeX host is down — demo must not look broken.
      compileWarning = sanitizeCompileError(compileErr);
      push(`PDF compile skipped: ${compileWarning}`);
    }

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

    const prevData = dataJson;
    const modelData = asRecord(groqResult.output.data_json as Json);
    const prevVersion =
      typeof prevData.version === "number" && Number.isFinite(prevData.version)
        ? prevData.version
        : 0;
    const priorLatex =
      typeof prevData.latex === "string" ? prevData.latex : fittedLatex;
    // Snapshot the pre-edit state, then the post-edit tip for restore UX.
    const nextHistory = pushAiHistory(
      pushAiHistory(prevData.ai_history, {
        latex: priorLatex,
        reply:
          typeof prevData.last_ai_reply === "string" ? prevData.last_ai_reply : "",
        prompt:
          typeof prevData.last_ai_prompt === "string"
            ? prevData.last_ai_prompt
            : "",
        at: new Date().toISOString(),
      }),
      {
        latex: fittedLatex,
        reply: groqResult.output.reply,
        prompt,
        at: new Date().toISOString(),
      },
    );

    const nextDataJson: Record<string, unknown> = {
      ...prevData,
      latex: fittedLatex,
      version: prevVersion + 1,
      ai_history: nextHistory,
      agent_thread: pushAgentTurns(
        parseAgentThread(prevData.agent_thread),
        prompt,
        groqResult.output.reply,
      ),
      last_ai_reply: groqResult.output.reply,
      last_ai_prompt: prompt,
      template:
        (typeof prevData.template === "string" && prevData.template) ||
        (typeof modelData.template === "string" && modelData.template) ||
        "new-grad",
    };
    if (layout !== undefined) {
      nextDataJson.layout = layout;
    }
    if (pageCount != null) {
      nextDataJson.pageCount = pageCount;
    }

    if (commit) {
      const { data: updated, error: updateError } = await supabase
        .from("resumes")
        .update({
          data_json: nextDataJson as unknown as Json,
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
    }

    const elapsedMs = Date.now() - started;
    if (!compileWarning) {
      push(
        commit
          ? `PDF rendered successfully (${pageCount} page${pageCount === 1 ? "" : "s"}) in ${fitElapsedMs}ms.`
          : `Preview ready (${pageCount} page${pageCount === 1 ? "" : "s"}). Not saved yet.`,
      );
    }

    return {
      ok: true,
      mode: "edit",
      resumeId,
      data_json: nextDataJson,
      reply: groqResult.output.reply,
      tokensUsed: groqResult.totalTokens,
      dailyTokensUsed: usage.used,
      dailyTokensRemaining: usage.remaining,
      elapsedMs,
      healed,
      steps,
      pdfBase64,
      pageCount,
      lockedToOnePage,
      compileWarning,
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

    if (isGroqRateLimitError(err)) {
      return {
        ok: false,
        status: 429,
        code: "GROQ_BUSY",
        error: messageForGroqLimit(err),
        steps,
      };
    }

    const message = err instanceof Error ? err.message : "Unexpected server error";
    const network = /fetch failed|network|ECONNREFUSED|timeout/i.test(message);
    const compileRelated =
      /LATEX_COMPILE|latexonline|pdflatex|PDF compile|1-page lock/i.test(message);
    return {
      ok: false,
      status: 500,
      code: network ? "NETWORK" : "INTERNAL",
      error: compileRelated ? sanitizeCompileError(err) : message,
      resetHint: network
        ? "Network dropped mid-edit. Your current draft is intact — export .tex as a backup."
        : undefined,
      steps,
    };
  }
}
