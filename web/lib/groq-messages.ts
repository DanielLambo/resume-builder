export const GROQ_BUSY_MESSAGE =
  "The AI editor is at capacity. Wait about a minute and try again — your draft is unchanged.";

export const GROQ_TPM_MESSAGE =
  "That AI request was too large for the current burst limit. Try a smaller edit, or wait a minute — your draft is unchanged.";

export function looksLikeGroqLimitMessage(message: string): boolean {
  return /GROQ_RATE_LIMIT|HTTP 429|rate[_ ]limit|too many requests/i.test(message);
}
