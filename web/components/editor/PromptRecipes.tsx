"use client";

import {
  PROMPT_RECIPES,
  RECIPE_KIND_LABEL,
  type PromptRecipeKind,
} from "@/lib/prompt-recipes";

type PromptRecipesProps = {
  disabled?: boolean;
  onPick: (prompt: string, recipeId: string) => void;
};

const KIND_ORDER: PromptRecipeKind[] = ["layout", "rewrite", "review"];

const KIND_PILL: Record<PromptRecipeKind, string> = {
  layout:
    "border-slate-300 bg-white text-studio-muted hover:border-studio-ink/30 hover:text-studio-ink",
  rewrite:
    "border-amber-300/80 bg-amber-50 text-amber-950 hover:border-amber-500/70",
  review:
    "border-emerald-300/80 bg-emerald-50 text-emerald-950 hover:border-emerald-500/70",
};

export function PromptRecipes({ disabled, onPick }: PromptRecipesProps) {
  return (
    <div className="space-y-2" data-testid="prompt-recipes" aria-label="Suggested edits">
      {KIND_ORDER.map((kind) => {
        const recipes = PROMPT_RECIPES.filter((recipe) => recipe.kind === kind);
        if (recipes.length === 0) return null;
        return (
          <div key={kind} className="space-y-1">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-studio-muted">
              {RECIPE_KIND_LABEL[kind]}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  disabled={disabled}
                  title={recipe.hint}
                  data-testid={`prompt-recipe-${recipe.id}`}
                  onClick={() => onPick(recipe.prompt, recipe.id)}
                  className={[
                    "min-h-8 rounded-full border px-2.5 py-1 text-[0.7rem] transition disabled:opacity-45",
                    KIND_PILL[kind],
                  ].join(" ")}
                >
                  {recipe.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
