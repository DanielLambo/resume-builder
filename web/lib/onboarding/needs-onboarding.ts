type OnboardingUser = {
  user_metadata?: {
    onboarding_completed?: unknown;
    onboarding_required?: unknown;
  } | null;
} | null | undefined;

/**
 * True when createUser flagged this account for the signup wizard and it
 * has not been completed. Used by `/onboarding` to decide whether to show
 * the wizard vs bounce to the product — login / middleware never force it.
 */
export function metadataNeedsOnboarding(user: OnboardingUser): boolean {
  const meta = user?.user_metadata ?? {};
  if (meta.onboarding_completed === true) return false;
  return meta.onboarding_required === true;
}
