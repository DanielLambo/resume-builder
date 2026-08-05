"use client";

import { OptionCard } from "@/components/onboarding/OptionCard";
import { REFERRAL_OPTIONS } from "@/lib/onboarding/options";
import type { OnboardingData, ReferralSource } from "@/lib/onboarding/schema";

type Step2ReferralProps = {
  data: OnboardingData;
  onChange: (partial: Partial<OnboardingData>) => void;
  onContinue: () => void;
  canContinue: boolean;
};

export function Step2Referral({
  data,
  onChange,
  onContinue,
  canContinue,
}: Step2ReferralProps) {
  function select(id: ReferralSource) {
    onChange({
      referralSource: id,
      referralOtherText: id === "other" ? data.referralOtherText : "",
    });
  }

  const showOther = data.referralSource === "other";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-studio-ink sm:text-4xl">
          How did you hear about us?
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-studio-muted sm:text-base">
          Optional — skip if you’d rather jump in.
        </p>
      </header>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Referral source"
      >
        {REFERRAL_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.id}
            label={opt.label}
            description={opt.description}
            icon={opt.icon}
            selected={data.referralSource === opt.id}
            onSelect={() => select(opt.id)}
          />
        ))}
      </div>

      {showOther ? (
        <label className="grid gap-1.5 pt-1">
          <span className="text-xs font-medium text-studio-muted">
            Please specify
          </span>
          <input
            className="rounded-xl border border-studio-border bg-white px-3.5 py-3 text-sm text-studio-ink outline-none focus:ring-2 focus:ring-studio-vermilion"
            value={data.referralOtherText ?? ""}
            onChange={(e) => onChange({ referralOtherText: e.target.value })}
            placeholder="Newsletter, campus career fair…"
          />
        </label>
      ) : null}

      <button
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
        className="w-full rounded-xl bg-studio-vermilion px-4 py-3 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[180px]"
      >
        Continue
      </button>
    </div>
  );
}
