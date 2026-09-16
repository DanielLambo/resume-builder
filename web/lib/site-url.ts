/**
 * Canonical public origin for auth redirects (email confirm, OAuth).
 *
 * Supabase falls back to Dashboard → Auth → Site URL when redirectTo is
 * missing or not on the allow-list. Set NEXT_PUBLIC_SITE_URL to your stable
 * production origin (not localhost / preview URLs).
 */

function parseOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim().replace(/\/$/, ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    // Preview deploys look like <project>-<hash>-<team>.vercel.app
    return (
      host.endsWith(".vercel.app") &&
      /-[a-z0-9]+-[a-z0-9-]+\.vercel\.app$/i.test(host)
    );
  } catch {
    return false;
  }
}

/**
 * Stable non-localhost origin from env, if configured.
 * Used when email confirm accidentally lands on localhost.
 */
export function getCanonicalSiteOrigin(): string | null {
  const fromEnv = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromEnv && !isLocalhostOrigin(fromEnv)) return fromEnv;
  return null;
}

/**
 * Origin used for emailRedirectTo / OAuth redirectTo.
 * Prefers NEXT_PUBLIC_SITE_URL; falls back to the current browser origin
 * in local/preview contexts. No owner-specific production host is hardcoded.
 */
export function getSiteOrigin(): string {
  const canonical = getCanonicalSiteOrigin();
  if (canonical) return canonical;

  // Client-side: use the page origin (local dev, or a non-preview host).
  if (typeof window !== "undefined") {
    const browser = window.location.origin;
    if (isLocalhostOrigin(browser) || !isVercelPreviewOrigin(browser)) {
      return browser;
    }
  }

  // Server without NEXT_PUBLIC_SITE_URL — local default only.
  return "http://localhost:3000";
}

export function authCallbackUrl(nextPath: string): string {
  const origin = getSiteOrigin();
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  // Keep path-only next param; allow-list should include /auth/callback**
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
