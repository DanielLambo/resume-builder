"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_ONBOARDING,
  ONBOARDING_STORAGE_KEY,
  OnboardingFieldsSchema,
  type OnboardingData,
} from "@/lib/onboarding/schema";

export type OnboardingStep = 1 | 2 | 3 | 4;

export function useOnboardingState(userId: string) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [data, setData] = useState<OnboardingData>(DEFAULT_ONBOARDING);
  const [hydrated, setHydrated] = useState(false);
  const storageKey = `${ONBOARDING_STORAGE_KEY}:${userId}`;

  useEffect(() => {
    try {
      const scoped = window.localStorage.getItem(storageKey);
      const legacy = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      const raw = scoped ?? legacy;
      if (raw) {
        const parsed = OnboardingFieldsSchema.partial().safeParse(JSON.parse(raw));
        if (parsed.success) {
          setData({ ...DEFAULT_ONBOARDING, ...parsed.data });
        }
      }
      if (legacy && !scoped) {
        window.localStorage.setItem(storageKey, legacy);
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback((next: OnboardingData) => {
    setData(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }, [storageKey]);

  const patch = useCallback(
    (partial: Partial<OnboardingData>) => {
      persist({ ...data, ...partial });
    },
    [data, persist],
  );

  const goTo = useCallback(
    (next: OnboardingStep) => {
      setDirection(next > step ? 1 : -1);
      setStep(next);
    },
    [step],
  );

  const next = useCallback(() => {
    if (step < 4) goTo((step + 1) as OnboardingStep);
  }, [goTo, step]);

  const back = useCallback(() => {
    if (step > 1) goTo((step - 1) as OnboardingStep);
  }, [goTo, step]);

  const step1Valid = useMemo(() => {
    const result = OnboardingFieldsSchema.pick({ fullName: true }).safeParse({
      fullName: data.fullName,
    });
    return result.success;
  }, [data.fullName]);

  const step2Valid = useMemo(() => {
    if (!data.referralSource) return false;
    if (data.referralSource === "other" && !data.referralOtherText?.trim()) {
      return false;
    }
    return true;
  }, [data.referralOtherText, data.referralSource]);

  return {
    step,
    direction,
    data,
    hydrated,
    patch,
    persist,
    goTo,
    next,
    back,
    step1Valid,
    step2Valid,
  };
}

export type OnboardingState = ReturnType<typeof useOnboardingState>;
