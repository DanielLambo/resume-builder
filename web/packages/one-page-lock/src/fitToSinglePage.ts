import { condenseBulletsWithGroq } from "./condenseBullets.js";
import { compileLatexWithPdflatex } from "./compileLatex.js";
import { getPDFPageCount } from "./getPDFPageCount.js";
import {
  configAtTightness,
  injectLaTeXConfig,
} from "./injectLaTeXConfig.js";
import { sanitizeLatex } from "./sanitize.js";
import {
  DEFAULT_LAYOUT_CONFIG,
  MAX_TIGHT_LAYOUT_CONFIG,
  type CompileLatexFn,
  type FitToSinglePageOptions,
  type FitToSinglePageResult,
  type LaTeXLayoutConfig,
} from "./schema.js";

class PipelineTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineTimeoutError";
  }
}

type AttemptSuccess = {
  ok: true;
  pdf: Buffer;
  config: LaTeXLayoutConfig;
  pageCount: number;
  tex: string;
};

type AttemptFailure = {
  ok: false;
  error: string;
  config: LaTeXLayoutConfig;
};

type AttemptResult = AttemptSuccess | AttemptFailure;

function remainingMs(startedAt: number, timeoutMs: number): number {
  return Math.max(0, timeoutMs - (Date.now() - startedAt));
}

function assertTimeLeft(startedAt: number, timeoutMs: number): void {
  if (Date.now() - startedAt >= timeoutMs) {
    throw new PipelineTimeoutError(
      `1-page lock timed out after ${timeoutMs}ms`,
    );
  }
}

async function compileAttempt(
  rawTex: string,
  config: LaTeXLayoutConfig,
  compile: CompileLatexFn,
  logger: Pick<Console, "warn" | "error" | "info">,
): Promise<AttemptResult> {
  const injected = injectLaTeXConfig(rawTex, config);
  const sanitized = sanitizeLatex(injected);
  if (!sanitized.ok) {
    logger.warn(`[one-page-lock] sanitize blocked: ${sanitized.error}`);
    return { ok: false, error: sanitized.error, config };
  }

  try {
    const pdf = await compile(sanitized.content);
    const pageCount = await getPDFPageCount(pdf);
    return {
      ok: true,
      pdf,
      config,
      pageCount,
      tex: sanitized.content,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[one-page-lock] compile failed: ${message}`);
    return { ok: false, error: message, config };
  }
}

/**
 * 1-Page Lock auto-fitting engine.
 *
 * 1. Compile with default spacing.
 * 2. If already 1 page, return.
 * 3. Up to 4 binary-search iterations on a tightness axis (list gaps → leading → margins).
 * 4. If still overflow, Groq micro-condenses bullets, then final compile.
 *
 * On compile errors, reverts to the last valid PDF + config. Hard timeout defaults to 5s.
 */
export async function fitToSinglePage(
  rawTex: string,
  options: FitToSinglePageOptions = {},
): Promise<FitToSinglePageResult> {
  const compile = options.compile ?? compileLatexWithPdflatex;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxSpacingIterations = options.maxSpacingIterations ?? 4;
  const logger = options.logger ?? console;
  const startedAt = Date.now();

  if (!rawTex.trim()) {
    throw new Error("rawTex is empty");
  }

  let workingTex = rawTex;
  const state: { lastValid: AttemptSuccess | null } = { lastValid: null };

  const tryConfig = async (config: LaTeXLayoutConfig): Promise<AttemptResult> => {
    assertTimeLeft(startedAt, timeoutMs);
    const result = await compileAttempt(workingTex, config, compile, logger);
    assertTimeLeft(startedAt, timeoutMs);
    if (result.ok) {
      state.lastValid = result;
    }
    return result;
  };

  // Step 1 — default layout
  const initial = await tryConfig(DEFAULT_LAYOUT_CONFIG);
  if (initial.ok && initial.pageCount === 1) {
    return {
      compiledPdf: initial.pdf,
      finalConfig: initial.config,
    };
  }

  // Step 3 — binary search on tightness ∈ (0, 1]
  let low = 0;
  let high = 1;
  let bestFit: AttemptSuccess | null =
    initial.ok && initial.pageCount === 1 ? initial : null;

  for (let i = 0; i < maxSpacingIterations; i += 1) {
    assertTimeLeft(startedAt, timeoutMs);
    const mid = (low + high) / 2;
    const config = configAtTightness(
      mid,
      DEFAULT_LAYOUT_CONFIG,
      MAX_TIGHT_LAYOUT_CONFIG,
    );
    const attempt = await tryConfig(config);

    if (!attempt.ok) {
      // Keep searching toward looser side if mid failed; do not explode.
      high = mid;
      continue;
    }

    if (attempt.pageCount === 1) {
      bestFit = attempt;
      high = mid; // seek less aggressive spacing that still fits
    } else {
      low = mid; // need tighter
    }
  }

  if (bestFit) {
    return {
      compiledPdf: bestFit.pdf,
      finalConfig: bestFit.config,
    };
  }

  // Ensure we evaluated the tightest end if binary search never hit pageCount===1
  assertTimeLeft(startedAt, timeoutMs);
  const tightAttempt = await tryConfig(MAX_TIGHT_LAYOUT_CONFIG);
  if (tightAttempt.ok && tightAttempt.pageCount === 1) {
    return {
      compiledPdf: tightAttempt.pdf,
      finalConfig: tightAttempt.config,
    };
  }

  // Step 4 — Groq micro-condense, then final compile with tightest valid config
  const apiKey =
    options.groqApiKey ??
    process.env.GROQ_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "";

  const spacingConfig: LaTeXLayoutConfig =
    (tightAttempt.ok ? tightAttempt.config : null) ??
    state.lastValid?.config ??
    MAX_TIGHT_LAYOUT_CONFIG;

  if (apiKey) {
    try {
      assertTimeLeft(startedAt, timeoutMs);
      const condensed = await condenseBulletsWithGroq(workingTex, {
        apiKey,
        baseUrl: options.groqBaseUrl ?? process.env.GROQ_BASE_URL,
        model: options.model ?? "llama-3.3-70b-versatile",
        timeoutMs: Math.min(4_000, remainingMs(startedAt, timeoutMs) || 1),
      });
      workingTex = condensed.latex;
      const afterAi = await tryConfig(spacingConfig);
      if (afterAi.ok) {
        return {
          compiledPdf: afterAi.pdf,
          finalConfig: afterAi.config,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[one-page-lock] Groq condense skipped: ${message}`);
    }
  } else {
    logger.info("[one-page-lock] GROQ_API_KEY missing; skipped bullet condense");
  }

  if (state.lastValid) {
    logger.warn(
      `[one-page-lock] could not lock to 1 page (last pageCount=${state.lastValid.pageCount}); returning last valid PDF`,
    );
    return {
      compiledPdf: state.lastValid.pdf,
      finalConfig: state.lastValid.config,
    };
  }

  throw new Error(
    "1-page lock failed: no successful compilation in the adjustment pipeline",
  );
}
