export type PromptRecipe = {
  id: string;
  label: string;
  /** Prompt text inserted into the composer / submitted. */
  prompt: string;
};

/**
 * Guided AI entry points — ChatGPT-style suggested prompts.
 * Keep labels short; prompts must be clear enough to run as-is.
 */
export const PROMPT_RECIPES: readonly PromptRecipe[] = [
  {
    id: "tighten",
    label: "Tighten bullets",
    prompt:
      "Tighten Experience and Projects bullets for one-page density. Keep employers, titles, dates, tools, and real metrics. Prefer sharp verbs and drop filler.",
  },
  {
    id: "review-swe",
    label: "Review for SWE intern",
    prompt: "Review my resume for SWE intern",
  },
  {
    id: "humanize",
    label: "Humanize voice",
    prompt:
      "Humanize the voice. Kill ChatGPT buzzwords and ', resulting in N%' cadence. Keep every fact. Sound like a sharp engineer wrote it.",
  },
  {
    id: "metrics",
    label: "Improve metrics",
    prompt:
      "Improve how existing numbers are written. Keep the same figures. Where impact is implied but no number exists, use [X%] / [N users] — never invent precise fakes.",
  },
  {
    id: "one-page",
    label: "Fit to one page",
    prompt:
      "Fit this resume to one page by compressing weak bullets and densifying wording. Keep employers, titles, dates, tools, and real numbers. Do not invent experience.",
  },
] as const;

export function getPromptRecipe(id: string): PromptRecipe | undefined {
  return PROMPT_RECIPES.find((recipe) => recipe.id === id);
}
