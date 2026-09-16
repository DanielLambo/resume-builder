/** Default Groq chat model. llama-3.3-70b-versatile shuts down 2026-08-16. */
const DEPRECATED_GROQ_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
]);

const requestedModel = process.env.RESUMATE_MODEL?.trim();
export const DEFAULT_GROQ_MODEL =
  requestedModel && !DEPRECATED_GROQ_MODELS.has(requestedModel)
    ? requestedModel
    : "openai/gpt-oss-20b";

export type GroqLimitKind = "tokens" | "requests" | "unknown";

export class GroqRateLimitError extends Error {
  readonly status = 429 as const;
  readonly retryAfterMs: number | null;
  readonly kind: GroqLimitKind;
  readonly detail: string;

  constructor(
    retryAfterMs: number | null = null,
    kind: GroqLimitKind = "unknown",
    detail = "",
  ) {
    super("GROQ_RATE_LIMIT");
    this.name = "GroqRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.kind = kind;
    this.detail = detail;
  }
}

export function isGroqRateLimitError(err: unknown): err is GroqRateLimitError {
  if (err instanceof GroqRateLimitError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /GROQ_RATE_LIMIT|HTTP 429|rate_limit_exceeded/i.test(message);
}

export const GROQ_BUSY_MESSAGE =
  "The AI editor is at capacity. Wait about a minute and try again — your draft is unchanged.";

export const GROQ_TPM_MESSAGE =
  "That AI request was too large for the current burst limit. Try a smaller edit, or wait a minute — your draft is unchanged.";

export function messageForGroqLimit(err: unknown): string {
  if (err instanceof GroqRateLimitError && err.kind === "tokens") {
    return GROQ_TPM_MESSAGE;
  }
  return GROQ_BUSY_MESSAGE;
}

export function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, seconds * 1000);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(30_000, Math.max(0, date - Date.now()));
  }
  return null;
}

type GroqErrorBody = {
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

export async function throwIfGroqFailed(response: Response): Promise<void> {
  if (response.ok) return;

  let detail = "";
  let code = "";
  let type = "";
  try {
    const body = (await response.json()) as GroqErrorBody;
    detail = body.error?.message?.trim() || "";
    code = body.error?.code?.trim() || "";
    type = body.error?.type?.trim() || "";
  } catch {
    /* ignore non-JSON error bodies */
  }

  const rateLimited =
    response.status === 429 || code === "rate_limit_exceeded" || /rate limit/i.test(detail);
  if (rateLimited) {
    const kind: GroqLimitKind = type === "tokens" || /tokens per minute|TPM/i.test(detail)
      ? "tokens"
      : "requests";
    throw new GroqRateLimitError(parseRetryAfterMs(response), kind, detail);
  }

  throw new Error(detail || `AI API error (HTTP ${response.status})`);
}
