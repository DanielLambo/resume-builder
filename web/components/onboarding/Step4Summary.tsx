"use client";

import { Pencil } from "lucide-react";

import {
  labelForReferral,
  labelsForFields,
  labelsForJobTypes,
} from "@/lib/onboarding/options";
import type { OnboardingData } from "@/lib/onboarding/schema";
import type { OnboardingStep } from "@/lib/onboarding/useOnboardingState";

type Step4SummaryProps = {
  data: OnboardingData;
  submitting: boolean;
  onEdit: (step: OnboardingStep) => void;
  onComplete: () => void;
};

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-studio-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="font-mono text-[0.65rem] uppercase tracking-wide text-studio-muted">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium text-studio-ink">{value}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-xs text-studio-muted transition hover:bg-studio-canvas hover:text-studio-ink"
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
        Edit
      </button>
    </div>
  );
}

export function Step4Summary({
  data,
  submitting,
  onEdit,
  onComplete,
}: Step4SummaryProps) {
  const display = data.displayName?.trim() || data.fullName.split(/\s+/)[0] || "—";
  const referral =
    data.referralSource === "other" && data.referralOtherText?.trim()
      ? data.referralOtherText.trim()
      : labelForReferral(data.referralSource);
  const goals =
    labelsForJobTypes(data.jobTypes).join(", ") || "None selected (you can explore)";
  const fields =
    labelsForFields(data.targetFields).join(", ") || "Open to many fields";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-studio-ink sm:text-4xl">
          You&apos;re all set! Ready to dive in?
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-studio-muted sm:text-base">
          Review your information and complete setup to open your library.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-studio-border bg-studio-paper shadow-paper-sheet">
        <div className="flex items-center gap-4 border-b border-studio-border bg-studio-canvas/50 px-5 py-4">
          <div
            className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-studio-border text-lg font-semibold text-white"
            style={{ backgroundColor: data.avatarUrl ? undefined : data.avatarColor }}
          >
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              display.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-studio-ink">{data.fullName}</p>
            <p className="text-sm text-studio-muted">Goes by {display}</p>
          </div>
        </div>
        <div className="px-5">
          <SummaryRow label="Referral" value={referral} onEdit={() => onEdit(2)} />
          <SummaryRow label="Opportunities" value={goals} onEdit={() => onEdit(3)} />
          <SummaryRow label="Fields" value={fields} onEdit={() => onEdit(3)} />
          <SummaryRow
            label="Profile"
            value={data.fullName}
            onEdit={() => onEdit(1)}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={onComplete}
        className="w-full rounded-xl bg-studio-vermilion px-4 py-3 text-sm font-semibold text-white transition hover:bg-studio-vermilion-hover disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
      >
        {submitting ? "Finishing…" : "Complete setup"}
      </button>
    </div>
  );
}
