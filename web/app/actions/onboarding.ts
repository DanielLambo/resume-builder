"use server";

import { revalidatePath } from "next/cache";

import { OnboardingDataSchema, type OnboardingData } from "@/lib/onboarding/schema";
import { createClient } from "@/lib/supabase/server";

export type CompleteOnboardingResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist onboarding profile onto the auth user metadata (no extra table).
 * Avoids storing avatar data URLs in metadata (too large) — color + names only.
 */
export async function completeOnboardingAction(
  raw: unknown,
): Promise<CompleteOnboardingResult> {
  const parsed = OnboardingDataSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid onboarding data",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Sign in to finish setup." };
  }

  const data: OnboardingData = parsed.data;
  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: data.fullName,
      display_name: data.displayName?.trim() || null,
      avatar_color: data.avatarColor,
      referral_source: data.referralSource ?? null,
      referral_other: data.referralOtherText?.trim() || null,
      job_types: data.jobTypes,
      target_fields: data.targetFields,
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/", "layout");
  return { ok: true };
}
