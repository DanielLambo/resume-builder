const ALLOWED_NEXT = [
  /^\/$/,
  /^\/dashboard(?:\/|$)/,
  /^\/editor(?:\/|$)/,
  /^\/onboarding(?:\/|$)/,
] as const;

/**
 * Allow only same-origin relative paths to known app routes.
 * Rejects protocol-relative (`//evil`) and open redirects.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  if (!ALLOWED_NEXT.some((re) => re.test(next))) {
    return fallback;
  }
  return next;
}
