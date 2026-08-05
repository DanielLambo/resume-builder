type OnboardingUser = {
  user_metadata?: {
    onboarding_completed?: unknown;
    onboarding_required?: unknown;
  } | null;
} | null | undefined;

/**
 * Wizard is signup-only. Login never enters setup unless this account was
 * flagged at createUser time and has not finished yet.
 */
export function metadataNeedsOnboarding(user: OnboardingUser): boolean {
  const meta = user?.user_metadata ?? {};
  if (meta.onboarding_completed === true) return false;
  return meta.onboarding_required === true;
}
