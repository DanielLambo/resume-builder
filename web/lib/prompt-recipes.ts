import { FORMAT_CONSISTENCY_PROMPT } from "@/lib/format-resume";

export type PromptRecipeKind = "layout" | "rewrite" | "review";
export type PromptRecipeScope = "document" | "selection-or-document";

export type PromptRecipe = {
  id: string;
  label: string;
  kind: PromptRecipeKind;
  scope: PromptRecipeScope;
  hint: string;
  prompt: string;
};

export const RECIPE_KIND_LABEL: Record<PromptRecipeKind, string> = {
  layout: "Layout",
  rewrite: "Rewrite",
  review: "Review",
};

/**
 * Guided AI entry points. Labels stay short; hints explain scope + effect.
 */
export const PROMPT_RECIPES: readonly PromptRecipe[] = [
  {
    id: "format",
    label: "House style",
    kind: "layout",
    scope: "document",
    hint: "Whole resume · dates, bullets, and headers only. Facts stay put.",
    prompt: FORMAT_CONSISTENCY_PROMPT,
  },
  {
    id: "tighten",
    label: "Tighten bullets",
    kind: "layout",
    scope: "selection-or-document",
    hint: "Uses your highlight if one is selected; otherwise Experience and Projects.",
    prompt:
      "Tighten Experience and Projects bullets for one-page density. Keep employers, titles, dates, tools, and real metrics. Prefer sharp verbs and drop filler.",
  },
  {
    id: "one-page",
    label: "Fit to one page",
    kind: "layout",
    scope: "document",
    hint: "Whole resume · compress wording. Does not invent experience.",
    prompt:
      "Fit this resume to one page by compressing weak bullets and densifying wording. Keep employers, titles, dates, tools, and real numbers. Do not invent experience.",
  },
  {
    id: "humanize",
    label: "Humanize voice",
    kind: "rewrite",
    scope: "selection-or-document",
    hint: "Highlighted text or whole resume · remove buzzwords, keep every fact.",
    prompt:
      "Humanize the voice. Kill ChatGPT buzzwords and ', resulting in N%' cadence. Keep every fact. Sound like a sharp engineer wrote it.",
  },
  {
    id: "metrics",
    label: "Improve metrics",
    kind: "rewrite",
    scope: "selection-or-document",
    hint: "Highlighted text or whole resume · rephrase existing numbers only.",
    prompt:
      "Improve how existing numbers are written. Keep the same figures. Where impact is implied but no number exists, use [X%] / [N users] — never invent precise fakes.",
  },
  {
    id: "review-swe",
    label: "Review for SWE intern",
    kind: "review",
    scope: "document",
    hint: "Whole resume · advice only. Source is not changed.",
    prompt: "Review my resume for SWE intern",
  },
] as const;

export function getPromptRecipe(id: string): PromptRecipe | undefined {
  return PROMPT_RECIPES.find((recipe) => recipe.id === id);
}
