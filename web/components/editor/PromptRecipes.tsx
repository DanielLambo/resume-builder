"use client";

import {
  AlignLeft,
  Crosshair,
  Maximize2,
  MessageSquareText,
  Sparkles,
  Type,
} from "lucide-react";

import { PROMPT_RECIPES } from "@/lib/prompt-recipes";

type PromptRecipesProps = {
  disabled?: boolean;
  onPick: (prompt: string, recipeId: string) => void;
};

const RECIPE_ICON: Record<string, typeof AlignLeft> = {
  format: Type,
  tighten: AlignLeft,
  "one-page": Maximize2,
  humanize: Sparkles,
  metrics: Crosshair,
  "review-swe": MessageSquareText,
};

/** Single compact row — never stacks into half the viewport. */
export function PromptRecipes({ disabled, onPick }: PromptRecipesProps) {
  return (
    <div
      className="-mx-0.5 flex gap-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="prompt-recipes"
      aria-label="Suggested edits"
    >
      {PROMPT_RECIPES.map((recipe) => {
        const Icon = RECIPE_ICON[recipe.id] ?? AlignLeft;
        return (
          <button
            key={recipe.id}
            type="button"
            disabled={disabled}
            title={recipe.hint}
            data-testid={`prompt-recipe-${recipe.id}`}
            onClick={() => onPick(recipe.prompt, recipe.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.68rem] text-ide-muted transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-40"
          >
            <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
            {recipe.label}
          </button>
        );
      })}
    </div>
  );
}
