"use client";

import { useState } from "react";
import { toast } from "sonner";

import { completeOnboardingAction } from "@/app/actions/onboarding";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { Step1Personal } from "@/components/onboarding/Step1Personal";
import { Step2Referral } from "@/components/onboarding/Step2Referral";
import { Step3Goals } from "@/components/onboarding/Step3Goals";
import { Step4Summary } from "@/components/onboarding/Step4Summary";
import {
  AFTER_SETUP_STORAGE_KEY,
  isSetupDestination,
  safeNextPath,
} from "@/lib/auth-next";
import { peekPendingImport } from "@/lib/import/pending";
import {
  ONBOARDING_DONE_KEY,
  ONBOARDING_STORAGE_KEY,
} from "@/lib/onboarding/schema";
import { useOnboardingState } from "@/lib/onboarding/useOnboardingState";
import { STUDIO_TOUR_PENDING_KEY } from "@/lib/studio-tour";

export function OnboardingWizard({
  userId,
  afterSetup,
}: {
  userId: string;
  afterSetup?: string | null;
}) {
  const state = useOnboardingState(userId);
  const [submitting, setSubmitting] = useState(false);

  async function complete(override?: Partial<typeof state.data>) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const fullNameRaw = (override?.fullName ?? state.data.fullName).trim();
      const payload = {
        ...state.data,
        ...override,
        fullName: fullNameRaw.length >= 2 ? fullNameRaw : "Friend",
      };
      if (payload.referralSource === "other" && !payload.referralOtherText?.trim()) {
        payload.referralSource = undefined;
        payload.referralOtherText = "";
      }

      const result = await completeOnboardingAction(payload);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      try {
        window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
        window.localStorage.removeItem(`${ONBOARDING_STORAGE_KEY}:${userId}`);
        window.localStorage.setItem(STUDIO_TOUR_PENDING_KEY, "1");
      } catch {
        /* ignore */
      }

      let dest = "/dashboard?tour=1";
      try {
        const hasImport = await peekPendingImport();
        if (hasImport) {
          dest = "/import?autostart=1";
        } else {
          const stored = window.sessionStorage.getItem(AFTER_SETUP_STORAGE_KEY);
          window.sessionStorage.removeItem(AFTER_SETUP_STORAGE_KEY);
          dest = safeNextPath(afterSetup ?? stored, "/dashboard?tour=1");
          if (dest === "/dashboard" || isSetupDestination(dest)) {
            dest = "/dashboard?tour=1";
          }
        }
      } catch {
        /* keep default */
      }

      toast.success("Welcome to Resumate");
      window.location.assign(dest);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish setup");
    } finally {
      setSubmitting(false);
    }
  }

  const showSkip = state.step === 1 || state.step === 2 || state.step === 3;

  return (
    <OnboardingLayout
      step={state.step}
      canGoBack={state.step > 1}
      showSkip={showSkip}
      skipLabel={state.step === 1 ? "Skip setup" : "Skip"}
      skipDisabled={submitting}
      onBack={state.back}
      onSkip={() => {
        if (state.step === 1) {
          void complete({ fullName: state.data.fullName.trim() || "Friend" });
          return;
        }
        if (
          state.step === 2 &&
          state.data.referralSource === "other" &&
          !state.data.referralOtherText?.trim()
        ) {
          state.patch({ referralSource: undefined, referralOtherText: "" });
        }
        state.next();
      }}
    >
      <div key={state.step}>
        {state.step === 1 ? (
          <Step1Personal
            data={state.data}
            onChange={state.patch}
            onContinue={state.next}
            canContinue={state.step1Valid}
          />
        ) : null}
        {state.step === 2 ? (
          <Step2Referral
            data={state.data}
            onChange={state.patch}
            onContinue={state.next}
            canContinue={state.step2Valid}
          />
        ) : null}
        {state.step === 3 ? (
          <Step3Goals
            data={state.data}
            onChange={state.patch}
            onContinue={state.next}
          />
        ) : null}
        {state.step === 4 ? (
          <Step4Summary
            data={state.data}
            submitting={submitting}
            onEdit={state.goTo}
            onComplete={() => {
              void complete();
            }}
          />
        ) : null}
      </div>
    </OnboardingLayout>
  );
}
