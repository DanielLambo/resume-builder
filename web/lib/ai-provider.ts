import { DEFAULT_GROQ_MODEL } from "@/lib/groq-model";

export type AiProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * Resolve an OpenAI-compatible chat Completions endpoint.
 *
 * Key aliases (first match wins): GROQ_API_KEY, OPENAI_API_KEY, AI_API_KEY
 * Base URL aliases: GROQ_BASE_URL, OPENAI_BASE_URL, AI_BASE_URL
 * Model: RESUMATE_MODEL (defaults to the Groq-oriented DEFAULT_GROQ_MODEL)
 *
 * Point base URL at any OpenAI-compatible provider (Groq, OpenAI, OpenRouter,
 * local Ollama/LM Studio shims, etc.) and set a matching model id.
 */
export function resolveAiProviderConfig(): AiProviderConfig {
  const apiKey =
    process.env.GROQ_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    throw new Error(
      "Missing AI API key. Set GROQ_API_KEY, OPENAI_API_KEY, or AI_API_KEY.",
    );
  }

  const baseUrl = (
    process.env.GROQ_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.AI_BASE_URL?.trim() ||
    "https://api.groq.com/openai"
  ).replace(/\/$/, "");

  const model =
    process.env.RESUMATE_MODEL?.trim() || DEFAULT_GROQ_MODEL;

  return { apiKey, baseUrl, model };
}

/** Optional key lookup for flows that skip AI when unset (e.g. page-lock condense). */
export function optionalAiApiKey(): string | undefined {
  const key =
    process.env.GROQ_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim() ||
    "";
  return key || undefined;
}

export function isAiCondenseDisabled(): boolean {
  return (
    process.env.DISABLE_AI_CONDENSE === "1" ||
    process.env.DISABLE_GROQ_CONDENSE === "1"
  );
}
