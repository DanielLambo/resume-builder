import {
  fitToSinglePage,
  getPDFPageCount,
  type FitToSinglePageResult,
  type LaTeXLayoutConfig,
} from "@resumate/one-page-lock";

import { isAiCondenseDisabled, optionalAiApiKey } from "@/lib/ai-provider";
import { compileLatexRemote } from "@/lib/compile-latex";

export type FitResumeResult = FitToSinglePageResult & {
  pageCount: number;
  lockedToOnePage: boolean;
  elapsedMs: number;
};

/** Full 1-page lock budget (binary search + optional AI condense). */
export const FIT_TIMEOUT_MS = Number(process.env.ONE_PAGE_LOCK_TIMEOUT_MS ?? 28_000);

export type FitResumeOptions = {
  /**
   * When true, overflow may send full LaTeX to the configured AI provider
   * for bullet condense. Keep false for preview/compile; enable only for
   * explicit AI flows.
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
  const allowAi =
    options.allowGroqCondense === true && !isAiCondenseDisabled();

  const result = await fitToSinglePage(rawTex, {
    compile: compileLatexRemote,
    timeoutMs: FIT_TIMEOUT_MS,
    maxSpacingIterations: 4,
    // Empty key skips AI condense inside one-page-lock (no PII egress).
    groqApiKey: allowAi
      ? (options.groqApiKey ?? optionalAiApiKey())
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
