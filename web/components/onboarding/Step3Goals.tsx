"use client";

import { Check } from "lucide-react";

import { OptionCard } from "@/components/onboarding/OptionCard";
import { FIELD_OPTIONS, JOB_TYPE_OPTIONS } from "@/lib/onboarding/options";
import type { JobType, OnboardingData, TargetField } from "@/lib/onboarding/schema";

type Step3GoalsProps = {
  data: OnboardingData;
  onChange: (partial: Partial<OnboardingData>) => void;
  onContinue: () => void;
};

function toggle<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function Step3Goals({ data, onChange, onContinue }: Step3GoalsProps) {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-studio-ink sm:text-4xl">
          What opportunities are you looking for?
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-studio-muted sm:text-base">
          Select all that apply so we can tune the desk for your next move.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Job types
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {JOB_TYPE_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              label={opt.label}
              icon={opt.icon}
              multi
              selected={data.jobTypes.includes(opt.id)}
              onSelect={() =>
                onChange({ jobTypes: toggle(data.jobTypes, opt.id as JobType) })
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          Role / field{" "}
          <span className="normal-case tracking-normal text-studio-muted/70">
            (optional)
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {FIELD_OPTIONS.map((opt) => {
            const selected = data.targetFields.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({
                    targetFields: toggle(data.targetFields, opt.id as TargetField),
                  })
                }
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-vermilion",
                  selected
                    ? "border-studio-vermilion bg-studio-vermilion/10 text-studio-ink"
                    : "border-studio-border bg-studio-paper text-studio-muted",
                ].join(" ")}
              >
                {selected ? <Check className="h-3 w-3 text-studio-vermilion" /> : null}
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-xl bg-studio-vermilion px-4 py-3 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover sm:w-auto sm:min-w-[180px]"
      >
        Continue
      </button>
    </div>
  );
}
