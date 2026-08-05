"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { completeOnboardingAction } from "@/app/actions/onboarding";
import { signOutAction } from "@/app/actions/resumes";
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
import { createClient } from "@/lib/supabase/client";

export function OnboardingWizard({
  userId,
  afterSetup,
}: {
  userId: string;
  afterSetup?: string | null;
}) {
  const state = useOnboardingState(userId);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, startSignOut] = useTransition();

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

  function onSignOut() {
    startSignOut(async () => {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
        await signOutAction();
      } catch {
        /* still leave via hard nav */
      }
      toast.message("Signed out");
      window.location.assign("/login");
    });
  }

  if (!state.hydrated) {
    return (
      <div className="min-h-dvh bg-studio-bg">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="h-4 w-24 animate-pulse rounded bg-studio-canvas" />
          <div className="mt-6 h-10 w-2/3 animate-pulse rounded bg-studio-canvas" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-studio-canvas" />
        </div>
      </div>
    );
  }

  return (
    <OnboardingLayout
      step={state.step}
      canGoBack={state.step > 1}
      showSkip={showSkip}
      skipLabel={state.step === 1 ? "Skip setup" : "Skip"}
      skipDisabled={submitting}
      signOutPending={signingOut}
      onSignOut={onSignOut}
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
