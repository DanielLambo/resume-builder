"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

type OptionCardProps = {
  label: string;
  description?: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
};

export function OptionCard({
  label,
  description,
  icon: Icon,
  selected,
  onSelect,
  multi = false,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        "group relative flex w-full items-start gap-3 rounded-xl border bg-studio-paper p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-vermilion",
        selected
          ? "border-studio-vermilion shadow-sm ring-1 ring-studio-vermilion/30"
          : "border-studio-border shadow-sm",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
          selected
            ? "border-studio-vermilion/40 bg-studio-vermilion/10 text-studio-vermilion"
            : "border-studio-border bg-studio-canvas text-studio-ink",
        ].join(" ")}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-studio-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-studio-muted">{description}</span>
        ) : null}
      </span>
      <span
        className={[
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
          selected
            ? "border-studio-vermilion bg-studio-vermilion text-white"
            : "border-studio-border bg-white text-transparent",
        ].join(" ")}
        aria-hidden="true"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  );
}
