"use client";

import { PROMPT_RECIPES } from "@/lib/prompt-recipes";

type PromptRecipesProps = {
  disabled?: boolean;
  onPick: (prompt: string, recipeId: string) => void;
};

export function PromptRecipes({ disabled, onPick }: PromptRecipesProps) {
  return (
    <div
      className="mb-2 flex flex-wrap gap-1.5"
      data-testid="prompt-recipes"
      aria-label="Suggested prompts"
    >
      {PROMPT_RECIPES.map((recipe) => (
        <button
          key={recipe.id}
          type="button"
          disabled={disabled}
          data-testid={`prompt-recipe-${recipe.id}`}
          onClick={() => onPick(recipe.prompt, recipe.id)}
          className={[
            "min-h-8 rounded-full border px-2.5 py-1 text-[0.7rem] transition disabled:opacity-45",
            "border-studio-border bg-studio-paper text-studio-muted hover:border-studio-ink/25 hover:text-studio-ink",
          ].join(" ")}
        >
          {recipe.label}
        </button>
      ))}
    </div>
  );
}
