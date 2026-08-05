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

export class GroqRateLimitError extends Error {
  readonly status = 429 as const;
  readonly retryAfterMs: number | null;

  constructor(retryAfterMs: number | null = null) {
    super("GROQ_RATE_LIMIT");
    this.name = "GroqRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isGroqRateLimitError(err: unknown): err is GroqRateLimitError {
  if (err instanceof GroqRateLimitError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /GROQ_RATE_LIMIT|HTTP 429/i.test(message);
}

export const GROQ_BUSY_MESSAGE =
  "The AI editor is at capacity. Wait about a minute and try again — your draft is unchanged.";

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

export function throwIfGroqFailed(response: Response): void {
  if (response.ok) return;
  if (response.status === 429) {
    throw new GroqRateLimitError(parseRetryAfterMs(response));
  }
  throw new Error(`Groq API error (HTTP ${response.status})`);
}
