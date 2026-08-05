/** Stash a post-onboarding destination across the setup wizard. */
export const AFTER_SETUP_STORAGE_KEY = "resumate:after_setup";

/** Brief httpOnly flag so dashboard doesn't bounce before the JWT refreshes. */
export const SETUP_DONE_COOKIE = "resumate_setup_done";

const ALLOWED_NEXT = [
  /^\/$/,
  /^\/dashboard(?:\/|$|\?)/,
  /^\/editor(?:\/|$|\?)/,
  /^\/onboarding(?:\/|$|\?)/,
  /^\/import(?:\/|$|\?)/,
] as const;

export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  if (!ALLOWED_NEXT.some((re) => re.test(next))) {
    return fallback;
  }
  return next;
}

/** Same allow-list as `safeNextPath`, or null when the value is missing/unsafe. */
export function trySafeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const resolved = safeNextPath(next, "");
  return resolved || null;
}

export function isSetupDestination(path: string): boolean {
  return path === "/onboarding" || path.startsWith("/onboarding?");
}

/** Send unfinished accounts through setup without dropping a deep link. */
export function onboardingPathWithNext(next: string | null | undefined): string {
  const safe = trySafeNextPath(next);
  if (!safe || isSetupDestination(safe) || safe === "/dashboard") {
    return "/onboarding";
  }
  return `/onboarding?next=${encodeURIComponent(safe)}`;
}
