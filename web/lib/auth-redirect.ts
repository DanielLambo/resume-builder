const ALLOWED_NEXT = [
  /^\/$/,
  /^\/dashboard(?:\/|$)/,
  /^\/editor(?:\/|$)/,
  /^\/onboarding(?:\/|$)/,
  /^\/reset-password(?:\/|$)/,
] as const;

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Allow only same-origin relative paths to known app routes.
 * Rejects protocol-relative (`//evil`), traversal (`..`), and open redirects.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next) return fallback;

  const decoded = decodeSafe(next).trim();
  if (!decoded.startsWith("/") || decoded.startsWith("//")) {
    return fallback;
  }
  if (decoded.includes("..") || decoded.includes("\\")) {
    return fallback;
  }
  // Strip query/hash for allowlist matching; preserve clean pathname only.
  const pathname = decoded.split(/[?#]/, 1)[0] ?? decoded;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return fallback;
  }
  if (pathname.includes("..")) {
    return fallback;
  }
  if (!ALLOWED_NEXT.some((re) => re.test(pathname))) {
    return fallback;
  }
  return pathname;
}
