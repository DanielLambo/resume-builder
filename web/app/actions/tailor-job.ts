"use server";

import { injectLaTeXConfig } from "@resumate/one-page-lock";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { sanitizeCompileError } from "@/lib/compile-latex";
import { fitResumeToSinglePage } from "@/lib/fit-resume";
import { invokeGroqVibeEdit } from "@/lib/groq";
import {
  asDataRecord,
  buildTailorJobPrompt,
  formatJobResumeTitle,
  JobTargetSchema,
} from "@/lib/job-target";
import { isMockAiEnabled } from "@/lib/mock-ai";
import { persistResumePdf } from "@/lib/persist-resume-pdf";
import {
  AiRateLimitError,
  assertWithinDailyAiLimit,
  DAILY_AI_TOKEN_LIMIT,
  incrementDailyAiTokens,
  rateLimitExceededPayload,
} from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

const TailorJobInputSchema = z.object({
  sourceResumeId: z.string().uuid(),
  company: JobTargetSchema.shape.company,
  role: JobTargetSchema.shape.role,
  jobDescription: JobTargetSchema.shape.description,
});

export type TailorJobResult =
  | {
      ok: true;
      id: string;
      title: string;
      tokensUsed: number;
      dailyTokensUsed: number;
      compileWarning?: string;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      code?: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND" | "AI_DAILY_LIMIT" | "INTERNAL";
      used?: number;
      limit?: number;
    };

/**
 * Duplicate a base resume into a job-specific variant, stash the JD on the row,
 * and run a tailored vibe edit. Compile is best-effort so AI still lands.
 */
export async function tailorResumeForJobAction(
  rawInput: unknown,
): Promise<TailorJobResult> {
  const parsed = TailorJobInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid job tailor input.",
    };
  }

  const { sourceResumeId, company, role, jobDescription } = parsed.data;
  const job = {
    company,
    role,
    description: jobDescription,
    createdAt: new Date().toISOString(),
  };
  const title = formatJobResumeTitle(job);

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
        error: "Sign in to tailor a resume for a job.",
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

    const { data: source, error: loadError } = await supabase
      .from("resumes")
      .select("id, user_id, data_json")
      .eq("id", sourceResumeId)
      .maybeSingle();

    if (loadError) {
      return { ok: false, status: 500, code: "INTERNAL", error: loadError.message };
    }
    if (!source || source.user_id !== user.id) {
      return { ok: false, status: 404, code: "NOT_FOUND", error: "Resume not found." };
    }

    const sourceData = asDataRecord(source.data_json);
    const seedData: Record<string, unknown> = {
      ...sourceData,
      job,
      version:
        typeof sourceData.version === "number" ? sourceData.version + 1 : 1,
    };

    const { data: created, error: insertError } = await supabase
      .from("resumes")
      .insert({
        user_id: user.id,
        title,
        data_json: seedData as unknown as Json,
      })
      .select("id, data_json")
      .single();

    if (insertError || !created) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: insertError?.message ?? "Could not create job variant.",
      };
    }

    const groqResult = await invokeGroqVibeEdit({
      prompt: buildTailorJobPrompt(job),
      dataJson: asDataRecord(created.data_json),
      maxHealRetries: 2,
    });

    const editedLatex =
      typeof groqResult.output.data_json.latex === "string"
        ? groqResult.output.data_json.latex
        : "";

    if (!editedLatex.trim()) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        error: "AI returned empty LaTeX for this job tailor.",
      };
    }

    let fittedLatex = editedLatex;
    let compileWarning: string | undefined;
    let layout: unknown;
    let pageCount: number | undefined;

    try {
      const fit = await fitResumeToSinglePage(editedLatex, {
        allowGroqCondense: true,
      });
      fittedLatex = injectLaTeXConfig(editedLatex, fit.finalConfig);
      layout = fit.finalConfig;
      pageCount = fit.pageCount;
      await persistResumePdf(supabase, user.id, created.id, fit.compiledPdf);
    } catch (compileErr) {
      compileWarning = sanitizeCompileError(compileErr);
    }

    const usage = await incrementDailyAiTokens(user.id, groqResult.totalTokens).catch(
      () => ({
        used: groqResult.totalTokens,
        remaining: Math.max(0, DAILY_AI_TOKEN_LIMIT - groqResult.totalTokens),
        limit: DAILY_AI_TOKEN_LIMIT,
      }),
    );

    const modelData = asDataRecord(groqResult.output.data_json as Json);
    const nextData: Record<string, unknown> = {
      ...asDataRecord(created.data_json),
      ...modelData,
      latex: fittedLatex,
      job,
      template:
        (typeof sourceData.template === "string" && sourceData.template) ||
        (typeof modelData.template === "string" && modelData.template) ||
        "new-grad",
    };
    if (layout !== undefined) nextData.layout = layout;
    if (pageCount != null) nextData.pageCount = pageCount;

    const { error: updateError } = await supabase
      .from("resumes")
      .update({
        title,
        data_json: nextData as unknown as Json,
      })
      .eq("id", created.id)
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
    revalidatePath(`/editor/${created.id}`);

    return {
      ok: true,
      id: created.id,
      title,
      tokensUsed: groqResult.totalTokens,
      dailyTokensUsed: usage.used,
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
      };
    }
    const message = err instanceof Error ? err.message : "Could not tailor resume.";
    return { ok: false, status: 500, code: "INTERNAL", error: message };
  }
}
