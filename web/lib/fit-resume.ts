import {
  fitToSinglePage,
  getPDFPageCount,
  type FitToSinglePageResult,
  type LaTeXLayoutConfig,
} from "@resumate/one-page-lock";

import { compileLatexRemote } from "@/lib/compile-latex";

export type FitResumeResult = FitToSinglePageResult & {
  pageCount: number;
  lockedToOnePage: boolean;
  elapsedMs: number;
};

/** Full 1-page lock budget (binary search + optional Groq condense). */
export const FIT_TIMEOUT_MS = Number(process.env.ONE_PAGE_LOCK_TIMEOUT_MS ?? 28_000);

export type FitResumeOptions = {
  /**
   * When true, overflow may send full LaTeX to Groq for bullet condense.
   * Keep false for preview/compile; enable only for explicit AI flows.
   */
  allowGroqCondense?: boolean;
  groqApiKey?: string;
};

/**
 * Run the real `@resumate/one-page-lock` binary-search pipeline with a
 * serverless-safe compile adapter.
 */
export async function fitResumeToSinglePage(
  rawTex: string,
  options: FitResumeOptions = {},
): Promise<FitResumeResult> {
  const started = Date.now();
  const allowGroq =
    options.allowGroqCondense === true &&
    process.env.DISABLE_GROQ_CONDENSE !== "1";

  const result = await fitToSinglePage(rawTex, {
    compile: compileLatexRemote,
    timeoutMs: FIT_TIMEOUT_MS,
    maxSpacingIterations: 4,
    // Empty key skips Groq condense inside one-page-lock (no PII egress).
    groqApiKey: allowGroq
      ? (options.groqApiKey ?? process.env.GROQ_API_KEY)
      : "",
  });

  const pageCount = await getPDFPageCount(result.compiledPdf);
  return {
    ...result,
    pageCount,
    lockedToOnePage: pageCount === 1,
    elapsedMs: Date.now() - started,
  };
}

export type { LaTeXLayoutConfig };
