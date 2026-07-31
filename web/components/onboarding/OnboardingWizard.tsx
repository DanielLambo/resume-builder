"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { completeOnboardingAction } from "@/app/actions/onboarding";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { Step1Personal } from "@/components/onboarding/Step1Personal";
import { Step2Referral } from "@/components/onboarding/Step2Referral";
import { Step3Goals } from "@/components/onboarding/Step3Goals";
import { Step4Summary } from "@/components/onboarding/Step4Summary";
import {
  ONBOARDING_DONE_KEY,
  ONBOARDING_STORAGE_KEY,
} from "@/lib/onboarding/schema";
import { useOnboardingState } from "@/lib/onboarding/useOnboardingState";

export function OnboardingWizard() {
  const router = useRouter();
  const state = useOnboardingState();
  const [submitting, setSubmitting] = useState(false);

  async function complete() {
    setSubmitting(true);
    try {
      const result = await completeOnboardingAction(state.data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      try {
        window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      try {
        const { default: confetti } = await import("canvas-confetti");
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.7 },
          colors: ["#C44B3B", "#2F3A33", "#E8E4DC", "#1A1A1A"],
        });
      } catch {
        /* confetti is optional polish */
      }
      toast.success("Welcome to Typesetter");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish setup");
    } finally {
      setSubmitting(false);
    }
  }

  const showSkip = state.step === 2 || state.step === 3;

  return (
    <OnboardingLayout
      step={state.step}
      canGoBack={state.step > 1}
      showSkip={showSkip}
      onBack={state.back}
      onSkip={state.next}
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
            onComplete={complete}
          />
        ) : null}
      </div>
    </OnboardingLayout>
  );
}
