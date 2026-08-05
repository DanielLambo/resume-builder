"use client";

import { PROMPT_RECIPES } from "@/lib/prompt-recipes";

type PromptRecipesProps = {
  disabled?: boolean;
  onPick: (prompt: string, recipeId: string) => void;
};

const KIND_PILL: Record<string, string> = {
  layout:
    "border-studio-border bg-studio-paper text-studio-muted hover:border-studio-ink/30 hover:text-studio-ink",
  rewrite:
    "border-amber-200 bg-amber-50/70 text-amber-950 hover:border-amber-400",
  review:
    "border-emerald-200 bg-emerald-50/70 text-emerald-950 hover:border-emerald-400",
};

/** Single horizontal strip — no stacked category headers. */
export function PromptRecipes({ disabled, onPick }: PromptRecipesProps) {
  return (
    <div
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="prompt-recipes"
      aria-label="Suggested edits"
    >
      {PROMPT_RECIPES.map((recipe) => (
        <button
          key={recipe.id}
          type="button"
          disabled={disabled}
          title={recipe.hint}
          data-testid={`prompt-recipe-${recipe.id}`}
          onClick={() => onPick(recipe.prompt, recipe.id)}
          className={[
            "shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] transition disabled:opacity-45",
            KIND_PILL[recipe.kind] ?? KIND_PILL.layout,
          ].join(" ")}
        >
          {recipe.label}
        </button>
      ))}
    </div>
  );
}
